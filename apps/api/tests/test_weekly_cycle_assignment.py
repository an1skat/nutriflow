import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from datetime import date as Date

import pytest
from beanie import PydanticObjectId
from pymongo import MongoClient
from test_menus_api import (
    create_confirmed_dish_card,
    csrf_headers,
    dish_item,
    login,
    weekly_menu_payload,
)

from app.core.config import get_settings
from app.modules.menus import service
from app.modules.menus.models import WeeklyMenu
from app.modules.menus.schemas import PublishWeeklyMenuRequest


@pytest.fixture
def cycle(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    create_confirmed_dish_card(client, card_number="1.54")
    payload = weekly_menu_payload(items=[dish_item()])
    payload.update(starts_on="2026-09-28", ends_on="2026-10-02")
    payload["days"] = [
        {
            "weekday": weekday,
            "date": (Date(2026, 9, 28) + timedelta(days=i)).isoformat(),
            "items": [dish_item()],
        }
        for i, weekday in enumerate(["monday", "tuesday", "wednesday", "thursday", "friday"])
    ]
    response = client.post("/api/v1/menus/weekly", json=payload, headers=csrf_headers(client))
    assert response.status_code == 201, response.text
    return response.json()


def publish(client, cycle, schools, *, starts_on=None, replace_existing=False):
    return client.post(
        f"/api/v1/menus/weekly/{cycle['id']}/publish",
        json={"school_ids": schools, "starts_on": starts_on, "replace_existing": replace_existing},
        headers=csrf_headers(client),
    )


@pytest.mark.parametrize("status", ["published", "archived", "revoked"])
def test_distributed_legacy_calendar_is_frozen_without_closed_days(seeded_client, cycle, status):
    client, identities = seeded_client
    result = publish(client, cycle, [str(identities.own_school.id)])
    assert result.status_code == 200, result.text
    copy_id = result.json()["created_menu_ids"][0]
    settings = get_settings()
    with MongoClient(settings.mongo_uri) as mongo:
        db = mongo[settings.mongo_db]
        db.weekly_menus.update_one({"_id": PydanticObjectId(copy_id)}, {"$set": {"status": status}})
        before_source = db.weekly_menus.find_one({"_id": PydanticObjectId(cycle["id"])})
        before_copy = db.weekly_menus.find_one({"_id": PydanticObjectId(copy_id)})
        for patch in (
            {"starts_on": "2026-10-05", "ends_on": "2026-10-09"},
            {
                "days": [
                    {**day, "date": "2026-10-05"} if i == 0 else day
                    for i, day in enumerate(cycle["days"])
                ]
            },
        ):
            response = client.patch(
                f"/api/v1/menus/weekly/{cycle['id']}",
                json={**patch, "revision": before_source["revision"]},
                headers=csrf_headers(client),
            )
            assert response.status_code == 400, response.text
            assert "Assign the cycle" in response.json()["detail"]
            assert db.weekly_menus.find_one({"_id": before_source["_id"]}) == before_source
            assert db.weekly_menus.find_one({"_id": before_copy["_id"]}) == before_copy


@pytest.mark.parametrize("publication_metadata", [True, False])
def test_assignment_keeps_school_history_and_requirements_isolated(
    seeded_client, cycle, publication_metadata
):
    client, identities = seeded_client
    school_id = str(identities.own_school.id)
    old = publish(client, cycle, [school_id]).json()["created_menu_ids"][0]
    login(client, identities.school_user.username, identities.school_user_password)
    old_menu = client.get(f"/api/v1/menus/weekly/{old}").json()
    days = deepcopy(old_menu["days"])
    days[0]["items"][0]["name"] = "Шкільна вереснева страва"
    days[0]["items"][0]["servings"] = [
        {
            "school_group_id": str(identities.own_school.groups[0].id),
            "age_group": identities.own_school.groups[0].age_group.value,
            "children_count": 12,
        }
    ]
    update = client.patch(
        f"/api/v1/menus/weekly/{old}",
        json={"days": days, "revision": old_menu["revision"]},
        headers=csrf_headers(client),
    )
    assert update.status_code == 200, update.text
    generated = client.post(
        "/api/v1/menu-requirements/generate",
        json={"weekly_menu_id": old, "weekday": "monday", "service_date": "2026-09-28"},
        headers=csrf_headers(client),
    )
    assert generated.status_code == 200, generated.text
    assert generated.json()["items"][0]["service_date"] == "2026-09-28"
    login(client, identities.admin.username, identities.admin_password)
    source = client.get(f"/api/v1/menus/weekly/{cycle['id']}").json()
    moved_open_week = client.patch(
        f"/api/v1/menus/weekly/{cycle['id']}",
        json={"starts_on": "2026-10-05", "revision": source["revision"]},
        headers=csrf_headers(client),
    )
    assert moved_open_week.status_code == 400, moved_open_week.text
    settings = get_settings()
    with MongoClient(settings.mongo_uri) as mongo:
        db = mongo[settings.mongo_db]
        db.weekly_menus.update_one(
            {"_id": PydanticObjectId(old)},
            {
                "$set": {
                    "days.0.closed_at": datetime.now(UTC),
                    "days.0.closed_by": identities.school_user.id,
                    "days.0.close_reason": "manual",
                    "days.0.reopened_at": datetime.now(UTC),
                    "days.0.reopened_by": identities.admin.id,
                    "days.0.close_notification_pending": True,
                    "days.0.close_notification_sent_at": datetime.now(UTC),
                    "days.0.requirements_generated_hash": "a" * 64,
                }
            },
        )
        before_copy = db.weekly_menus.find_one({"_id": PydanticObjectId(old)})
        if not publication_metadata:
            db.weekly_menus.update_one(
                {"_id": PydanticObjectId(cycle["id"])},
                {"$set": {"published_at": None, "status": "draft"}},
            )
        before_source = db.weekly_menus.find_one({"_id": PydanticObjectId(cycle["id"])})
        before_requirements = list(
            db.menu_requirements.find({"weekly_menu_id": PydanticObjectId(old)})
        )
        login(client, identities.admin.username, identities.admin_password)
        moved = client.patch(
            f"/api/v1/menus/weekly/{cycle['id']}",
            json={"starts_on": "2026-10-05", "revision": before_source["revision"]},
            headers=csrf_headers(client),
        )
        assert moved.status_code == 400
        result = publish(client, cycle, [school_id], starts_on="2026-10-05")
        assert result.status_code == 200, result.text
        result = result.json()
        assert result["source_menu_id"] != cycle["id"]
        new_id = result["created_menu_ids"][0]
        new = db.weekly_menus.find_one({"_id": PydanticObjectId(new_id)})
        assert new["revision"] == 1
        assert new["starts_on"].date() == Date(2026, 10, 5)
        assert new["ends_on"].date() == Date(2026, 10, 9)
        for i, day in enumerate(new["days"]):
            assert day["date"].date() == Date(2026, 10, 5) + timedelta(days=i)
            assert not day["close_notification_pending"]
            for field in (
                "closed_at",
                "closed_by",
                "close_reason",
                "reopened_at",
                "reopened_by",
                "close_notification_sent_at",
                "requirements_generated_hash",
            ):
                assert day[field] is None
            assert day["items"][0]["servings"] == []
            assert day["items"][0]["name"] == cycle["days"][i]["items"][0]["name"]
            assert not day["items"][0]["is_school_customized"]
        assert db.menu_requirements.count_documents({"weekly_menu_id": new["_id"]}) == 0
        for _ in range(2):
            repeated = publish(
                client, cycle, [school_id], starts_on="2026-10-05", replace_existing=True
            )
            assert repeated.status_code == 200, repeated.text
            assert repeated.json()["source_menu_id"] == result["source_menu_id"]
            assert repeated.json()["created_menu_ids"] == []
            assert repeated.json()["replaced_menu_ids"] == []
        assert db.weekly_menus.find_one({"_id": new["_id"]}) == new
        login(client, identities.school_user.username, identities.school_user_password)
        new_menu = client.get(f"/api/v1/menus/weekly/{new_id}").json()
        new_days = deepcopy(new_menu["days"])
        new_days[0]["items"][0]["servings"] = days[0]["items"][0]["servings"]
        saved = client.patch(
            f"/api/v1/menus/weekly/{new_id}",
            json={"days": new_days, "revision": new_menu["revision"]},
            headers=csrf_headers(client),
        )
        assert saved.status_code == 200, saved.text
        october = client.post(
            "/api/v1/menu-requirements/generate",
            json={"weekly_menu_id": new_id, "weekday": "monday", "service_date": "2026-09-28"},
            headers=csrf_headers(client),
        )
        assert october.status_code == 200, october.text
        assert october.json()["items"][0]["service_date"] == "2026-10-05"
        assert october.json()["items"][0]["weekly_menu_id"] == new_id
        assert db.weekly_menus.find_one({"_id": before_copy["_id"]}) == before_copy
        historical = db.weekly_menus.find_one({"_id": before_source["_id"]})
        template_id = historical["cycle_template_id"]
        assert historical == {**before_source, "cycle_template_id": template_id}
        october_source = db.weekly_menus.find_one(
            {"_id": PydanticObjectId(result["source_menu_id"])}
        )
        october_copy = db.weekly_menus.find_one({"_id": new["_id"]})
        login(client, identities.admin.username, identities.admin_password)
        template = client.get(f"/api/v1/menus/weekly/{template_id}").json()
        assert template["starts_on"] is None
        assert template["ends_on"] is None
        assert all(day["date"] is None for day in template["days"])
        template_days = deepcopy(template["days"])
        template_days[0]["items"][0]["name"] = "Нова страва циклу"
        edited = client.patch(
            f"/api/v1/menus/weekly/{template_id}",
            json={
                "title": "Оновлений цикл",
                "days": template_days,
                "revision": template["revision"],
            },
            headers=csrf_headers(client),
        )
        assert edited.status_code == 200, edited.text
        assert db.weekly_menus.find_one({"_id": before_source["_id"]}) == historical
        assert db.weekly_menus.find_one({"_id": before_copy["_id"]}) == before_copy
        assert db.weekly_menus.find_one({"_id": october_source["_id"]}) == october_source
        assert db.weekly_menus.find_one({"_id": october_copy["_id"]}) == october_copy
        assert (
            list(db.menu_requirements.find({"weekly_menu_id": before_copy["_id"]}))
            == before_requirements
        )
        assert client.get(f"/api/v1/menus/weekly/{old}").status_code == 200
        templates = client.get("/api/v1/menus/weekly", params={"template_only": True}).json()[
            "items"
        ]
        instances = client.get("/api/v1/menus/weekly", params={"instances_only": True}).json()[
            "items"
        ]
        assert [menu["id"] for menu in templates] == [str(template_id)]
        assert {menu["id"] for menu in instances} == {cycle["id"], result["source_menu_id"]}
        for origin in (cycle["id"], result["source_menu_id"], str(template_id)):
            future = publish(client, {"id": origin}, [school_id], starts_on="2026-10-12")
            assert future.status_code == 200, future.text
            future_source = client.get(
                f"/api/v1/menus/weekly/{future.json()['source_menu_id']}"
            ).json()
            assert future_source["cycle_template_id"] == str(template_id)
            assert future_source["title"] == "Оновлений цикл · 12.10.2026"
            assert future_source["days"][0]["items"][0]["name"] == "Нова страва циклу"
        assert db.weekly_menus.count_documents({"school_id": None, "cycle_template_id": None}) == 1


def test_promotion_preserves_existing_instances_and_reuses_legacy_week(seeded_client, cycle):
    client, identities = seeded_client
    school_id = str(identities.own_school.id)
    october = publish(client, cycle, [school_id], starts_on="2026-10-05")
    assert october.status_code == 200, october.text
    september = publish(client, cycle, [school_id])
    assert september.status_code == 200, september.text
    settings = get_settings()
    with MongoClient(settings.mongo_uri) as mongo:
        db = mongo[settings.mongo_db]
        old_instance = db.weekly_menus.find_one(
            {"_id": PydanticObjectId(october.json()["source_menu_id"])}
        )
        old_copies = list(db.weekly_menus.find({"school_id": identities.own_school.id}))
        repeated = publish(client, cycle, [school_id], starts_on="2026-09-28")
        assert repeated.status_code == 200, repeated.text
        assert repeated.json()["source_menu_id"] == cycle["id"]
        assert repeated.json()["created_menu_ids"] == []
        historical = db.weekly_menus.find_one({"_id": PydanticObjectId(cycle["id"])})
        template_id = historical["cycle_template_id"]
        assert db.weekly_menus.find_one({"_id": old_instance["_id"]}) == {
            **old_instance,
            "cycle_template_id": template_id,
        }
        assert list(db.weekly_menus.find({"school_id": identities.own_school.id})) == old_copies
        via_october = publish(
            client, {"id": str(old_instance["_id"])}, [school_id], starts_on="2026-10-12"
        )
        assert via_october.status_code == 200, via_october.text
        new_instance = db.weekly_menus.find_one(
            {"_id": PydanticObjectId(via_october.json()["source_menu_id"])}
        )
        assert new_instance["cycle_template_id"] == template_id
        assert db.weekly_menus.count_documents({"school_id": None, "cycle_template_id": None}) == 1


def test_edit_read_before_promotion_cannot_erase_history_link(seeded_client, cycle):
    client, identities = seeded_client
    school_id = str(identities.own_school.id)
    assert publish(client, cycle, [school_id]).status_code == 200
    stale = client.portal.call(WeeklyMenu.get, PydanticObjectId(cycle["id"]))
    assigned = publish(client, cycle, [school_id], starts_on="2026-10-05")
    assert assigned.status_code == 200, assigned.text
    before = client.get(f"/api/v1/menus/weekly/{cycle['id']}").json()
    stale.title = "Застаріле редагування"
    with pytest.raises(service.MenuVersionConflictError):
        client.portal.call(service._replace_weekly_menu_if_current, stale, stale.revision)
    assert client.get(f"/api/v1/menus/weekly/{cycle['id']}").json() == before


@pytest.mark.parametrize("status", ["published", "archived", "revoked"])
def test_different_cycle_conflicts_and_rolls_back_all_schools(seeded_client, cycle, status):
    client, identities = seeded_client
    school = str(identities.own_school.id)
    first = publish(client, cycle, [school], starts_on="2026-10-05")
    assert first.status_code == 200, first.text
    settings = get_settings()
    with MongoClient(settings.mongo_uri) as mongo:
        mongo[settings.mongo_db].weekly_menus.update_one(
            {"_id": PydanticObjectId(first.json()["created_menu_ids"][0])},
            {"$set": {"status": status}},
        )
    other = client.post(
        "/api/v1/menus/weekly",
        json=weekly_menu_payload(title="Цикл 2"),
        headers=csrf_headers(client),
    ).json()
    conflicting = publish(
        client, other, [str(identities.other_school.id), school], starts_on="2026-10-05"
    )
    assert conflicting.status_code == 409, conflicting.text
    assert "Заміна не дозволена" in conflicting.json()["detail"]
    settings = get_settings()
    with MongoClient(settings.mongo_uri) as mongo:
        db = mongo[settings.mongo_db]
        assert (
            db.weekly_menus.count_documents({"cycle_template_id": PydanticObjectId(other["id"])})
            == 0
        )
        assert db.weekly_menus.count_documents({"school_id": identities.other_school.id}) == 0
        assert db.weekly_menus.count_documents({"school_id": identities.own_school.id}) == 1


@pytest.mark.parametrize("different_cycles", [False, True])
@pytest.mark.parametrize("distributed_legacy", [False, True])
def test_concurrent_week_assignments_are_unique(
    seeded_client, cycle, different_cycles, distributed_legacy
):
    client, identities = seeded_client
    if distributed_legacy:
        first = publish(client, cycle, [str(identities.own_school.id)])
        assert first.status_code == 200, first.text
    other = (
        client.post(
            "/api/v1/menus/weekly",
            json=weekly_menu_payload(title="Цикл 2"),
            headers=csrf_headers(client),
        ).json()
        if different_cycles
        else cycle
    )
    original_insert = WeeklyMenu.insert
    ready = asyncio.Event()
    arrivals = 0

    async def concurrent_insert(menu, *args, **kwargs):
        nonlocal arrivals
        if menu.school_id is None:
            arrivals += 1
            if arrivals == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), timeout=5)
        return await original_insert(menu, *args, **kwargs)

    async def run():
        from unittest.mock import patch

        payload = PublishWeeklyMenuRequest(
            school_ids=[identities.own_school.id], starts_on=Date(2026, 10, 5)
        )
        with patch.object(WeeklyMenu, "insert", concurrent_insert):
            return await asyncio.gather(
                service.publish_weekly_menu(
                    PydanticObjectId(cycle["id"]), payload, identities.admin
                ),
                service.publish_weekly_menu(
                    PydanticObjectId(other["id"]), payload, identities.admin
                ),
                return_exceptions=True,
            )

    results = client.portal.call(run)
    successes = [r for r in results if not isinstance(r, Exception)]
    if different_cycles:
        assert len(successes) == 1, results
        assert any(isinstance(r, service.MenuVersionConflictError) for r in results)
    else:
        assert len(successes) == 2, results
        assert successes[0].source_menu_id == successes[1].source_menu_id
        assert sum(len(r.created_menu_ids) for r in successes) == 1
    settings = get_settings()
    with MongoClient(settings.mongo_uri) as mongo:
        assert (
            mongo[settings.mongo_db].weekly_menus.count_documents(
                {
                    "school_id": identities.own_school.id,
                    "starts_on": datetime(2026, 10, 5),
                }
            )
            == 1
        )
        if distributed_legacy and not different_cycles:
            db = mongo[settings.mongo_db]
            historical = db.weekly_menus.find_one({"_id": PydanticObjectId(cycle["id"])})
            assert historical["cycle_template_id"] is not None
            assert (
                db.weekly_menus.count_documents({"school_id": None, "cycle_template_id": None}) == 1
            )


@pytest.mark.parametrize("existing_instance", [False, True])
def test_assignment_does_not_overwrite_concurrent_source_update(
    seeded_client, cycle, monkeypatch, existing_instance
):
    client, identities = seeded_client
    target_id = cycle["id"]
    revision = cycle["revision"]
    if existing_instance:
        first = publish(client, cycle, [str(identities.own_school.id)], starts_on="2026-10-05")
        assert first.status_code == 200, first.text
        target_id = first.json()["source_menu_id"]
        revision = client.get(f"/api/v1/menus/weekly/{target_id}").json()["revision"]
    original_resolve = service.resolve_menu_item_references
    injected = False

    async def resolve_with_concurrent_edit(items):
        nonlocal injected
        result = await original_resolve(items)
        if not injected:
            injected = True
            await WeeklyMenu.get_pymongo_collection().update_one(
                {"_id": PydanticObjectId(target_id)},
                {"$set": {"title": "Паралельне редагування"}, "$inc": {"revision": 1}},
            )
        return result

    monkeypatch.setattr(service, "resolve_menu_item_references", resolve_with_concurrent_edit)
    result = publish(client, cycle, [str(identities.own_school.id)], starts_on="2026-10-05")
    assert result.status_code == 200, result.text
    assert injected
    source = client.get(f"/api/v1/menus/weekly/{target_id}").json()
    assert source["title"] == "Паралельне редагування"
    assert source["revision"] == revision + 1


def test_legacy_publication_rolls_back_on_concurrent_source_edit(seeded_client, cycle, monkeypatch):
    client, identities = seeded_client
    original_replace = service._replace_weekly_menu_if_current

    async def replace_after_edit(menu, revision, *, session=None):
        await WeeklyMenu.get_pymongo_collection().update_one(
            {"_id": PydanticObjectId(cycle["id"])},
            {"$set": {"title": "Паралельне редагування"}, "$inc": {"revision": 1}},
        )
        await original_replace(menu, revision, session=session)

    monkeypatch.setattr(service, "_replace_weekly_menu_if_current", replace_after_edit)
    result = publish(client, cycle, [str(identities.own_school.id)])
    assert result.status_code == 409, result.text
    source = client.get(f"/api/v1/menus/weekly/{cycle['id']}").json()
    assert source["title"] == "Паралельне редагування"
    assert source["revision"] == cycle["revision"] + 1
    assert source["status"] == "draft"
    copies = client.get("/api/v1/menus/weekly", params={"school_id": str(identities.own_school.id)})
    assert copies.json()["items"] == []


def test_templates_and_calendar_instances_are_listed_separately(seeded_client, cycle):
    client, identities = seeded_client
    assigned = publish(client, cycle, [str(identities.own_school.id)], starts_on="2026-10-05")
    assert assigned.status_code == 200, assigned.text
    templates = client.get("/api/v1/menus/weekly", params={"template_only": True}).json()["items"]
    instances = client.get("/api/v1/menus/weekly", params={"instances_only": True}).json()["items"]
    assert [menu["id"] for menu in templates] == [cycle["id"]]
    assert [menu["id"] for menu in instances] == [assigned.json()["source_menu_id"]]
    assert instances[0]["cycle_template_id"] == cycle["id"]
    login(client, identities.school_user.username, identities.school_user_password)
    denied = client.get("/api/v1/menus/weekly", params={"instances_only": True})
    assert denied.status_code == 200
    assert denied.json()["items"] == []


def test_calendar_validation_rejects_new_inconsistent_mutations(seeded_client, cycle):
    client, _ = seeded_client
    before = client.get(f"/api/v1/menus/weekly/{cycle['id']}").json()
    days = deepcopy(cycle["days"])
    days[0]["date"] = "2026-10-05"
    rejected = client.patch(
        f"/api/v1/menus/weekly/{cycle['id']}",
        json={"days": days, "revision": cycle["revision"]},
        headers=csrf_headers(client),
    )
    assert rejected.status_code == 400, rejected.text
    assert client.get(f"/api/v1/menus/weekly/{cycle['id']}").json() == before
    payload = weekly_menu_payload()
    payload.update(starts_on="2026-10-05", ends_on="2026-10-09", days=days)
    days[1]["date"] = "2026-09-29"
    rejected_create = client.post(
        "/api/v1/menus/weekly", json=payload, headers=csrf_headers(client)
    )
    assert rejected_create.status_code == 400, rejected_create.text
