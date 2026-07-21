import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.core.config import get_settings
from app.db.beanie import init_odm
from app.db.mongo import close_mongo, connect_mongo
from app.modules.auth.security import hash_refresh_token
from app.modules.auth.service import (
    FirstAdminAlreadyExistsError,
    create_first_admin,
)


def login(
    client: TestClient,
    identifier: str,
    password: str,
):
    return client.post(
        "/api/v1/auth/login",
        json={
            "identifier": identifier,
            "password": password,
        },
    )


def replace_refresh_cookie(
    client: TestClient,
    value: str,
) -> None:
    settings = get_settings()

    existing_cookie = next(
        cookie for cookie in client.cookies.jar if cookie.name == settings.refresh_cookie_name
    )

    client.cookies.set(
        settings.refresh_cookie_name,
        value,
        domain=existing_cookie.domain,
        path=existing_cookie.path,
    )


def test_cookie_auth_flow_and_csrf(seeded_client):
    client, identities = seeded_client
    settings = get_settings()

    response = login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    assert response.status_code == 204
    assert response.content == b""

    cookie_headers = response.headers.get_list("set-cookie")

    access_header = next(
        value for value in cookie_headers if value.startswith(f"{settings.access_cookie_name}=")
    )
    refresh_header = next(
        value for value in cookie_headers if value.startswith(f"{settings.refresh_cookie_name}=")
    )
    csrf_header = next(
        value for value in cookie_headers if value.startswith(f"{settings.csrf_cookie_name}=")
    )

    assert "HttpOnly" in access_header
    assert "HttpOnly" in refresh_header
    assert "HttpOnly" not in csrf_header

    me_response = client.get("/api/v1/auth/me")

    assert me_response.status_code == 200
    assert me_response.json()["username"] == "admin"
    assert me_response.json()["role"] == "OWNER"
    assert me_response.json()["school_id"] is None
    assert set(me_response.json()["permissions"]) == {
        "schools.manage",
        "school_users.manage",
        "school_groups.manage",
        "menus.manage",
        "recipes.manage",
        "recipes.view",
    }

    refresh_without_csrf = client.post("/api/v1/auth/refresh")

    assert refresh_without_csrf.status_code == 403

    refresh_with_wrong_csrf = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": "wrong-token"},
    )

    assert refresh_with_wrong_csrf.status_code == 403

    old_refresh_token = client.cookies.get(settings.refresh_cookie_name)
    old_csrf_token = client.cookies.get(settings.csrf_cookie_name)

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": old_csrf_token},
    )

    assert refresh_response.status_code == 204
    assert client.cookies.get(settings.refresh_cookie_name) != old_refresh_token
    assert client.cookies.get(settings.csrf_cookie_name) != old_csrf_token

    logout_without_csrf = client.post("/api/v1/auth/logout")

    assert logout_without_csrf.status_code == 403

    current_csrf_token = client.cookies.get(settings.csrf_cookie_name)

    logout_response = client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": current_csrf_token},
    )

    assert logout_response.status_code == 204
    assert client.cookies.get(settings.access_cookie_name) is None
    assert client.cookies.get(settings.refresh_cookie_name) is None
    assert client.cookies.get(settings.csrf_cookie_name) is None
    assert client.get("/api/v1/auth/me").status_code == 401


def test_login_accepts_email(seeded_client):
    client, identities = seeded_client

    response = login(
        client,
        str(identities.admin.email),
        identities.admin_password,
    )

    assert response.status_code == 204


def test_invalid_credentials_are_rejected(seeded_client):
    client, identities = seeded_client

    response = login(
        client,
        identities.admin.username,
        "incorrect-password",
    )

    assert response.status_code == 401


def test_inactive_school_user_cannot_login(seeded_client):
    client, identities = seeded_client

    response = login(
        client,
        identities.inactive_school_user.username,
        identities.inactive_school_user_password,
    )

    assert response.status_code == 401


def test_recent_refresh_token_reuse_preserves_replacement_session(seeded_client):
    client, identities = seeded_client
    settings = get_settings()

    login_response = login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    assert login_response.status_code == 204

    old_refresh_token = client.cookies.get(settings.refresh_cookie_name)
    csrf_token = client.cookies.get(settings.csrf_cookie_name)

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert refresh_response.status_code == 204

    current_refresh_token = client.cookies.get(settings.refresh_cookie_name)
    current_csrf_token = client.cookies.get(settings.csrf_cookie_name)

    replace_refresh_cookie(client, old_refresh_token)

    reuse_response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": current_csrf_token},
    )

    assert reuse_response.status_code == 401

    replace_refresh_cookie(client, current_refresh_token)

    replacement_response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": current_csrf_token},
    )

    assert replacement_response.status_code == 204


def test_refresh_token_reuse_after_grace_revokes_family(seeded_client):
    client, identities = seeded_client
    settings = get_settings()

    login_response = login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    assert login_response.status_code == 204

    old_refresh_token = client.cookies.get(settings.refresh_cookie_name)
    csrf_token = client.cookies.get(settings.csrf_cookie_name)

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert refresh_response.status_code == 204

    current_refresh_token = client.cookies.get(settings.refresh_cookie_name)
    current_csrf_token = client.cookies.get(settings.csrf_cookie_name)

    mongo_client = MongoClient(settings.mongo_uri, tz_aware=True)

    try:
        mongo_client[settings.mongo_db]["refresh_sessions"].update_one(
            {
                "token_hash": hash_refresh_token(
                    old_refresh_token,
                    settings=settings,
                )
            },
            {
                "$set": {
                    "revoked_at": datetime.now(UTC)
                    - timedelta(seconds=settings.refresh_reuse_grace_seconds + 1)
                }
            },
        )
    finally:
        mongo_client.close()

    replace_refresh_cookie(client, old_refresh_token)

    reuse_response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": current_csrf_token},
    )

    assert reuse_response.status_code == 401

    replace_refresh_cookie(client, current_refresh_token)

    compromised_family_response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": current_csrf_token},
    )

    assert compromised_family_response.status_code == 401


def test_import_preview_requires_authentication_and_csrf(seeded_client):
    client, identities = seeded_client
    settings = get_settings()
    files = {
        "file": (
            "dish-cards.txt",
            b"not-an-xlsx",
            "text/plain",
        )
    }

    unauthenticated_response = client.post(
        "/api/v1/menus/weekly/import-preview?meal_type=lunch",
        files=files,
    )

    assert unauthenticated_response.status_code == 401

    login_response = login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    assert login_response.status_code == 204

    missing_csrf_response = client.post(
        "/api/v1/menus/weekly/import-preview?meal_type=lunch",
        files=files,
    )

    assert missing_csrf_response.status_code == 403

    csrf_token = client.cookies.get(settings.csrf_cookie_name)
    authenticated_response = client.post(
        "/api/v1/menus/weekly/import-preview?meal_type=lunch",
        files=files,
        headers={"X-CSRF-Token": csrf_token},
    )

    assert authenticated_response.status_code == 400


def test_first_admin_cannot_be_created_twice(identities):
    async def attempt_second_admin() -> None:
        await connect_mongo()

        try:
            await init_odm()

            with pytest.raises(FirstAdminAlreadyExistsError):
                await create_first_admin(
                    username="second-admin",
                    email="second-admin@example.com",
                    password="second-admin-password",
                )
        finally:
            await close_mongo()

    asyncio.run(attempt_second_admin())
