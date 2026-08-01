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


def test_new_school_has_default_age_groups(seeded_client):
    client, identities = seeded_client

    login(client, identities.admin.username, identities.admin_password)

    response = client.post(
        "/api/v1/admin/schools",
        json={
            "name": "Default Groups School",
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 201

    groups_response = client.get(f"/api/v1/admin/schools/{response.json()['id']}/groups")

    assert groups_response.status_code == 200
    assert groups_response.json()["total"] == 3
    assert [group["age_group"] for group in groups_response.json()["items"]] == [
        "6-11",
        "11-14",
        "14-18",
    ]
    assert all("children_count" not in group for group in groups_response.json()["items"])


def test_admin_can_list_default_school_groups(seeded_client):
    client, identities = seeded_client

    login(client, identities.admin.username, identities.admin_password)

    response = client.get(f"/api/v1/admin/schools/{identities.own_school.id}/groups")

    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert {group["age_group"] for group in response.json()["items"]} == {
        "6-11",
        "11-14",
        "14-18",
    }


def test_admin_can_update_school_group(seeded_client):
    client, identities = seeded_client

    login(client, identities.admin.username, identities.admin_password)

    groups_response = client.get(f"/api/v1/admin/schools/{identities.own_school.id}/groups")
    group = next(item for item in groups_response.json()["items"] if item["age_group"] == "6-11")

    response = client.patch(
        f"/api/v1/admin/schools/{identities.own_school.id}/groups/{group['id']}",
        json={
            "name": "Молодша група",
            "is_active": False,
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Молодша група"
    assert response.json()["age_group"] == "6-11"
    assert response.json()["is_active"] is False

    get_response = client.get(
        f"/api/v1/admin/schools/{identities.own_school.id}/groups/{group['id']}"
    )

    assert get_response.status_code == 200
    assert "children_count" not in get_response.json()


def test_school_group_validation_errors(seeded_client):
    client, identities = seeded_client

    login(client, identities.admin.username, identities.admin_password)

    groups_response = client.get(f"/api/v1/admin/schools/{identities.own_school.id}/groups")
    group_id = groups_response.json()["items"][0]["id"]
    url = f"/api/v1/admin/schools/{identities.own_school.id}/groups/{group_id}"

    immutable_age_group = client.patch(
        url,
        json={"age_group": "5-6"},
        headers=csrf_headers(client),
    )
    removed_children_count = client.patch(
        url,
        json={"children_count": 24},
        headers=csrf_headers(client),
    )
    blank_name = client.patch(
        url,
        json={"name": "   "},
        headers=csrf_headers(client),
    )

    assert immutable_age_group.status_code == 422
    assert removed_children_count.status_code == 422
    assert blank_name.status_code == 422


def test_cannot_list_groups_for_missing_school(seeded_client):
    client, identities = seeded_client

    login(client, identities.admin.username, identities.admin_password)

    response = client.get("/api/v1/admin/schools/000000000000000000000000/groups")

    assert response.status_code == 404


def test_group_cannot_be_read_through_another_school_path(seeded_client):
    client, identities = seeded_client

    login(client, identities.admin.username, identities.admin_password)

    groups_response = client.get(f"/api/v1/admin/schools/{identities.own_school.id}/groups")
    group_id = groups_response.json()["items"][0]["id"]

    response = client.get(f"/api/v1/admin/schools/{identities.other_school.id}/groups/{group_id}")

    assert response.status_code == 404


def test_school_user_cannot_use_admin_group_endpoints(seeded_client):
    client, identities = seeded_client

    login(client, identities.school_user.username, identities.school_user_password)

    response = client.get(f"/api/v1/admin/schools/{identities.own_school.id}/groups")

    assert response.status_code == 403


def test_school_user_reads_only_own_school_groups(seeded_client):
    client, identities = seeded_client

    login(client, identities.admin.username, identities.admin_password)

    own_groups = client.get(f"/api/v1/admin/schools/{identities.own_school.id}/groups").json()[
        "items"
    ]
    other_groups = client.get(f"/api/v1/admin/schools/{identities.other_school.id}/groups").json()[
        "items"
    ]

    login(client, identities.school_user.username, identities.school_user_password)

    list_response = client.get("/api/v1/school/groups")
    own_get_response = client.get(f"/api/v1/school/groups/{own_groups[0]['id']}")
    other_get_response = client.get(f"/api/v1/school/groups/{other_groups[0]['id']}")

    assert list_response.status_code == 200
    assert list_response.json()["total"] == 3
    assert {group["id"] for group in list_response.json()["items"]} == {
        group["id"] for group in own_groups
    }
    assert own_get_response.status_code == 200
    assert other_get_response.status_code == 404
