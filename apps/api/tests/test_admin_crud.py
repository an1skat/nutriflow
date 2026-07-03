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
    csrf_token = client.cookies.get(get_settings().csrf_cookie_name)
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token}


def capture_auth_cookies(client: TestClient) -> dict[str, str]:
    settings = get_settings()
    names = (
        settings.access_cookie_name,
        settings.refresh_cookie_name,
        settings.csrf_cookie_name,
    )
    cookies: dict[str, str] = {}

    for name in names:
        value = client.cookies.get(name)
        assert value is not None
        cookies[name] = value

    return cookies


def restore_auth_cookies(
    client: TestClient,
    values: dict[str, str],
) -> None:
    for name, value in values.items():
        existing_cookie = next(cookie for cookie in client.cookies.jar if cookie.name == name)
        client.cookies.set(
            name,
            value,
            domain=existing_cookie.domain,
            path=existing_cookie.path,
        )


def test_admin_can_list_get_and_update_schools(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    list_response = client.get("/api/v1/admin/schools")

    assert list_response.status_code == 200
    assert list_response.json()["total"] == 3
    assert len(list_response.json()["items"]) == 3

    update_response = client.patch(
        f"/api/v1/admin/schools/{identities.other_school.id}",
        json={
            "name": "Updated School",
            "code": "updated-code",
        },
        headers=csrf_headers(client),
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Updated School"
    assert update_response.json()["code"] == "UPDATED-CODE"

    get_response = client.get(f"/api/v1/admin/schools/{identities.other_school.id}")

    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Updated School"


def test_school_soft_delete_revokes_school_sessions(seeded_client):
    client, identities = seeded_client
    settings = get_settings()

    login(
        client,
        identities.school_user.username,
        identities.school_user_password,
    )
    school_user_cookies = capture_auth_cookies(client)

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    delete_response = client.delete(
        f"/api/v1/admin/schools/{identities.own_school.id}",
        headers=csrf_headers(client),
    )

    assert delete_response.status_code == 204

    repeated_delete_response = client.delete(
        f"/api/v1/admin/schools/{identities.own_school.id}",
        headers=csrf_headers(client),
    )

    assert repeated_delete_response.status_code == 204
    assert client.get(f"/api/v1/admin/schools/{identities.own_school.id}").status_code == 404

    default_list = client.get("/api/v1/admin/schools").json()
    deleted_list = client.get(
        "/api/v1/admin/schools",
        params={"include_deleted": True},
    ).json()

    assert all(item["id"] != str(identities.own_school.id) for item in default_list["items"])
    archived_school = next(
        item for item in deleted_list["items"] if item["id"] == str(identities.own_school.id)
    )
    assert archived_school["is_active"] is False
    assert archived_school["deleted_at"] is not None

    restore_auth_cookies(client, school_user_cookies)

    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh",
            headers={"X-CSRF-Token": school_user_cookies[settings.csrf_cookie_name]},
        ).status_code
        == 401
    )


def test_admin_can_list_get_and_update_school_users(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    list_response = client.get(f"/api/v1/admin/schools/{identities.own_school.id}/users")

    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    update_response = client.patch(
        (f"/api/v1/admin/schools/{identities.own_school.id}/users/{identities.school_user.id}"),
        json={
            "username": "updated.school.user",
            "email": None,
        },
        headers=csrf_headers(client),
    )

    assert update_response.status_code == 200
    assert update_response.json()["username"] == "updated.school.user"
    assert update_response.json()["email"] is None

    get_response = client.get(
        f"/api/v1/admin/schools/{identities.own_school.id}/users/{identities.school_user.id}"
    )

    assert get_response.status_code == 200
    assert get_response.json()["username"] == "updated.school.user"


def test_user_deactivation_and_reactivation(seeded_client):
    client, identities = seeded_client
    user_url = f"/api/v1/admin/schools/{identities.own_school.id}/users/{identities.school_user.id}"

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    deactivate_response = client.patch(
        user_url,
        json={"is_active": False},
        headers=csrf_headers(client),
    )

    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False

    failed_login = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": identities.school_user.username,
            "password": identities.school_user_password,
        },
    )

    assert failed_login.status_code == 401

    reactivate_response = client.patch(
        user_url,
        json={"is_active": True},
        headers=csrf_headers(client),
    )

    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["is_active"] is True

    login(
        client,
        identities.school_user.username,
        identities.school_user_password,
    )


def test_password_reset_invalidates_existing_tokens(seeded_client):
    client, identities = seeded_client
    settings = get_settings()
    new_password = "reset-school-password-123"

    login(
        client,
        identities.school_user.username,
        identities.school_user_password,
    )
    old_cookies = capture_auth_cookies(client)

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    reset_response = client.post(
        (
            f"/api/v1/admin/schools/{identities.own_school.id}"
            f"/users/{identities.school_user.id}/reset-password"
        ),
        json={"password": new_password},
        headers=csrf_headers(client),
    )

    assert reset_response.status_code == 204

    restore_auth_cookies(client, old_cookies)

    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh",
            headers={"X-CSRF-Token": old_cookies[settings.csrf_cookie_name]},
        ).status_code
        == 401
    )

    login(
        client,
        identities.school_user.username,
        new_password,
    )


def test_school_user_soft_delete_is_idempotent(seeded_client):
    client, identities = seeded_client
    user_url = f"/api/v1/admin/schools/{identities.own_school.id}/users/{identities.school_user.id}"
    users_url = f"/api/v1/admin/schools/{identities.own_school.id}/users"

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    assert (
        client.delete(
            user_url,
            headers=csrf_headers(client),
        ).status_code
        == 204
    )
    assert (
        client.delete(
            user_url,
            headers=csrf_headers(client),
        ).status_code
        == 204
    )
    assert client.get(user_url).status_code == 404

    default_list = client.get(users_url).json()
    deleted_list = client.get(
        users_url,
        params={"include_deleted": True},
    ).json()

    assert default_list["total"] == 0
    assert deleted_list["total"] == 1
    assert deleted_list["items"][0]["deleted_at"] is not None

    failed_login = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": identities.school_user.username,
            "password": identities.school_user_password,
        },
    )

    assert failed_login.status_code == 401


def test_school_user_path_cannot_reference_another_school(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    response = client.get(
        f"/api/v1/admin/schools/{identities.other_school.id}/users/{identities.school_user.id}"
    )

    assert response.status_code == 404


def test_empty_patch_payload_is_rejected(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    school_response = client.patch(
        f"/api/v1/admin/schools/{identities.own_school.id}",
        json={},
        headers=csrf_headers(client),
    )
    user_response = client.patch(
        (f"/api/v1/admin/schools/{identities.own_school.id}/users/{identities.school_user.id}"),
        json={},
        headers=csrf_headers(client),
    )

    assert school_response.status_code == 422
    assert user_response.status_code == 422
