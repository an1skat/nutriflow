from copy import deepcopy
from datetime import UTC, datetime
from io import BytesIO

import openpyxl
import pytest
from beanie import PydanticObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.core.config import get_settings
from app.modules.menus import service as menu_service
from app.modules.menus.errors import MenuVersionConflictError
from app.modules.menus.models import MealType, WeeklyMenu
from app.modules.menus.schemas import UpdateWeeklyMenuRequest
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


@pytest.mark.parametrize("items", [[], None], ids=["empty", "omitted"])
def test_create_weekly_menu_requires_nonempty_items_at_api_boundary(seeded_client, items):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    payload = weekly_menu_payload()
    if items is None:
        payload["days"][0].pop("items")
    else:
        payload["days"][0]["items"] = items

    response = client.post("/api/v1/menus/weekly", json=payload, headers=csrf_headers(client))
    assert response.status_code == 422
    assert any(error["loc"] == ["body", "days", 0, "items"] for error in response.json()["detail"])


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
    sheet["D6"] = 120
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
    assert menu["days"][0]["items"][0]["portions"][0]["calculated_from"] is None
    assert menu["days"][0]["items"][0]["portions"][1]["calculated_from"]["yield_amount"] == "100"
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
    assert preview["commit_ready"] is True, preview["diagnostics"]
    assert preview["available_sheet_names"] == ["І тиждень"]
    assert preview["selected_sheet_name"] == "І тиждень"
    assert [diagnostic["code"] for diagnostic in preview["diagnostics"]] == [
        "portion_variant_scaled",
        "portion_variant_scaled",
        "portion_variant_scaled",
    ]
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
    commit = commit_response.json()
    assert len(commit["created_menu_ids"]) == 1
    menu = commit["menu"]
    assert menu is not None
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
    assert "filename*=UTF-8''1.xlsx" in export_response.headers["content-disposition"]

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


def test_publish_replace_existing_updates_copy_and_preserves_school_data(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    payload = weekly_menu_payload(items=[dish_item()])
    payload.update(
        starts_on="2026-09-21",
        ends_on="2026-09-25",
        days=[
            {
                "weekday": weekday,
                "date": f"2026-09-{21 + index}",
                "items": [
                    dish_item(name=f"Страва {index + 1}"),
                    *(
                        [dish_item(position=2, name="Друга страва понеділка")]
                        if weekday == "monday"
                        else []
                    ),
                ],
            }
            for index, weekday in enumerate(weekdays)
        ],
    )
    source = client.post(
        "/api/v1/menus/weekly",
        json=payload,
        headers=csrf_headers(client),
    ).json()
    source_id = source["id"]
    own_school_id = str(identities.own_school.id)
    other_school_id = str(identities.other_school.id)

    first_publish = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [own_school_id]},
        headers=csrf_headers(client),
    )
    assert first_publish.status_code == 200, first_publish.text
    assert first_publish.json()["replaced_menu_ids"] == []
    assert first_publish.json()["skipped_existing_school_ids"] == []
    assert len(first_publish.json()["created_menu_ids"]) == 1
    copy_id = first_publish.json()["created_menu_ids"][0]

    skipped_publish = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [own_school_id], "replace_existing": False},
        headers=csrf_headers(client),
    )
    assert skipped_publish.status_code == 200, skipped_publish.text
    assert skipped_publish.json()["created_menu_ids"] == []
    assert skipped_publish.json()["replaced_menu_ids"] == []
    assert skipped_publish.json()["skipped_existing_school_ids"] == [own_school_id]

    login(client, identities.school_user.username, identities.school_user_password)
    school_copy = client.get(f"/api/v1/menus/weekly/{copy_id}").json()
    school_days = deepcopy(school_copy["days"])
    removed_school_item_id = school_days[0]["items"].pop(0)["id"]
    school_days[0]["items"][0]["position"] = 1
    school_days[0]["items"][0]["name"] = "Шкільна каша"
    school_days[0]["items"][0]["servings"] = [
        {
            "school_group_id": str(identities.own_school.groups[0].id),
            "age_group": identities.own_school.groups[0].age_group.value,
            "children_count": 12,
        }
    ]
    school_days[0]["items"].append(product_item(position=2))
    school_update = client.patch(
        f"/api/v1/menus/weekly/{copy_id}",
        json={"days": school_days, "revision": school_copy["revision"]},
        headers=csrf_headers(client),
    )
    assert school_update.status_code == 200, school_update.text

    login(client, identities.admin.username, identities.admin_password)
    source_days = deepcopy(source["days"])
    for index, day in enumerate(source_days):
        day["date"] = f"2026-09-{14 + index}"
    source_days[0]["items"].append(dish_item(position=3, name="Нова страва шаблону"))
    source_days[1]["items"][0]["name"] = "Оновлена страва 2"
    source_update = client.patch(
        f"/api/v1/menus/weekly/{source_id}",
        json={
            "title": "Оновлене осіннє меню",
            "meal_type": "breakfast",
            "cycle_week": 3,
            "starts_on": "2026-09-14",
            "ends_on": "2026-09-18",
            "days": source_days,
            "notes": "Оновлені нотатки",
            "revision": source["revision"],
        },
        headers=csrf_headers(client),
    )
    assert source_update.status_code == 200, source_update.text
    new_template_item_id = source_update.json()["days"][0]["items"][2]["id"]

    reloaded_source = client.get(f"/api/v1/menus/weekly/{source_id}").json()
    assert reloaded_source["starts_on"] == "2026-09-14"
    assert [day["date"] for day in reloaded_source["days"]] == [
        "2026-09-14",
        "2026-09-15",
        "2026-09-16",
        "2026-09-17",
        "2026-09-18",
    ]

    settings = get_settings()
    mongo_client = MongoClient(settings.mongo_uri, tz_aware=True)
    try:
        updated = mongo_client[settings.mongo_db]["weekly_menus"].update_one(
            {"_id": PydanticObjectId(copy_id)},
            {
                "$set": {
                    "title": source["title"],
                    "meal_type": source["meal_type"],
                    "cycle_week": source["cycle_week"],
                    "starts_on": datetime(2026, 9, 21, tzinfo=UTC),
                    "ends_on": datetime(2026, 9, 25, tzinfo=UTC),
                    "notes": source["notes"],
                    **{
                        f"days.{index}.date": datetime(2026, 9, 21 + index, tzinfo=UTC)
                        for index in range(5)
                    },
                },
                "$pull": {"days.0.items": {"id": PydanticObjectId(new_template_item_id)}},
            },
        )
        assert updated.matched_count == 1
    finally:
        mongo_client.close()

    stale_copy = client.get(f"/api/v1/menus/weekly/{copy_id}").json()
    assert [day["date"] for day in stale_copy["days"]] == [
        "2026-09-21",
        "2026-09-22",
        "2026-09-23",
        "2026-09-24",
        "2026-09-25",
    ]

    replaced_publish = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={
            "school_ids": [own_school_id, other_school_id],
            "replace_existing": True,
        },
        headers=csrf_headers(client),
    )
    assert replaced_publish.status_code == 200, replaced_publish.text
    result = replaced_publish.json()
    assert result["replaced_menu_ids"] == [copy_id]
    assert result["skipped_existing_school_ids"] == []
    assert len(result["created_menu_ids"]) == 1

    replaced_copy = client.get(f"/api/v1/menus/weekly/{copy_id}").json()
    assert replaced_copy["id"] == copy_id
    assert replaced_copy["school_id"] == own_school_id
    assert replaced_copy["source_menu_id"] == source_id
    assert replaced_copy["title"] == "Оновлене осіннє меню"
    assert replaced_copy["meal_type"] == "breakfast"
    assert replaced_copy["cycle_week"] == 3
    assert replaced_copy["starts_on"] == "2026-09-14"
    assert replaced_copy["ends_on"] == "2026-09-18"
    assert replaced_copy["notes"] == "Оновлені нотатки"
    assert replaced_copy["updated_by"] == str(identities.admin.id)
    assert replaced_copy["updated_at"] != stale_copy["updated_at"]
    assert replaced_copy["revision"] == stale_copy["revision"] + 1
    assert [day["date"] for day in replaced_copy["days"]] == [
        "2026-09-14",
        "2026-09-15",
        "2026-09-16",
        "2026-09-17",
        "2026-09-18",
    ]
    monday_items = replaced_copy["days"][0]["items"]
    assert removed_school_item_id not in {item["id"] for item in monday_items}
    assert monday_items[0]["name"] == "Шкільна каша"
    assert monday_items[0]["is_school_customized"] is True
    assert monday_items[0]["servings"][0]["children_count"] == 12
    assert new_template_item_id in {item["id"] for item in monday_items}
    assert replaced_copy["days"][1]["items"][0]["name"] == "Оновлена страва 2"
    school_added = next(item for item in monday_items if item["is_school_added"])
    assert school_added["is_school_added"] is True
    assert school_added["name"] == "Хліб цільнозерновий"

    created_copy = client.get(f"/api/v1/menus/weekly/{result['created_menu_ids'][0]}").json()
    assert created_copy["school_id"] == other_school_id
    assert created_copy["starts_on"] == "2026-09-14"
    copies = client.get(f"/api/v1/menus/weekly?source_menu_id={source_id}").json()["items"]
    assert len(copies) == 2
    assert len({copy["school_id"] for copy in copies}) == 2


def test_publish_replace_existing_rolls_back_all_copies_on_conflict(
    seeded_client, monkeypatch
):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    source = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    ).json()
    published = client.post(
        f"/api/v1/menus/weekly/{source['id']}/publish",
        json={
            "school_ids": [str(identities.own_school.id), str(identities.other_school.id)]
        },
        headers=csrf_headers(client),
    ).json()
    copy_ids = published["created_menu_ids"]
    before_source = client.get(f"/api/v1/menus/weekly/{source['id']}").json()
    before_copies = {
        copy_id: client.get(f"/api/v1/menus/weekly/{copy_id}").json() for copy_id in copy_ids
    }
    original_replace = menu_service._replace_weekly_menu_if_current
    replaced_count = 0

    async def fail_second_copy(menu, expected_revision, *, session=None):
        nonlocal replaced_count
        replaced_count += 1
        if replaced_count == 2:
            raise MenuVersionConflictError("Weekly menu was changed by another user")
        await original_replace(menu, expected_revision, session=session)

    monkeypatch.setattr(menu_service, "_replace_weekly_menu_if_current", fail_second_copy)
    response = client.post(
        f"/api/v1/menus/weekly/{source['id']}/publish",
        json={
            "school_ids": [str(identities.own_school.id), str(identities.other_school.id)],
            "replace_existing": True,
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 409, response.text
    assert client.get(f"/api/v1/menus/weekly/{source['id']}").json() == before_source
    for copy_id, before_copy in before_copies.items():
        assert client.get(f"/api/v1/menus/weekly/{copy_id}").json() == before_copy


def test_weekly_menu_source_school_index_is_unique_and_partial(seeded_client):
    _client, _identities = seeded_client
    settings = get_settings()
    mongo_client = MongoClient(settings.mongo_uri, tz_aware=True)
    try:
        index = mongo_client[settings.mongo_db]["weekly_menus"].index_information()[
            "uq_weekly_menu_source_school"
        ]
    finally:
        mongo_client.close()

    assert index["unique"] is True
    assert index["partialFilterExpression"] == {
        "source_menu_id": {"$type": "objectId"},
        "school_id": {"$type": "objectId"},
    }


def test_template_update_propagates_to_existing_school_copy(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    source_id = create_response.json()["id"]
    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    copy_id = publish_response.json()["created_menu_ids"][0]
    updated_days = deepcopy(create_response.json()["days"])
    updated_days[0]["items"].append(product_item(position=3))

    update_response = client.patch(
        f"/api/v1/menus/weekly/{source_id}",
        json={
            "title": "Оновлене меню",
            "days": updated_days,
            "revision": create_response.json()["revision"],
        },
        headers=csrf_headers(client),
    )

    assert update_response.status_code == 200
    copy_response = client.get(f"/api/v1/menus/weekly/{copy_id}")
    assert copy_response.status_code == 200
    assert copy_response.json()["title"] == "Оновлене меню"
    assert len(copy_response.json()["days"][0]["items"]) == 3

    repeated_publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    assert repeated_publish_response.status_code == 200
    assert repeated_publish_response.json()["created_menu_ids"] == []
    assert repeated_publish_response.json()["replaced_menu_ids"] == []
    assert repeated_publish_response.json()["skipped_existing_school_ids"] == [
        str(identities.own_school.id)
    ]


def test_template_update_rejects_copy_changed_after_merge_read(seeded_client, monkeypatch):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    source = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    ).json()
    copy_id = client.post(
        f"/api/v1/menus/weekly/{source['id']}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    ).json()["created_menu_ids"][0]
    before = client.get(f"/api/v1/menus/weekly/{copy_id}").json()
    removed_id = before["days"][0]["items"][0]["id"]
    original_replace = menu_service._replace_weekly_menu_if_current
    injected = False

    async def replace_with_concurrent_school_save(menu, expected_revision, *, session=None):
        nonlocal injected
        if str(menu.id) == source["id"] and not injected:
            injected = True
            school_copy = await WeeklyMenu.get(copy_id)
            days = school_copy.model_dump(mode="json")["days"]
            days[0]["items"].pop(0)
            for position, item in enumerate(days[0]["items"], start=1):
                item["position"] = position
            await menu_service.update_weekly_menu(
                school_copy.id,
                UpdateWeeklyMenuRequest.model_validate(
                    {"days": days, "revision": school_copy.revision}
                ),
                identities.school_user,
            )
        await original_replace(menu, expected_revision, session=session)

    monkeypatch.setattr(
        menu_service, "_replace_weekly_menu_if_current", replace_with_concurrent_school_save
    )
    response = client.patch(
        f"/api/v1/menus/weekly/{source['id']}",
        json={"title": "Новая версия шаблона", "revision": source["revision"]},
        headers=csrf_headers(client),
    )

    assert injected
    assert response.status_code == 409, response.text
    after = client.get(f"/api/v1/menus/weekly/{copy_id}").json()
    assert after["revision"] == before["revision"] + 1
    assert removed_id not in [item["id"] for item in after["days"][0]["items"]]
    assert client.get(f"/api/v1/menus/weekly/{source['id']}").json()["title"] == source["title"]


def test_weekly_menu_update_rejects_stale_revision(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    menu = create_response.json()

    first_update = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"title": "Перша правка", "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert first_update.status_code == 200
    assert first_update.json()["revision"] == menu["revision"] + 1

    stale_update = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"title": "Застаріла правка", "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert stale_update.status_code == 409
    assert stale_update.json()["detail"] == "Weekly menu was changed by another user"

    current_menu = client.get(f"/api/v1/menus/weekly/{menu['id']}")
    assert current_menu.status_code == 200
    assert current_menu.json()["title"] == "Перша правка"


def test_weekly_menu_get_does_not_auto_close_days(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    payload = weekly_menu_payload()
    payload["starts_on"] = "2020-01-06"
    payload["ends_on"] = "2020-01-10"

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=payload,
        headers=csrf_headers(client),
    )
    source_id = create_response.json()["id"]
    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    copy_id = publish_response.json()["created_menu_ids"][0]

    login(client, identities.school_user.username, identities.school_user_password)
    get_response = client.get(f"/api/v1/menus/weekly/{copy_id}")

    assert get_response.status_code == 200
    assert get_response.json()["days"][0]["closed_at"] is None

    close_response = client.post(
        "/api/v1/menus/weekly/close-due-days",
        headers=csrf_headers(client),
    )
    assert close_response.status_code == 200
    assert close_response.json() == {"closed_days": 1}


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

    replace_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={
            "school_ids": [str(identities.own_school.id)],
            "replace_existing": True,
        },
        headers=csrf_headers(client),
    )
    assert replace_response.status_code == 200, replace_response.text
    assert replace_response.json()["replaced_menu_ids"] == [copy_id]
    assert client.get(f"/api/v1/menus/weekly/{copy_id}").json()["status"] == "archived"


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

    login(client, identities.admin.username, identities.admin_password)
    replace_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={
            "school_ids": [str(identities.own_school.id)],
            "replace_existing": True,
        },
        headers=csrf_headers(client),
    )
    assert replace_response.status_code == 200, replace_response.text
    assert replace_response.json()["replaced_menu_ids"] == []
    assert replace_response.json()["skipped_existing_school_ids"] == [str(identities.own_school.id)]
    assert client.get(f"/api/v1/menus/weekly/{copy_id}").json()["status"] == "revoked"


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
    updated_days = deepcopy(create_response.json()["days"])
    updated_days[0]["items"].append(product_item(position=3))
    update_response = client.patch(
        f"/api/v1/menus/weekly/{source_id}",
        json={"days": updated_days, "revision": create_response.json()["revision"]},
        headers=csrf_headers(client),
    )
    assert update_response.status_code == 200, update_response.text
    assert len(update_response.json()["days"][0]["items"]) == 3

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

    archive_list_response = client.get("/api/v1/menus/weekly?template_only=true&status=archived")
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


def test_school_user_can_edit_content_and_add_product(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(
            items=[dish_item()],
        ),
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
    menu_id = publish_response.json()["created_menu_ids"][0]
    menu_response = client.get(f"/api/v1/menus/weekly/{menu_id}")
    assert menu_response.status_code == 200
    menu = menu_response.json()

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
        json={"days": changed_days, "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert edit_response.status_code == 200, edit_response.text
    assert edit_response.json()["days"][0]["items"][0]["name"] == "Салат оновлений школою"
    assert edit_response.json()["days"][0]["items"][0]["servings"][0]["children_count"] == 12

    changed_days = edit_response.json()["days"]
    original_item_id = changed_days[0]["items"][0]["id"]
    changed_days[0]["items"].append(product_item(position=2))
    add_response = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"days": changed_days, "revision": edit_response.json()["revision"]},
        headers=csrf_headers(client),
    )
    assert add_response.status_code == 200, add_response.text
    items = add_response.json()["days"][0]["items"]
    assert len(items) == 2
    assert items[0]["id"] == original_item_id
    assert items[1]["id"] != original_item_id
    assert items[1]["kind"] == "product"


def test_school_user_adds_dish_card_with_existing_reference_resolver(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    dish_card_id, version_id = create_confirmed_dish_card(
        client,
        card_number="2.17",
        allergen_codes=["ГЦ"],
    )
    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(items=[dish_item()]),
        headers=csrf_headers(client),
    )
    source_id = create_response.json()["id"]
    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    menu_id = publish_response.json()["created_menu_ids"][0]
    menu = client.get(f"/api/v1/menus/weekly/{menu_id}").json()

    new_item = dish_item(position=2, card_number="2.17", name="Нова страва")
    new_item["dish_card_id"] = dish_card_id
    menu["days"][0]["items"].append(new_item)

    login(client, identities.school_user.username, identities.school_user_password)
    response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": menu["days"], "revision": menu["revision"]},
        headers=csrf_headers(client),
    )

    assert response.status_code == 200, response.text
    added = response.json()["days"][0]["items"][1]
    assert added["id"]
    assert added["dish_card_id"] == dish_card_id
    assert added["dish_card_version_id"] == version_id
    assert added["allergen_codes"] == ["ГЦ"]


def test_school_user_can_remove_existing_item_but_cannot_empty_day_or_forge_ids(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(),
        headers=csrf_headers(client),
    )
    source_id = create_response.json()["id"]
    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    menu_id = publish_response.json()["created_menu_ids"][0]
    menu = client.get(f"/api/v1/menus/weekly/{menu_id}").json()

    login(client, identities.school_user.username, identities.school_user_password)
    reordered_days = deepcopy(menu["days"])
    reordered_days[0]["items"][0]["position"] = 2
    reordered_days[0]["items"][1]["position"] = 1
    reordered_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": reordered_days, "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert reordered_response.status_code == 400
    assert reordered_response.json()["detail"] == (
        "School users cannot replace or reorder existing dish IDs"
    )

    removed_days = deepcopy(menu["days"])
    removed_days[0]["items"].pop(0)
    removed_days[0]["items"][0]["position"] = 1
    removed_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": removed_days, "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert removed_response.status_code == 200, removed_response.text
    updated_menu = removed_response.json()
    assert len(updated_menu["days"][0]["items"]) == 1
    assert updated_menu["days"][0]["items"][0]["id"] == menu["days"][0]["items"][1]["id"]
    assert updated_menu["days"][0]["items"][0]["position"] == 1

    empty_days = deepcopy(updated_menu["days"])
    empty_days[0]["items"] = []
    empty_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": empty_days, "revision": updated_menu["revision"]},
        headers=csrf_headers(client),
    )
    assert empty_response.status_code == 422

    omitted_days = deepcopy(updated_menu["days"])
    del omitted_days[0]["items"]
    omitted_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": omitted_days, "revision": updated_menu["revision"]},
        headers=csrf_headers(client),
    )
    assert omitted_response.status_code == 422

    replaced_days = deepcopy(updated_menu["days"])
    replaced_days[0]["items"][0]["id"] = str(PydanticObjectId())
    replaced_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": replaced_days, "revision": updated_menu["revision"]},
        headers=csrf_headers(client),
    )
    assert replaced_response.status_code == 400
    assert replaced_response.json()["detail"] == (
        "School users cannot replace or reorder existing dish IDs"
    )

    duplicate_position_days = deepcopy(updated_menu["days"])
    duplicate_position_days[0]["items"].append(product_item(position=1))
    duplicate_position_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": duplicate_position_days, "revision": updated_menu["revision"]},
        headers=csrf_headers(client),
    )
    assert duplicate_position_response.status_code == 400
    assert duplicate_position_response.json()["detail"] == (
        "Daily menu item positions must be unique"
    )


def test_school_user_added_item_rejects_foreign_serving_and_stale_revision(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(items=[dish_item()]),
        headers=csrf_headers(client),
    )
    source_id = create_response.json()["id"]
    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    menu_id = publish_response.json()["created_menu_ids"][0]
    menu = client.get(f"/api/v1/menus/weekly/{menu_id}").json()
    added_item = product_item(position=2)
    added_item["servings"] = [
        {
            "school_group_id": str(PydanticObjectId()),
            "age_group": "6-11",
            "children_count": 10,
        }
    ]
    menu["days"][0]["items"].append(added_item)

    login(client, identities.school_user.username, identities.school_user_password)
    foreign_serving_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": menu["days"], "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert foreign_serving_response.status_code == 400
    assert foreign_serving_response.json()["detail"] == "School group not found"

    added_item["servings"][0]["school_group_id"] = str(identities.own_school.groups[0].id)
    valid_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": menu["days"], "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert valid_response.status_code == 200, valid_response.text

    stale_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": menu["days"], "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert stale_response.status_code == 409
    assert stale_response.json()["detail"] == "Weekly menu was changed by another user"


def test_school_user_cannot_escalate_template_item_to_school_added(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(items=[dish_item()]),
        headers=csrf_headers(client),
    )
    source_id = create_response.json()["id"]
    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    menu_id = publish_response.json()["created_menu_ids"][0]
    menu = client.get(f"/api/v1/menus/weekly/{menu_id}").json()

    assert menu["days"][0]["items"][0]["is_school_added"] is False

    login(client, identities.school_user.username, identities.school_user_password)
    malicious_days = deepcopy(menu["days"])
    malicious_days[0]["items"][0]["is_school_added"] = True

    patch_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": malicious_days, "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert patch_response.status_code == 200

    updated_menu = client.get(f"/api/v1/menus/weekly/{menu_id}").json()
    assert updated_menu["days"][0]["items"][0]["is_school_added"] is False


def test_school_user_cannot_read_another_school_menu(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    create_response = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(school_id=str(identities.other_school.id)),
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    menu = create_response.json()
    menu_id = menu["id"]

    login(client, identities.school_user.username, identities.school_user_password)
    response = client.get(f"/api/v1/menus/weekly/{menu_id}")

    assert response.status_code == 403
    assert response.json()["detail"] == "School access denied"

    update_response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": menu["days"], "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert update_response.status_code == 403
    assert update_response.json()["detail"] == "School access denied"


def create_confirmed_dish_card(
    client: TestClient,
    *,
    card_number: str,
    allergen_codes: list[str] | None = None,
    output_grams: str = "100",
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
                    "output_grams": output_grams,
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
