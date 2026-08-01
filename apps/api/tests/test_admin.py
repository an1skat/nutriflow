import pytest
from beanie import PydanticObjectId
from fastapi.testclient import TestClient

from app.core.config import get_settings


def login(
    client: TestClient,
    identifier: str,
    password: str,
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": identifier,
            "password": password,
        },
    )

    assert response.status_code == 204


def csrf_headers(client: TestClient) -> dict[str, str]:
    settings = get_settings()
    csrf_token = client.cookies.get(settings.csrf_cookie_name)

    assert csrf_token is not None

    return {"X-CSRF-Token": csrf_token}


def test_admin_can_create_school_and_school_user(seeded_client):
    client, identities = seeded_client
    new_user_password = "new-school-password-123"

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    school_response = client.post(
        "/api/v1/admin/schools",
        json={
            "name": "New School",
        },
        headers=csrf_headers(client),
    )

    assert school_response.status_code == 201

    school_data = school_response.json()

    assert school_data["name"] == "New School"
    assert school_data["is_active"] is True

    user_response = client.post(
        f"/api/v1/admin/schools/{school_data['id']}/users",
        json={
            "username": "new.school.user",
            "email": "new.school.user@example.com",
            "password": new_user_password,
        },
        headers=csrf_headers(client),
    )

    assert user_response.status_code == 201

    user_data = user_response.json()

    assert user_data["username"] == "new.school.user"
    assert user_data["email"] == "new.school.user@example.com"
    assert user_data["role"] == "SCHOOL_USER"
    assert user_data["school_id"] == school_data["id"]
    assert user_data["is_active"] is True
    assert "password" not in user_data
    assert "password_hash" not in user_data

    login(
        client,
        "new.school.user",
        new_user_password,
    )

    me_response = client.get("/api/v1/auth/me")

    assert me_response.status_code == 200
    assert me_response.json()["username"] == "new.school.user"
    assert me_response.json()["school_id"] == school_data["id"]


def test_lower_admin_sees_and_manages_only_owned_schools(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.lower_admin.username,
        identities.lower_admin_password,
    )

    list_response = client.get("/api/v1/admin/schools")

    assert list_response.status_code == 200
    school_ids = {item["id"] for item in list_response.json()["items"]}
    assert str(identities.own_school.id) in school_ids
    assert str(identities.other_school.id) not in school_ids

    other_school_response = client.get(f"/api/v1/admin/schools/{identities.other_school.id}")

    assert other_school_response.status_code == 403

    school_response = client.post(
        "/api/v1/admin/schools",
        json={
            "name": "Lower Admin School",
        },
        headers=csrf_headers(client),
    )

    assert school_response.status_code == 201
    assert school_response.json()["admin_owner_id"] == str(identities.lower_admin.id)

    user_response = client.post(
        f"/api/v1/admin/schools/{school_response.json()['id']}/users",
        json={
            "username": "lower.school.user",
            "email": "lower.school.user@example.com",
            "password": "lower-school-user-password",
        },
        headers=csrf_headers(client),
    )

    assert user_response.status_code == 201

    forbidden_user_response = client.post(
        f"/api/v1/admin/schools/{identities.other_school.id}/users",
        json={
            "username": "forbidden.school.user",
            "email": "forbidden.school.user@example.com",
            "password": "forbidden-school-user-password",
        },
        headers=csrf_headers(client),
    )

    assert forbidden_user_response.status_code == 403


def test_owner_can_create_lower_admin(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    response = client.post(
        "/api/v1/admin/admins",
        json={
            "username": "new.lower.admin",
            "email": "new.lower.admin@example.com",
            "password": "new-lower-admin-password",
            "permissions": [
                "schools.manage",
                "school_users.manage",
                "menus.manage",
            ],
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["role"] == "ADMIN"
    assert data["permissions"] == [
        "schools.manage",
        "school_users.manage",
        "menus.manage",
    ]


def test_lower_admin_cannot_create_lower_admin(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.lower_admin.username,
        identities.lower_admin_password,
    )

    response = client.post(
        "/api/v1/admin/admins",
        json={
            "username": "blocked.lower.admin",
            "email": "blocked.lower.admin@example.com",
            "password": "blocked-lower-admin-password",
            "permissions": ["schools.manage"],
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 403


def test_admin_endpoint_requires_authentication(seeded_client):
    client, _ = seeded_client

    response = client.post(
        "/api/v1/admin/schools",
        json={
            "name": "Forbidden School",
        },
    )

    assert response.status_code == 401


def test_admin_endpoint_requires_csrf(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    response = client.post(
        "/api/v1/admin/schools",
        json={
            "name": "Missing CSRF School",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF validation failed"


def test_school_user_cannot_create_school(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.school_user.username,
        identities.school_user_password,
    )

    response = client.post(
        "/api/v1/admin/schools",
        json={
            "name": "Unauthorized School",
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


@pytest.mark.parametrize(
    ("username", "email"),
    [
        ("school.user", "unique@example.com"),
        ("unique.user", "school.user@example.com"),
    ],
)
def test_duplicate_school_user_returns_conflict(
    seeded_client,
    username,
    email,
):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    response = client.post(
        f"/api/v1/admin/schools/{identities.other_school.id}/users",
        json={
            "username": username,
            "email": email,
            "password": "duplicate-password-123",
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 409


def test_missing_school_returns_not_found(seeded_client):
    client, identities = seeded_client
    missing_school_id = PydanticObjectId()

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    response = client.post(
        f"/api/v1/admin/schools/{missing_school_id}/users",
        json={
            "username": "missing.school.user",
            "email": None,
            "password": "missing-school-password",
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 404


def test_inactive_school_rejects_new_users(seeded_client):
    client, identities = seeded_client
    inactive_school_id = identities.inactive_school_user.school_id

    assert inactive_school_id is not None

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    response = client.post(
        f"/api/v1/admin/schools/{inactive_school_id}/users",
        json={
            "username": "inactive.school.new-user",
            "email": None,
            "password": "inactive-school-password",
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 409
