from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.core.config import get_settings

COMMUNITY = "obukhivska"


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
        },
        headers=csrf_headers(client),
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Updated School"

    get_response = client.get(f"/api/v1/admin/schools/{identities.other_school.id}")

    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Updated School"


def test_admin_can_create_update_and_clear_school_community(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    create_response = client.post(
        "/api/v1/admin/schools",
        json={
            "name": "Community School",
            "community": COMMUNITY,
        },
        headers=csrf_headers(client),
    )

    assert create_response.status_code == 201
    assert create_response.json()["community"] == COMMUNITY

    update_response = client.patch(
        f"/api/v1/admin/schools/{identities.other_school.id}",
        json={"community": COMMUNITY},
        headers=csrf_headers(client),
    )

    assert update_response.status_code == 200
    assert update_response.json()["community"] == COMMUNITY

    clear_response = client.patch(
        f"/api/v1/admin/schools/{identities.other_school.id}",
        json={"community": None},
        headers=csrf_headers(client),
    )

    assert clear_response.status_code == 200
    assert clear_response.json()["community"] is None


def test_school_list_filters_and_sorts_by_community(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    for school_id in (identities.own_school.id, identities.other_school.id):
        response = client.patch(
            f"/api/v1/admin/schools/{school_id}",
            json={"community": COMMUNITY},
            headers=csrf_headers(client),
        )
        assert response.status_code == 200

    filtered_response = client.get(f"/api/v1/admin/schools?community={COMMUNITY}")

    assert filtered_response.status_code == 200
    assert filtered_response.json()["total"] == 2
    assert {item["id"] for item in filtered_response.json()["items"]} == {
        str(identities.own_school.id),
        str(identities.other_school.id),
    }

    sorted_response = client.get("/api/v1/admin/schools?sort_by=community")

    assert sorted_response.status_code == 200
    assert [item["name"] for item in sorted_response.json()["items"]] == [
        "Inactive School",
        "Other School",
        "Own School",
    ]


def test_school_community_is_validated_and_scoped_to_lower_admin(seeded_client):
    client, identities = seeded_client

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )

    for school_id in (identities.own_school.id, identities.other_school.id):
        response = client.patch(
            f"/api/v1/admin/schools/{school_id}",
            json={"community": COMMUNITY},
            headers=csrf_headers(client),
        )
        assert response.status_code == 200

    invalid_response = client.patch(
        f"/api/v1/admin/schools/{identities.own_school.id}",
        json={"community": "unknown-community"},
        headers=csrf_headers(client),
    )

    assert invalid_response.status_code == 422

    login(
        client,
        identities.lower_admin.username,
        identities.lower_admin_password,
    )
    response = client.get(f"/api/v1/admin/schools?community={COMMUNITY}")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert [item["id"] for item in response.json()["items"]] == [str(identities.own_school.id)]


def test_school_deactivation_preserves_data_and_revokes_sessions(seeded_client):
    client, identities = seeded_client
    settings = get_settings()
    mongo_client = MongoClient(settings.mongo_uri, tz_aware=True)
    try:
        mongo_client[settings.mongo_db]["menu_change_requests"].insert_one(
            {
                "school_id": identities.own_school.id,
                "marker": "preserve-on-deactivate",
            }
        )
    finally:
        mongo_client.close()

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

    deactivate_response = client.patch(
        f"/api/v1/admin/schools/{identities.own_school.id}",
        json={"is_active": False},
        headers=csrf_headers(client),
    )

    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False
    delete_response = client.request(
        "DELETE",
        f"/api/v1/admin/schools/{identities.own_school.id}",
    )

    assert delete_response.status_code == 405

    school_list = client.get("/api/v1/admin/schools").json()

    assert any(item["id"] == str(identities.own_school.id) for item in school_list["items"])

    mongo_client = MongoClient(settings.mongo_uri, tz_aware=True)

    try:
        database = mongo_client[settings.mongo_db]
        assert database["schools"].count_documents({"_id": identities.own_school.id}) == 1
        assert database["users"].count_documents({"school_id": identities.own_school.id}) == 1
        assert (
            database["menu_change_requests"].count_documents(
                {"school_id": identities.own_school.id}
            )
            == 1
        )
        assert (
            database["refresh_sessions"].count_documents({"user_id": identities.school_user.id})
            == 1
        )
    finally:
        mongo_client.close()

    restore_auth_cookies(client, school_user_cookies)

    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh",
            headers={"X-CSRF-Token": school_user_cookies[settings.csrf_cookie_name]},
        ).status_code
        == 401
    )

    login(
        client,
        identities.admin.username,
        identities.admin_password,
    )
    reactivate_response = client.patch(
        f"/api/v1/admin/schools/{identities.own_school.id}",
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


def test_school_user_hard_delete_removes_sessions(seeded_client):
    client, identities = seeded_client
    settings = get_settings()
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
        == 404
    )
    assert client.get(user_url).status_code == 404

    user_list = client.get(users_url).json()

    assert user_list["total"] == 0

    mongo_client = MongoClient(settings.mongo_uri, tz_aware=True)

    try:
        database = mongo_client[settings.mongo_db]
        assert database["users"].count_documents({"_id": identities.school_user.id}) == 0
        assert (
            database["refresh_sessions"].count_documents({"user_id": identities.school_user.id})
            == 0
        )
    finally:
        mongo_client.close()

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
