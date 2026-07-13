from io import BytesIO

import openpyxl
from beanie import PydanticObjectId
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.modules.menus.models import MealType
from app.modules.menus.service import parse_weekly_menu_workbook


def login(client: TestClient, identifier: str, password: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 204


def csrf_headers(client: TestClient) -> dict[str, str]:
    csrf_token = client.cookies.get(get_settings().csrf_cookie_name)
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token}


def portions() -> list[dict]:
    return [
        {
            "age_group": "6-11",
            "yield_amount": "100",
            "nutrition": {"kcal": "46", "proteins": "1.29", "fats": "1.27", "carbs": "7.02"},
        },
        {
            "age_group": "11-14",
            "yield_amount": "120",
            "nutrition": {"kcal": "55", "proteins": "1.54", "fats": "1.52", "carbs": "8.42"},
        },
        {
            "age_group": "14-18",
            "yield_amount": "120",
            "nutrition": {"kcal": "55", "proteins": "1.54", "fats": "1.52", "carbs": "8.42"},
        },
    ]


def dish_item(*, position: int = 1, card_number: str = "1.54", name: str = "Салат") -> dict:
    return {
        "position": position,
        "kind": "dish_card",
        "source_text": f"ТК № {card_number}",
        "recipe_card_number": card_number,
        "name": name,
        "allergen_codes": [],
        "portions": portions(),
    }


def product_item(*, position: int = 2) -> dict:
    return {
        "position": position,
        "kind": "product",
        "source_text": "пром. вироб.",
        "product_name_snapshot": "Хліб цільнозерновий",
        "name": "Хліб цільнозерновий",
        "allergen_codes": ["ЗП", "Г"],
        "portions": [
            {
                "age_group": "6-11",
                "yield_amount": "30/15",
                "nutrition": {
                    "kcal": "123.28",
                    "proteins": "5.75",
                    "fats": "5.75",
                    "carbs": "10.3",
                },
            }
        ],
    }


def weekly_menu_payload(
    *,
    title: str = "Весняне меню, 1 тиждень",
    school_id: str | None = None,
    items: list[dict] | None = None,
) -> dict:
    payload = {
        "title": title,
        "meal_type": "lunch",
        "cycle_week": 1,
        "days": [
            {
                "weekday": "monday",
                "items": items or [dish_item(), product_item()],
            }
        ],
    }
    if school_id is not None:
        payload["school_id"] = school_id
    return payload


def import_workbook_bytes() -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "І тиждень"

    sheet["A1"] = "Збірник рецептур, № розкладки"
    sheet["B1"] = "Алергени"
    sheet["C1"] = "Найменування страв"
    sheet["D1"] = "Енергетична цінність для дітей\n6-11 р."
    sheet["I1"] = "Енергетична цінність для дітей 11-14 р."
    sheet["N1"] = "Енергетична цінність для дітей\n14-18 р."
    sheet["D2"] = "Вихід, г"
    sheet["I2"] = "Вихід, г"
    sheet["N2"] = "Вихід, г"
    sheet["C3"] = "1-й тиждень"
    sheet["C5"] = "Понеділок"

    sheet["A6"] = "ТК № 1.54"
    sheet["B6"] = "ГЦ"
    sheet["C6"] = "Салат з пекінської капусти"
    sheet["D6"] = 100
    sheet["E6"] = 46
    sheet["F6"] = 1.29
    sheet["G6"] = 1.27
    sheet["H6"] = 7.02
    sheet["I6"] = 120
    sheet["J6"] = 55
    sheet["K6"] = 1.54
    sheet["L6"] = 1.52
    sheet["M6"] = 8.42
    sheet["N6"] = 120
    sheet["O6"] = 55
    sheet["P6"] = 1.54
    sheet["Q6"] = 1.52
    sheet["R6"] = 8.42
    sheet["A7"] = "Всього"

    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def test_admin_creates_weekly_menu_and_links_current_dish_card(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    dish_card_id, version_id = create_confirmed_dish_card(client, card_number="1.54")

    response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )

    assert response.status_code == 201
    menu = response.json()
    assert menu["school_id"] is None
    assert menu["status"] == "draft"
    assert menu["days"][0]["items"][0]["dish_card_id"] == dish_card_id
    assert menu["days"][0]["items"][0]["dish_card_version_id"] == version_id
    assert menu["days"][0]["items"][0]["allergen_codes"] == []
    assert menu["days"][0]["items"][1]["kind"] == "product"
    assert menu["days"][0]["items"][1]["product_name_snapshot"] == "Хліб цільнозерновий"


def test_admin_creates_weekly_menu_and_autofills_allergens_from_dish_card_version(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    create_confirmed_dish_card(
        client,
        card_number="1.54",
        allergen_codes=["ГЦ", "Л"],
    )

    response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )

    assert response.status_code == 201
    menu = response.json()
    assert menu["days"][0]["items"][0]["allergen_codes"] == ["ГЦ", "Л"]


def test_admin_previews_and_commits_imported_weekly_menu(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    dish_card_id, _version_id = create_confirmed_dish_card(
        client,
        card_number="1.54",
        allergen_codes=["ГЦ"],
    )

    preview_response = client.post(
        "/api/v1/menus/weekly/import-preview?meal_type=lunch",
        files={
            "file": (
                "menu.xlsx",
                import_workbook_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers=csrf_headers(client),
    )

    assert preview_response.status_code == 202
    preview = preview_response.json()
    assert preview["commit_ready"] is True
    assert preview["available_sheet_names"] == ["І тиждень"]
    assert preview["selected_sheet_name"] == "І тиждень"
    assert preview["diagnostics"] == []
    assert preview["menu"]["days"][0]["items"][0]["recipe_card_number"] == "1.54"

    commit_response = client.post(
        "/api/v1/menus/weekly/import-commit",
        json={
            "preview_id": preview["preview_id"],
            "school_id": str(identities.own_school.id),
        },
        headers=csrf_headers(client),
    )

    assert commit_response.status_code == 201
    menu = commit_response.json()
    assert menu["school_id"] == str(identities.own_school.id)
    assert menu["days"][0]["items"][0]["dish_card_id"] == dish_card_id
    assert menu["days"][0]["items"][0]["allergen_codes"] == ["ГЦ"]


def test_weekly_menu_export_generates_roundtrip_workbook(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    create_confirmed_dish_card(client, card_number="1.54")

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(items=[dish_item()]),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    menu_id = create_response.json()["id"]

    export_response = client.get(f"/api/v1/menus/weekly/{menu_id}/export.xlsx")

    assert export_response.status_code == 200
    assert (
        export_response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert export_response.headers["content-disposition"].endswith(".xlsx\"")

    workbook = openpyxl.load_workbook(BytesIO(export_response.content))
    sheet = workbook.active
    assert sheet["C5"].value == "Понеділок"
    assert sheet["A6"].value == "ТК № 1.54"
    assert sheet["C6"].value == "Салат"

    parsed_menu, parsed_sheet_name = parse_weekly_menu_workbook(
        export_response.content,
        filename="export.xlsx",
        meal_type=MealType.LUNCH,
    )
    assert parsed_sheet_name == sheet.title
    assert parsed_menu.days[0].items[0].recipe_card_number == "1.54"


def test_admin_publishes_template_to_school_copy(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    source_id = create_response.json()["id"]

    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )

    assert publish_response.status_code == 200
    publish_data = publish_response.json()
    assert publish_data["target_school_ids"] == [str(identities.own_school.id)]
    assert len(publish_data["created_menu_ids"]) == 1
    copy_id = publish_data["created_menu_ids"][0]

    copies_response = client.get(
        f"/api/v1/menus/weekly?source_menu_id={source_id}&status=published"
    )
    assert copies_response.status_code == 200
    assert [item["id"] for item in copies_response.json()["items"]] == [copy_id]

    login(client, identities.school_user.username, identities.school_user_password)
    get_response = client.get(f"/api/v1/menus/weekly/{copy_id}")
    assert get_response.status_code == 200
    assert get_response.json()["school_id"] == str(identities.own_school.id)
    assert get_response.json()["source_menu_id"] == source_id


def test_school_archives_menu_locally_and_admin_can_still_access_it(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    source_id = create_response.json()["id"]

    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    assert publish_response.status_code == 200
    copy_id = publish_response.json()["created_menu_ids"][0]

    login(client, identities.school_user.username, identities.school_user_password)
    archive_response = client.post(
        f"/api/v1/menus/weekly/{copy_id}/school-archive",
        headers=csrf_headers(client),
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"

    school_list_response = client.get("/api/v1/menus/weekly?status=published")
    assert school_list_response.status_code == 200
    assert school_list_response.json()["items"] == []

    school_archive_response = client.get("/api/v1/menus/weekly?status=archived")
    assert school_archive_response.status_code == 200
    assert [item["id"] for item in school_archive_response.json()["items"]] == [copy_id]

    school_get_response = client.get(f"/api/v1/menus/weekly/{copy_id}")
    assert school_get_response.status_code == 403

    restore_response = client.post(
        f"/api/v1/menus/weekly/{copy_id}/school-restore",
        headers=csrf_headers(client),
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "published"

    restored_list_response = client.get("/api/v1/menus/weekly?status=published")
    assert restored_list_response.status_code == 200
    assert [item["id"] for item in restored_list_response.json()["items"]] == [copy_id]

    archive_again_response = client.post(
        f"/api/v1/menus/weekly/{copy_id}/school-archive",
        headers=csrf_headers(client),
    )
    assert archive_again_response.status_code == 200

    login(client, identities.admin.username, identities.admin_password)
    admin_get_response = client.get(f"/api/v1/menus/weekly/{copy_id}")
    assert admin_get_response.status_code == 200
    assert admin_get_response.json()["status"] == "archived"


def test_admin_revokes_locally_archived_school_menu(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    source_id = create_response.json()["id"]

    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    assert publish_response.status_code == 200
    copy_id = publish_response.json()["created_menu_ids"][0]

    login(client, identities.school_user.username, identities.school_user_password)
    archive_response = client.post(
        f"/api/v1/menus/weekly/{copy_id}/school-archive",
        headers=csrf_headers(client),
    )
    assert archive_response.status_code == 200

    login(client, identities.admin.username, identities.admin_password)
    revoke_response = client.post(
        f"/api/v1/menus/weekly/{copy_id}/revoke",
        headers=csrf_headers(client),
    )
    assert revoke_response.status_code == 200
    revoke_data = revoke_response.json()
    assert revoke_data["status"] == "revoked"
    assert revoke_data["revoked_by"] == str(identities.admin.id)
    assert revoke_data["revoke_reason"] == "manual"

    login(client, identities.school_user.username, identities.school_user_password)
    school_get_response = client.get(f"/api/v1/menus/weekly/{copy_id}")
    assert school_get_response.status_code == 403
    assert school_get_response.json()["detail"] == "Weekly menu is revoked"


def test_lower_admin_publishes_menu_only_to_owned_schools(seeded_client):
    client, identities = seeded_client
    login(client, identities.lower_admin.username, identities.lower_admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(title="Меню нижнього адміністратора"),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    source_id = create_response.json()["id"]

    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"replace_existing": False},
        headers=csrf_headers(client),
    )

    assert publish_response.status_code == 200
    publish_data = publish_response.json()
    assert publish_data["target_school_ids"] == [str(identities.own_school.id)]
    assert len(publish_data["created_menu_ids"]) == 1

    forbidden_publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.other_school.id)]},
        headers=csrf_headers(client),
    )

    assert forbidden_publish_response.status_code == 403


def test_admin_archives_restores_and_hard_deletes_weekly_menu_from_archive(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    menu_id = create_response.json()["id"]

    forbidden_delete_response = client.delete(
        f"/api/v1/menus/weekly/{menu_id}",
        headers=csrf_headers(client),
    )
    assert forbidden_delete_response.status_code == 400
    assert forbidden_delete_response.json()["detail"] == (
        "Only archived weekly menus can be deleted"
    )

    archive_response = client.post(
        f"/api/v1/menus/weekly/{menu_id}/archive",
        headers=csrf_headers(client),
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"

    active_list_response = client.get("/api/v1/menus/weekly?template_only=true")
    assert active_list_response.status_code == 200
    assert active_list_response.json()["items"] == []

    archive_list_response = client.get(
        "/api/v1/menus/weekly?template_only=true&status=archived"
    )
    assert archive_list_response.status_code == 200
    assert [item["id"] for item in archive_list_response.json()["items"]] == [menu_id]

    restore_response = client.post(
        f"/api/v1/menus/weekly/{menu_id}/restore",
        headers=csrf_headers(client),
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "draft"

    archive_again_response = client.post(
        f"/api/v1/menus/weekly/{menu_id}/archive",
        headers=csrf_headers(client),
    )
    assert archive_again_response.status_code == 200

    delete_response = client.delete(
        f"/api/v1/menus/weekly/{menu_id}",
        headers=csrf_headers(client),
    )
    assert delete_response.status_code == 204

    get_response = client.get(f"/api/v1/menus/weekly/{menu_id}")
    assert get_response.status_code == 404


def test_archiving_template_revokes_school_copies(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    source_id = create_response.json()["id"]

    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    assert publish_response.status_code == 200
    copy_id = publish_response.json()["created_menu_ids"][0]

    login(client, identities.school_user.username, identities.school_user_password)
    school_archive_response = client.post(
        f"/api/v1/menus/weekly/{copy_id}/school-archive",
        headers=csrf_headers(client),
    )
    assert school_archive_response.status_code == 200
    assert school_archive_response.json()["status"] == "archived"

    login(client, identities.admin.username, identities.admin_password)
    archive_source_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/archive",
        headers=csrf_headers(client),
    )
    assert archive_source_response.status_code == 200
    assert archive_source_response.json()["status"] == "archived"

    copy_response = client.get(f"/api/v1/menus/weekly/{copy_id}")
    assert copy_response.status_code == 200
    copy_data = copy_response.json()
    assert copy_data["status"] == "revoked"
    assert copy_data["revoked_by"] == str(identities.admin.id)
    assert copy_data["revoke_reason"] == "source_archived"


def test_school_menu_copy_cannot_be_hard_deleted(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(school_id=str(identities.own_school.id)),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    menu_id = create_response.json()["id"]

    delete_response = client.delete(
        f"/api/v1/menus/weekly/{menu_id}",
        headers=csrf_headers(client),
    )
    assert delete_response.status_code == 400
    assert delete_response.json()["detail"] == (
        "School archived weekly menus cannot be hard-deleted"
    )


def test_school_user_can_edit_content_but_not_change_daily_dish_count(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(
            school_id=str(identities.own_school.id),
            items=[dish_item()],
        ),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    menu = create_response.json()

    login(client, identities.school_user.username, identities.school_user_password)

    changed_days = menu["days"]
    changed_days[0]["items"][0]["name"] = "Салат оновлений школою"
    changed_days[0]["items"][0]["servings"] = [
        {
            "school_group_id": str(identities.own_school.groups[0].id),
            "age_group": identities.own_school.groups[0].age_group.value,
            "children_count": 12,
        }
    ]

    edit_response = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"days": changed_days},
        headers=csrf_headers(client),
    )
    assert edit_response.status_code == 200
    assert edit_response.json()["days"][0]["items"][0]["name"] == "Салат оновлений школою"
    assert edit_response.json()["days"][0]["items"][0]["servings"][0]["children_count"] == 12

    changed_days[0]["items"].append(product_item(position=2))
    forbidden_response = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"days": changed_days},
        headers=csrf_headers(client),
    )
    assert forbidden_response.status_code == 400
    assert forbidden_response.json()["detail"] == (
        "School users cannot change the number of dishes in a day"
    )


def test_school_user_cannot_read_another_school_menu(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(school_id=str(identities.other_school.id)),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    menu_id = create_response.json()["id"]

    login(client, identities.school_user.username, identities.school_user_password)
    response = client.get(f"/api/v1/menus/weekly/{menu_id}")

    assert response.status_code == 403
    assert response.json()["detail"] == "School access denied"


def create_confirmed_dish_card(
    client: TestClient,
    *,
    card_number: str,
    allergen_codes: list[str] | None = None,
) -> tuple[str, str]:
    create_card = client.post(
        "/api/v1/recipes/dish-cards",
        json={
            "card_number": card_number,
            "name": f"Техкарта {card_number}",
        },
        headers=csrf_headers(client),
    )
    assert create_card.status_code == 201
    dish_card_id = create_card.json()["id"]
    variant_id = PydanticObjectId()
    allergen_ids: list[str] = []

    for code in allergen_codes or []:
      create_allergen = client.post(
          "/api/v1/recipes/allergens",
          json={"code": code, "name": f"Алерген {code}"},
          headers=csrf_headers(client),
      )
      assert create_allergen.status_code == 201
      allergen_ids.append(create_allergen.json()["id"])

    create_version = client.post(
        f"/api/v1/recipes/dish-cards/{dish_card_id}/versions",
        json={
            "allergen_ids": allergen_ids,
            "portion_variants": [
                {
                    "id": str(variant_id),
                    "age_group": "6-11",
                    "output_grams": "100",
                    "nutrition": {},
                }
            ],
            "ingredient_amounts": [
                {
                    "ingredient_name_snapshot": "Морква",
                    "gross_amount": "100",
                    "net_amount": "80",
                    "unit": "g",
                    "portion_variant_id": str(variant_id),
                }
            ],
        },
        headers=csrf_headers(client),
    )
    assert create_version.status_code == 201
    version_id = create_version.json()["id"]

    confirm = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/confirm",
        headers=csrf_headers(client),
    )
    assert confirm.status_code == 200
    return dish_card_id, version_id
