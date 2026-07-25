from datetime import UTC, datetime
from datetime import date as Date
from io import BytesIO

import openpyxl
import pytest
from beanie import PydanticObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.core.config import get_settings
from app.modules.menu_requirements.service import _menu_day_service_date, resolve_service_date
from app.modules.menu_requirements.utils import hash_daily_menu
from app.modules.menus.models import DailyMenu, MealType, Weekday, WeeklyMenu
from app.modules.menus.service import _resolve_auto_close_service_date


def login(client: TestClient, identifier: str, password: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 204


def csrf_headers(client: TestClient) -> dict[str, str]:
    token = client.cookies.get(get_settings().csrf_cookie_name)
    assert token is not None
    return {"X-CSRF-Token": token}


@pytest.mark.no_clean_database
def test_service_date_uses_persisted_day_date_without_weekday_shift() -> None:
    day = DailyMenu.model_construct(
        weekday=Weekday.MONDAY,
        date=Date(2026, 7, 7),
        items=[],
    )
    menu = WeeklyMenu.model_construct(
        title="Меню з явною датою дня",
        meal_type=MealType.LUNCH,
        starts_on=Date(2026, 7, 6),
        days=[day],
    )

    assert resolve_service_date(menu, day, Date(2026, 7, 6)) == Date(2026, 7, 7)
    assert _menu_day_service_date(menu, day) == Date(2026, 7, 7)


@pytest.mark.no_clean_database
def test_service_date_derives_from_week_start_when_day_date_is_missing() -> None:
    day = DailyMenu.model_construct(
        weekday=Weekday.WEDNESDAY,
        date=None,
        items=[],
    )
    menu = WeeklyMenu.model_construct(
        title="Меню з датою початку тижня",
        meal_type=MealType.LUNCH,
        starts_on=Date(2026, 7, 6),
        days=[day],
    )

    assert resolve_service_date(menu, day, Date(2026, 7, 6)) == Date(2026, 7, 8)
    assert _menu_day_service_date(menu, day) == Date(2026, 7, 8)


@pytest.mark.no_clean_database
def test_dev_reopened_day_is_not_auto_closed_again() -> None:
    day = DailyMenu.model_construct(
        weekday=Weekday.MONDAY,
        date=Date(2026, 7, 6),
        dev_reopened_at=datetime(2026, 7, 20, 10, 0, tzinfo=UTC),
        items=[],
    )
    menu = WeeklyMenu.model_construct(
        title="Dev-відкрите меню",
        meal_type=MealType.LUNCH,
        starts_on=Date(2026, 7, 6),
        days=[day],
    )

    assert _resolve_auto_close_service_date(menu, day, Date(2026, 7, 20)) is None


@pytest.mark.no_clean_database
def test_requirement_hash_ignores_close_notification_delivery_state() -> None:
    day = DailyMenu.model_construct(
        weekday=Weekday.MONDAY,
        date=Date(2026, 7, 6),
        items=[],
        close_notification_pending=False,
        close_notification_sent_at=None,
    )
    initial_hash = hash_daily_menu(day)

    day.close_notification_pending = True
    day.close_notification_sent_at = datetime(2026, 7, 6, 16, 0, tzinfo=UTC)

    assert hash_daily_menu(day) == initial_hash


def create_confirmed_dish(
    client: TestClient,
    *,
    ingredient_id: str,
) -> tuple[str, str]:
    card_response = client.post(
        "/api/v1/recipes/dish-cards",
        json={"card_number": "REQ-1", "name": "Овочевий суп"},
        headers=csrf_headers(client),
    )
    assert card_response.status_code == 201
    card_id = card_response.json()["id"]
    variant_id = PydanticObjectId()

    version_response = client.post(
        f"/api/v1/recipes/dish-cards/{card_id}/versions",
        json={
            "portion_variants": [
                {
                    "id": str(variant_id),
                    "age_group": "6-11",
                    "output_grams": "200",
                    "nutrition": {},
                }
            ],
            "ingredient_amounts": [
                {
                    "ingredient_id": ingredient_id,
                    "ingredient_name_snapshot": "Морква",
                    "gross_amount": "25",
                    "net_amount": "20.25",
                    "unit": "g",
                    "portion_variant_id": str(variant_id),
                }
            ],
        },
        headers=csrf_headers(client),
    )
    assert version_response.status_code == 201
    version_id = version_response.json()["id"]
    confirm_response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/confirm",
        headers=csrf_headers(client),
    )
    assert confirm_response.status_code == 200
    return card_id, str(variant_id)


def publish_school_menu(
    client: TestClient,
    *,
    school_id: str,
    card_id: str,
    variant_id: str,
) -> dict:
    create_response = client.post(
        "/api/v1/menus/weekly",
        json={
            "title": "Меню для вимоги",
            "meal_type": "lunch",
            "starts_on": "2026-07-06",
            "ends_on": "2026-07-10",
            "days": [
                {
                    "weekday": "monday",
                    "date": "2026-07-06",
                    "items": [
                        {
                            "position": 1,
                            "kind": "dish_card",
                            "recipe_card_number": "REQ-1",
                            "dish_card_id": card_id,
                            "name": "Овочевий суп",
                            "allergen_codes": [],
                            "portions": [
                                {
                                    "age_group": "6-11",
                                    "yield_amount": "200",
                                    "dish_card_portion_variant_id": variant_id,
                                    "nutrition": {},
                                }
                            ],
                        }
                    ],
                }
            ],
        },
        headers=csrf_headers(client),
    )
    assert create_response.status_code == 201
    source_id = create_response.json()["id"]

    publish_response = client.post(
        f"/api/v1/menus/weekly/{source_id}/publish",
        json={"school_ids": [school_id]},
        headers=csrf_headers(client),
    )
    assert publish_response.status_code == 200
    school_menu_id = publish_response.json()["created_menu_ids"][0]

    menu_response = client.get(f"/api/v1/menus/weekly/{school_menu_id}")
    assert menu_response.status_code == 200
    return menu_response.json()


def prepare_school_menu_with_count(
    client: TestClient,
    *,
    menu: dict,
    group_id: str,
    count: int,
) -> dict:
    days = menu["days"]
    days[0]["items"][0]["servings"] = [
        {
            "school_group_id": group_id,
            "age_group": "6-11",
            "children_count": count,
        }
    ]
    response = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"days": days, "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200
    return response.json()


def test_school_generates_and_regenerates_menu_requirement(seeded_client) -> None:
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    ingredient_response = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Морква", "unit": "g"},
        headers=csrf_headers(client),
    )
    assert ingredient_response.status_code == 201
    ingredient_id = ingredient_response.json()["id"]
    card_id, variant_id = create_confirmed_dish(
        client,
        ingredient_id=ingredient_id,
    )
    menu = publish_school_menu(
        client,
        school_id=str(identities.own_school.id),
        card_id=card_id,
        variant_id=variant_id,
    )

    login(client, identities.school_user.username, identities.school_user_password)
    group_id = str(identities.own_school.groups[0].id)
    menu = prepare_school_menu_with_count(
        client,
        menu=menu,
        group_id=group_id,
        count=3,
    )

    generate_response = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert generate_response.status_code == 200
    requirement = generate_response.json()["items"][0]
    assert requirement["school_group_id"] == group_id
    assert requirement["service_date"] == "2026-07-06"
    assert requirement["dishes"][0]["children_count"] == 3
    carrot = next(
        row for row in requirement["ingredient_rows"] if row["ingredient_id"] == ingredient_id
    )
    assert carrot["cells"][0]["net_per_person_g"] == "20.25"
    assert carrot["per_person_total_g"] == "20.25"
    assert carrot["issue_total_raw_g"] == "60.75"
    assert carrot["issue_total_rounded_g"] == 61

    school_export_response = client.get(
        f"/api/v1/menu-requirements/{requirement['id']}/export.xlsx"
    )
    assert school_export_response.status_code == 200
    assert school_export_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    exported_workbook = openpyxl.load_workbook(BytesIO(school_export_response.content))
    exported_sheet = exported_workbook.active
    assert exported_sheet["A1"].value == "МЕНЮ-ВИМОГА"
    assert exported_sheet["B2"].value == identities.own_school.name
    assert any(cell.value == "Морква" for row in exported_sheet.iter_rows() for cell in row)

    regenerate_response = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert regenerate_response.status_code == 200
    assert regenerate_response.json()["items"][0]["revision"] == 2

    login(client, identities.lower_admin.username, identities.lower_admin_password)
    lower_admin_export_response = client.get(
        f"/api/v1/menu-requirements/{requirement['id']}/export.xlsx"
    )
    assert lower_admin_export_response.status_code == 200

    update_payload = {
        "ingredient_rows": [
            {
                "key": carrot["key"],
                "ingredient_name": "Морква очищена",
                "cells": [
                    {
                        "menu_item_id": requirement["dishes"][0]["menu_item_id"],
                        "net_per_person_g": "21.5",
                    }
                ],
            }
        ]
    }
    school_update_response = client.patch(
        f"/api/v1/menu-requirements/{requirement['id']}",
        json=update_payload,
        headers=csrf_headers(client),
    )
    assert school_update_response.status_code == 403

    login(client, identities.admin.username, identities.admin_password)
    owner_update_response = client.patch(
        f"/api/v1/menu-requirements/{requirement['id']}",
        json=update_payload,
        headers=csrf_headers(client),
    )
    assert owner_update_response.status_code == 200
    updated_requirement = owner_update_response.json()
    updated_carrot = updated_requirement["ingredient_rows"][0]
    assert updated_requirement["revision"] == 3
    assert updated_carrot["ingredient_name"] == "Морква очищена"
    assert updated_carrot["per_person_total_g"] == "21.5"
    assert updated_carrot["issue_total_raw_g"] == "64.5"
    assert updated_carrot["issue_total_rounded_g"] == 65

    owner_export_response = client.get(f"/api/v1/menu-requirements/{requirement['id']}/export.xlsx")
    assert owner_export_response.status_code == 200

    list_response = client.get(f"/api/v1/menu-requirements?weekly_menu_id={menu['id']}")
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    login(client, identities.school_user.username, identities.school_user_password)
    school_delete_response = client.delete(
        f"/api/v1/menu-requirements/{requirement['id']}",
        headers=csrf_headers(client),
    )
    assert school_delete_response.status_code == 403

    login(client, identities.admin.username, identities.admin_password)
    owner_delete_response = client.delete(
        f"/api/v1/menu-requirements/{requirement['id']}",
        headers=csrf_headers(client),
    )
    assert owner_delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/menu-requirements/{requirement['id']}")
    assert missing_response.status_code == 404

    empty_list_response = client.get(f"/api/v1/menu-requirements?weekly_menu_id={menu['id']}")
    assert empty_list_response.status_code == 200
    assert empty_list_response.json()["total"] == 0

    create_technologist_response = client.post(
        "/api/v1/admin/admins",
        json={
            "username": "tech.user",
            "email": "tech.user@example.com",
            "password": "tech-password-123",
            "role": "TECHNOLOGIST",
            "permissions": [],
        },
        headers=csrf_headers(client),
    )
    assert create_technologist_response.status_code == 201

    login(client, identities.school_user.username, identities.school_user_password)
    second_generate_response = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert second_generate_response.status_code == 200
    second_requirement = second_generate_response.json()["items"][0]

    login(client, "tech.user", "tech-password-123")
    technologist_export_response = client.get(
        f"/api/v1/menu-requirements/{second_requirement['id']}/export.xlsx"
    )
    assert technologist_export_response.status_code == 200
    technologist_delete_response = client.delete(
        f"/api/v1/menu-requirements/{second_requirement['id']}",
        headers=csrf_headers(client),
    )
    assert technologist_delete_response.status_code == 204


def test_school_closes_day_and_locks_saved_daily_menu(seeded_client) -> None:
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    ingredient_response = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Морква", "unit": "g"},
        headers=csrf_headers(client),
    )
    assert ingredient_response.status_code == 201
    ingredient_id = ingredient_response.json()["id"]
    card_id, variant_id = create_confirmed_dish(
        client,
        ingredient_id=ingredient_id,
    )
    menu = publish_school_menu(
        client,
        school_id=str(identities.own_school.id),
        card_id=card_id,
        variant_id=variant_id,
    )

    login(client, identities.school_user.username, identities.school_user_password)
    group_id = str(identities.own_school.groups[0].id)
    menu = prepare_school_menu_with_count(
        client,
        menu=menu,
        group_id=group_id,
        count=5,
    )

    close_response = client.post(
        f"/api/v1/menus/weekly/{menu['id']}/days/monday/close",
        headers=csrf_headers(client),
    )
    assert close_response.status_code == 200
    closed_menu = close_response.json()
    closed_day = closed_menu["days"][0]
    assert closed_day["closed_at"] is not None
    assert closed_day["closed_by"] == str(identities.school_user.id)
    assert closed_day["close_reason"] == "manual"
    assert closed_menu["revision"] == menu["revision"] + 1

    duplicate_close_response = client.post(
        f"/api/v1/menus/weekly/{menu['id']}/days/monday/close",
        headers=csrf_headers(client),
    )
    assert duplicate_close_response.status_code == 200
    duplicate_closed_menu = duplicate_close_response.json()
    assert duplicate_closed_menu["days"][0]["closed_at"] == closed_day["closed_at"]
    assert duplicate_closed_menu["revision"] == closed_menu["revision"]

    settings = get_settings()
    mongo_client = MongoClient(settings.mongo_uri, tz_aware=True)
    try:
        stored_menu = mongo_client[settings.mongo_db]["weekly_menus"].find_one(
            {"_id": PydanticObjectId(menu["id"])}
        )
    finally:
        mongo_client.close()
    assert stored_menu is not None
    assert stored_menu["days"][0]["close_notification_pending"] is True
    assert stored_menu["days"][0]["close_notification_sent_at"] is None

    requirements_response = client.get(f"/api/v1/menu-requirements?weekly_menu_id={menu['id']}")
    assert requirements_response.status_code == 200
    requirements = requirements_response.json()["items"]
    assert len(requirements) == 1
    assert requirements[0]["dishes"][0]["children_count"] == 5

    changed_days = closed_menu["days"]
    changed_days[0]["items"][0]["servings"][0]["children_count"] = 6
    edit_response = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"days": changed_days, "revision": closed_menu["revision"]},
        headers=csrf_headers(client),
    )
    assert edit_response.status_code == 400
    assert edit_response.json()["detail"] == "Closed daily menus cannot be changed"

    regenerate_response = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert regenerate_response.status_code == 400
    assert regenerate_response.json()["detail"] == "Daily menu is closed"

    reopen_response = client.post(
        f"/api/v1/menus/weekly/{menu['id']}/days/monday/dev-reopen",
        headers=csrf_headers(client),
    )
    assert reopen_response.status_code == 200
    reopened_menu = reopen_response.json()
    reopened_day = reopened_menu["days"][0]
    assert reopened_day["closed_at"] is None
    assert reopened_day["closed_by"] is None
    assert reopened_day["close_reason"] is None

    reopened_day["items"][0]["servings"][0]["children_count"] = 6
    reopened_edit_response = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"days": reopened_menu["days"], "revision": reopened_menu["revision"]},
        headers=csrf_headers(client),
    )
    assert reopened_edit_response.status_code == 200
    assert (
        reopened_edit_response.json()["days"][0]["items"][0]["servings"][0]["children_count"] == 6
    )


def test_school_cannot_generate_requirement_for_zero_day(seeded_client) -> None:
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)

    ingredient_response = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Морква", "unit": "g"},
        headers=csrf_headers(client),
    )
    card_id, variant_id = create_confirmed_dish(
        client,
        ingredient_id=ingredient_response.json()["id"],
    )
    menu = publish_school_menu(
        client,
        school_id=str(identities.own_school.id),
        card_id=card_id,
        variant_id=variant_id,
    )

    login(client, identities.school_user.username, identities.school_user_password)
    response = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "At least one dish must have a children count greater than zero"
    )
