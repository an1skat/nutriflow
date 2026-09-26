from copy import deepcopy
from datetime import UTC, date, datetime

import pytest
from bson import ObjectId
from pymongo import MongoClient

from app.core.config import get_settings
from app.modules.menu_requirements.models import MenuRequirement
from app.modules.menu_requirements.utils import hash_daily_menu
from app.modules.menus.models import DailyMenu
from tests.test_menu_requirements import (
    create_confirmed_dish,
    csrf_headers,
    login,
    prepare_school_menu_with_count,
    publish_school_menu,
)


@pytest.fixture
def daily_menu(seeded_client, monkeypatch):
    client, identities = seeded_client
    monkeypatch.setattr(
        "app.modules.menus.day_closure._today_in_school_timezone", lambda: date(2026, 7, 25)
    )
    login(client, identities.admin.username, identities.admin_password)
    ingredient = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Морква", "unit": "g"},
        headers=csrf_headers(client),
    ).json()
    card, variant = create_confirmed_dish(client, ingredient_id=ingredient["id"])
    menu = publish_school_menu(
        client, school_id=str(identities.own_school.id), card_id=card, variant_id=variant
    )
    login(client, identities.school_user.username, identities.school_user_password)
    menu = prepare_school_menu_with_count(
        client, menu=menu, group_id=str(identities.own_school.groups[0].id), count=298
    )
    settings = get_settings()
    with MongoClient(settings.mongo_uri, tz_aware=True) as mongo:
        login(client, identities.lower_admin.username, identities.lower_admin_password)
        yield client, identities, mongo[settings.mongo_db], menu


def month(client, identities, month=7):
    response = client.get(
        "/api/v1/menus/daily/month",
        params={"school_id": str(identities.own_school.id), "year": 2026, "month": month},
    )
    assert response.status_code == 200, response.text
    return response.json()


def regenerate(client, identities, menu):
    return client.post(
        f"/api/v1/menus/daily/{identities.own_school.id}/{menu['id']}/monday/regenerate",
        json={"revision": menu["revision"]},
        headers=csrf_headers(client),
    )


def save_count(client, menu, count):
    days = deepcopy(menu["days"])
    days[0]["items"][0]["servings"][0]["children_count"] = count
    return client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"revision": menu["revision"], "days": days},
        headers=csrf_headers(client),
    )


@pytest.mark.parametrize(
    "service_date,allowed",
    [
        ("2026-07-01", True),
        ("2026-07-31", True),
        ("2026-06-30", False),
        ("2026-08-01", False),
    ],
)
def test_reopen_calendar_month_boundaries(daily_menu, service_date, allowed):
    client, identities, db, menu = daily_menu
    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])},
        {"$set": {"days.0.date": service_date, "days.0.closed_at": datetime.now(UTC)}},
    )
    response = client.post(
        f"/api/v1/menus/weekly/{menu['id']}/days/monday/reopen", headers=csrf_headers(client)
    )
    assert response.status_code == (200 if allowed else 400), response.text
    assert db.menu_requirements.count_documents({}) == 0


def test_month_lists_both_meals_open_closed_and_effective_dates(daily_menu):
    client, identities, db, menu = daily_menu
    original = db.weekly_menus.find_one({"_id": ObjectId(menu["id"])})
    breakfast = deepcopy(original)
    breakfast["_id"] = ObjectId()
    breakfast["source_menu_id"] = ObjectId()
    breakfast["meal_type"] = "breakfast"
    breakfast["days"][0]["date"] = None
    breakfast["days"][0]["closed_at"] = datetime.now(UTC)
    db.weekly_menus.insert_one(breakfast)
    draft = deepcopy(original)
    draft["_id"] = ObjectId()
    draft["source_menu_id"] = ObjectId()
    draft["status"] = "draft"
    db.weekly_menus.insert_one(draft)
    result = month(client, identities)
    assert len(result["items"]) == 2
    assert {item["meal_type"] for item in result["items"]} == {"lunch", "breakfast"}
    assert {item["date"] for item in result["items"]} == {"2026-07-06"}
    assert result["items"][0]["closed_at"] is not None
    assert result["items"][1]["closed_at"] is None
    assert result["groups"][0]["school_id"] == str(identities.own_school.id)
    assert month(client, identities, 8)["items"] == []


def test_ownership_and_permissions_on_all_actions(daily_menu):
    client, identities, db, menu = daily_menu
    assert [s["id"] for s in client.get("/api/v1/menus/daily/schools").json()] == [
        str(identities.own_school.id)
    ]
    db.schools.update_one(
        {"_id": identities.own_school.id}, {"$set": {"admin_owner_id": ObjectId()}}
    )
    assert (
        client.get(
            "/api/v1/menus/daily/month",
            params={"school_id": str(identities.own_school.id), "year": 2026, "month": 7},
        ).status_code
        == 403
    )
    assert regenerate(client, identities, menu).status_code == 403
    assert (
        client.post(
            f"/api/v1/menus/weekly/{menu['id']}/days/monday/reopen", headers=csrf_headers(client)
        ).status_code
        == 403
    )
    assert save_count(client, menu, 263).status_code == 403
    db.schools.update_one(
        {"_id": identities.own_school.id}, {"$set": {"admin_owner_id": identities.lower_admin.id}}
    )
    db.users.update_one({"_id": identities.lower_admin.id}, {"$set": {"permissions": []}})
    assert regenerate(client, identities, menu).status_code == 403
    assert client.get("/api/v1/menus/daily/schools").status_code == 403


def test_closed_integrity_reopen_edit_regenerate_and_zero(daily_menu):
    client, identities, db, menu = daily_menu
    assert regenerate(client, identities, menu).status_code == 200
    first = db.menu_requirements.find_one({})
    assert first["generated_by"] == identities.lower_admin.id
    url = f"/api/v1/menus/weekly/{menu['id']}"
    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])}, {"$set": {"days.0.closed_at": datetime.now(UTC)}}
    )
    menu = client.get(url).json()
    assert save_count(client, menu, 263).status_code == 400
    assert regenerate(client, identities, menu).status_code == 400
    reopened = client.post(url + "/days/monday/reopen", headers=csrf_headers(client))
    assert reopened.status_code == 200, reopened.text
    assert db.menu_requirements.find_one({}) == first
    saved = save_count(client, reopened.json(), 263)
    assert saved.status_code == 200, saved.text
    menu = saved.json()
    assert month(client, identities)["items"][0]["requirement_stale"] is True
    assert db.menu_requirements.find_one({}) == first
    response = regenerate(client, identities, menu)
    assert response.status_code == 200, response.text
    updated = db.menu_requirements.find_one({})
    assert updated["_id"] == first["_id"]
    assert db.menu_requirements.count_documents({}) == 1
    assert updated["revision"] == first["revision"] + 1
    assert updated["generated_by"] == identities.lower_admin.id
    assert updated["generated_at"] > first["generated_at"]
    assert updated["updated_at"] > first["updated_at"]
    assert updated["dishes"][0]["children_count"] == 263
    assert updated["source_day_hash"] != first["source_day_hash"]
    assert updated["source_day_hash"] == hash_daily_menu(DailyMenu.model_validate(menu["days"][0]))
    assert month(client, identities)["items"][0]["requirement_stale"] is False
    menu = client.get(url).json()
    saved = save_count(client, menu, 0)
    assert saved.status_code == 200, saved.text
    assert month(client, identities)["items"][0]["requirement_stale"] is True
    assert regenerate(client, identities, saved.json()).status_code == 200
    assert db.menu_requirements.count_documents({}) == 0
    assert month(client, identities)["items"][0]["requirement_stale"] is False


def test_failure_rolls_back_requirements_not_saved_day(daily_menu, monkeypatch):
    client, identities, db, menu = daily_menu
    assert regenerate(client, identities, menu).status_code == 200
    before = db.menu_requirements.find_one({})
    url = f"/api/v1/menus/weekly/{menu['id']}"
    menu = save_count(client, client.get(url).json(), 263).json()
    original_save = MenuRequirement.save

    async def fail_after_save(self, *args, **kwargs):
        await original_save(self, *args, **kwargs)
        raise RuntimeError("injected storage failure")

    monkeypatch.setattr(MenuRequirement, "save", fail_after_save)
    with pytest.raises(RuntimeError, match="injected storage failure"):
        regenerate(client, identities, menu)
    assert db.menu_requirements.find_one({}) == before
    assert client.get(url).json()["days"][0]["items"][0]["servings"][0]["children_count"] == 263
    assert month(client, identities)["items"][0]["requirement_stale"] is True


def test_template_editing_unchanged(daily_menu):
    client, identities, db, menu = daily_menu
    template_id = ObjectId(menu["source_menu_id"])
    db.weekly_menus.update_one(
        {"_id": template_id},
        {"$set": {"created_by": identities.lower_admin.id, "days.0.closed_at": datetime.now(UTC)}},
    )
    url = f"/api/v1/menus/weekly/{template_id}"
    template = client.get(url).json()
    response = client.patch(
        url,
        json={"revision": template["revision"], "title": "Нова назва"},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text


def test_regeneration_removes_only_zero_group_and_updates_norm_report(daily_menu):
    client, identities, db, menu = daily_menu
    # A second same-age group exercises deletion without deleting the other requirement.
    school = db.schools.find_one({"_id": identities.own_school.id})
    second_group = deepcopy(school["groups"][0])
    second_group["id"] = ObjectId()
    second_group["name"] = "Друга група"
    db.schools.update_one({"_id": school["_id"]}, {"$push": {"groups": second_group}})
    menu["days"][0]["items"][0]["servings"].append(
        {"school_group_id": str(second_group["id"]), "age_group": "6-11", "children_count": 10}
    )
    url = f"/api/v1/menus/weekly/{menu['id']}"
    menu = client.patch(
        url, json={"revision": menu["revision"], "days": menu["days"]}, headers=csrf_headers(client)
    ).json()
    assert regenerate(client, identities, menu).status_code == 200
    assert db.menu_requirements.count_documents({}) == 2
    menu = client.get(url).json()
    menu["days"][0]["items"][0]["servings"][1]["children_count"] = 0
    menu = save_count(client, menu, 263).json()

    def report():
        login(client, identities.admin.username, identities.admin_password)
        response = client.get(
            "/api/v1/norm-compliance/report",
            params={
                "school_id": str(identities.own_school.id),
                "date_from": "2026-07-06",
                "date_to": "2026-07-10",
                "school_group_id": str(identities.own_school.groups[0].id),
                "meal_type": "lunch",
            },
        )
        assert response.status_code == 200, response.text
        login(client, identities.lower_admin.username, identities.lower_admin_password)
        return response.json()["groups"][0]["sections"][0]

    assert report()["stale_dates"] == ["2026-07-06"]
    assert regenerate(client, identities, menu).status_code == 200
    assert report()["stale_dates"] == []
    assert db.menu_requirements.count_documents({}) == 1
    assert db.menu_requirements.find_one({})["school_group_id"] != second_group["id"]


def test_admin_cannot_regenerate_inactive_template_or_stale_revision(daily_menu):
    client, identities, db, menu = daily_menu
    assert (
        regenerate(client, identities, {**menu, "revision": menu["revision"] + 1}).status_code
        == 400
    )
    assert regenerate(client, identities, {**menu, "id": menu["source_menu_id"]}).status_code == 400
    db.schools.update_one({"_id": identities.own_school.id}, {"$set": {"is_active": False}})
    assert regenerate(client, identities, menu).status_code == 400
    assert save_count(client, menu, 263).status_code == 400


def test_zero_children_stale_semantics(daily_menu):
    client, identities, db, menu = daily_menu
    url = f"/api/v1/menus/weekly/{menu['id']}"

    # State A: Virgin zero-children day (expected_ids == empty, existing == empty, hash is None)
    virgin = db.weekly_menus.find_one({"_id": ObjectId(menu["id"])})
    virgin["_id"] = ObjectId()
    virgin["source_menu_id"] = ObjectId()
    virgin["days"][0]["items"][0]["servings"][0]["children_count"] = 0
    virgin["days"][0]["requirements_generated_hash"] = None
    virgin["days"][0]["closed_at"] = None
    virgin["days"][0]["reopened_at"] = None
    db.weekly_menus.insert_one(virgin)
    db.menu_requirements.delete_many({"weekly_menu_id": virgin["_id"]})

    month_items = month(client, identities)["items"]
    virgin_item = next(item for item in month_items if item["menu_id"] == str(virgin["_id"]))
    assert virgin_item["requirement_stale"] is False

    # State B: Previously generated day later corrected to zero children
    # First, generate requirements for our primary menu with 298 children
    assert regenerate(client, identities, menu).status_code == 200
    assert db.menu_requirements.count_documents({"weekly_menu_id": ObjectId(menu["id"])}) == 1
    assert month(client, identities)["items"][0]["requirement_stale"] is False

    # Set children count to 0 -> stale = True
    menu = client.get(url).json()
    saved = save_count(client, menu, 0).json()
    assert month(client, identities)["items"][0]["requirement_stale"] is True

    # Regenerate with 0 children -> requirements removed, hash updated -> stale = False afterward
    reg_zero = regenerate(client, identities, saved)
    assert reg_zero.status_code == 200
    assert db.menu_requirements.count_documents({"weekly_menu_id": ObjectId(menu["id"])}) == 0
    db_menu = db.weekly_menus.find_one({"_id": ObjectId(menu["id"])})
    assert db_menu["days"][0]["requirements_generated_hash"] is not None
    assert month(client, identities)["items"][0]["requirement_stale"] is False

    # State C: Day was regenerated and then edited -> stale = True
    refreshed_menu = client.get(url).json()
    saved_again = save_count(client, refreshed_menu, 50).json()
    assert month(client, identities)["items"][0]["requirement_stale"] is True

    # State D: Existing requirement source_day_hash mismatches current day -> stale = True
    assert regenerate(client, identities, saved_again).status_code == 200
    assert month(client, identities)["items"][0]["requirement_stale"] is False
    # Mutate day directly in DB to simulate mismatch
    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])},
        {"$set": {"days.0.notes": "Змінено після генерації"}},
    )
    assert month(client, identities)["items"][0]["requirement_stale"] is True


def test_technologist_cannot_mutate_school_copy(daily_menu):
    client, identities, db, menu = daily_menu
    login(client, identities.admin.username, identities.admin_password)
    tech_resp = client.post(
        "/api/v1/admin/admins",
        json={
            "username": "tech.authorizer",
            "email": "tech.authorizer@example.com",
            "password": "tech-password-123",
            "role": "TECHNOLOGIST",
            "permissions": [],
        },
        headers=csrf_headers(client),
    )
    assert tech_resp.status_code == 201

    login(client, "tech.authorizer", "tech-password-123")
    # Technologist can read school copy
    read_resp = client.get(f"/api/v1/menus/weekly/{menu['id']}")
    assert read_resp.status_code == 200, read_resp.text

    # Technologist cannot mutate school copy
    before_menu = db.weekly_menus.find_one({"_id": ObjectId(menu["id"])})
    patch_resp = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"revision": menu["revision"], "title": "Спроба технолога"},
        headers=csrf_headers(client),
    )
    assert patch_resp.status_code == 403, patch_resp.text
    assert patch_resp.json()["detail"] == "Technologists cannot modify school menu copies"
    after_menu = db.weekly_menus.find_one({"_id": ObjectId(menu["id"])})
    assert before_menu == after_menu

    # Technologist can mutate template menu
    template_id = str(menu["source_menu_id"])
    template = client.get(f"/api/v1/menus/weekly/{template_id}").json()
    tmpl_patch = client.patch(
        f"/api/v1/menus/weekly/{template_id}",
        json={"revision": template["revision"], "title": "Шаблон оновлено технологом"},
        headers=csrf_headers(client),
    )
    assert tmpl_patch.status_code == 200, tmpl_patch.text
    assert tmpl_patch.json()["title"] == "Шаблон оновлено технологом"


def test_regenerate_nonexistent_weekday_404(daily_menu):
    client, identities, db, menu = daily_menu
    response = client.post(
        f"/api/v1/menus/daily/{identities.own_school.id}/{menu['id']}/saturday/regenerate",
        json={"revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "Daily menu not found"


def test_dec_jan_calendar_month_boundaries(daily_menu, monkeypatch):
    client, identities, db, menu = daily_menu
    url = f"/api/v1/menus/weekly/{menu['id']}"

    # Today is Dec 31, 2026
    monkeypatch.setattr(
        "app.modules.menus.day_closure._today_in_school_timezone", lambda: date(2026, 12, 31)
    )
    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])},
        {"$set": {"days.0.date": "2026-12-31", "days.0.closed_at": datetime.now(UTC)}},
    )
    resp = client.post(f"{url}/days/monday/reopen", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text

    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])},
        {"$set": {"days.0.date": "2027-01-01", "days.0.closed_at": datetime.now(UTC)}},
    )
    resp = client.post(f"{url}/days/monday/reopen", headers=csrf_headers(client))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "Only current-month daily menus can be reopened"

    # Today is Jan 01, 2027
    monkeypatch.setattr(
        "app.modules.menus.day_closure._today_in_school_timezone", lambda: date(2027, 1, 1)
    )
    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])},
        {"$set": {"days.0.date": "2026-12-31", "days.0.closed_at": datetime.now(UTC)}},
    )
    resp = client.post(f"{url}/days/monday/reopen", headers=csrf_headers(client))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "Only current-month daily menus can be reopened"

    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])},
        {"$set": {"days.0.date": "2027-01-01", "days.0.closed_at": datetime.now(UTC)}},
    )
    resp = client.post(f"{url}/days/monday/reopen", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text


def test_school_user_generation_clears_stale_even_with_prior_admin_hash(daily_menu):
    client, identities, db, menu = daily_menu
    # 1. ADMIN regenerates positive requirements
    reg_resp = regenerate(client, identities, menu)
    assert reg_resp.status_code == 200, reg_resp.text
    initial_month = month(client, identities)
    assert initial_month["items"][0]["requirement_stale"] is False
    admin_hash = db.weekly_menus.find_one({"_id": ObjectId(menu["id"])})["days"][0][
        "requirements_generated_hash"
    ]
    assert admin_hash is not None

    # 2. SCHOOL_USER edits day
    login(client, identities.school_user.username, identities.school_user_password)
    url = f"/api/v1/menus/weekly/{menu['id']}"
    current_menu = client.get(url).json()
    save_resp = save_count(client, current_menu, 175)
    assert save_resp.status_code == 200, save_resp.text

    # 3. SCHOOL_USER generates requirements via normal flow
    gen_resp = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert gen_resp.status_code == 200, gen_resp.text

    # Verify requirements match current day, while WeeklyMenu still has the older admin hash
    req = db.menu_requirements.find_one({"weekly_menu_id": ObjectId(menu["id"])})
    assert req["dishes"][0]["children_count"] == 175
    db_menu = db.weekly_menus.find_one({"_id": ObjectId(menu["id"])})
    assert db_menu["days"][0]["requirements_generated_hash"] == admin_hash
    assert db_menu["days"][0]["requirements_generated_hash"] != req["source_day_hash"]

    # 4. Admin month API reports requirement_stale == False
    login(client, identities.lower_admin.username, identities.lower_admin_password)
    after_month = month(client, identities)
    assert after_month["items"][0]["requirement_stale"] is False


def test_month_daily_menus_maps_requirement_validation_error_to_400(daily_menu):
    client, identities, db, menu = daily_menu
    # Add a serving with an unknown school group id and count > 0 to simulate malformed data
    db.weekly_menus.update_one(
        {"_id": ObjectId(menu["id"])},
        {"$set": {"days.0.items.0.servings.0.school_group_id": ObjectId()}},
    )
    response = client.get(
        "/api/v1/menus/daily/month",
        params={"school_id": str(identities.own_school.id), "year": 2026, "month": 7},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "School group not found"


