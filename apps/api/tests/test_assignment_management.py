import asyncio
from copy import deepcopy
from datetime import UTC, datetime
from datetime import date as Date
from unittest.mock import patch

import pytest
from beanie import PydanticObjectId
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
from test_menus_api import csrf_headers, login, weekly_menu_payload
from test_weekly_cycle_assignment import cycle as cycle_fixture
from test_weekly_cycle_assignment import publish

from app.core.config import get_settings
from app.modules.menus import service
from app.modules.menus.models import WeeklyMenu
from app.modules.menus.schemas import PublishWeeklyMenuRequest


@pytest.fixture
def cycle(seeded_client):
    return cycle_fixture.__wrapped__(seeded_client)


WEEK = "2026-10-05"
WRONG = "Меню осінь обіди без першого Обухів 2026: Обіди, ІV тиждень"


def db_client():
    settings = get_settings()
    assert settings.mongo_db == "nutriflow_test"
    mongo = MongoClient(settings.mongo_uri)
    return mongo, mongo[settings.mongo_db]


def new_cycle(client, title="Правильний цикл"):
    response = client.post(
        "/api/v1/menus/weekly", json=weekly_menu_payload(title=title), headers=csrf_headers(client)
    )
    assert response.status_code == 201, response.text
    return response.json()


def conflict(client, target, schools):
    response = publish(client, target, schools, starts_on=WEEK)
    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "assignment_conflict"
    return detail["conflicts"]


def replace(client, target, schools, conflicts):
    return client.post(
        f"/api/v1/menus/weekly/{target['id']}/publish",
        json={
            "school_ids": schools,
            "starts_on": WEEK,
            "replace_existing": True,
            "expected_conflicts": [
                {k: item[k] for k in ("school_id", "menu_id", "revision")} for item in conflicts
            ],
        },
        headers=csrf_headers(client),
    )


def cancel(client, menu):
    return client.post(
        f"/api/v1/menus/weekly/{menu['id']}/cancel-assignment",
        json={"revision": menu["revision"]},
        headers=csrf_headers(client),
    )


def prepare(client, identities, cycle):
    school = str(identities.own_school.id)
    response = publish(client, cycle, [school], starts_on=WEEK)
    assert response.status_code == 200, response.text
    old = client.get(f"/api/v1/menus/weekly/{response.json()['created_menu_ids'][0]}").json()
    return school, old, new_cycle(client)


def add_history(client, identities, old, db):
    login(client, identities.school_user.username, identities.school_user_password)
    days = deepcopy(old["days"])
    days[0]["items"][0]["servings"] = [
        {
            "school_group_id": str(identities.own_school.groups[0].id),
            "age_group": identities.own_school.groups[0].age_group.value,
            "children_count": 12,
        }
    ]
    days[0]["items"][0]["name"] = "Шкільна страва"
    response = client.patch(
        f"/api/v1/menus/weekly/{old['id']}",
        json={"days": days, "revision": old["revision"]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    generated = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": old["id"],
            "weekday": "monday",
            "service_date": WEEK,
        },
        headers=csrf_headers(client),
    )
    assert generated.status_code == 200, generated.text
    now = datetime.now(UTC)
    db.weekly_menus.update_one(
        {"_id": PydanticObjectId(old["id"])},
        {
            "$set": {
                "notes": "Шкільна примітка",
                "days.0.closed_at": now,
                "days.0.closed_by": identities.school_user.id,
                "days.0.close_reason": "manual",
                "days.0.reopened_at": now,
                "days.0.reopened_by": identities.admin.id,
                "days.0.requirements_generated_hash": "a" * 64,
                "days.1.not_served": True,
            }
        },
    )
    stored = db.weekly_menus.find_one({"_id": PydanticObjectId(old["id"])})
    added = deepcopy(stored["days"][0]["items"][0])
    added.update(
        id=PydanticObjectId(),
        position=2,
        name="Додана школою страва",
        notes="Шкільна примітка страви",
        is_school_added=True,
    )
    db.weekly_menus.update_one({"_id": stored["_id"]}, {"$push": {"days.0.items": added}})
    login(client, identities.admin.username, identities.admin_password)
    snapshot = db.weekly_menus.find_one({"_id": PydanticObjectId(old["id"])})
    requirements = list(db.menu_requirements.find({"weekly_menu_id": snapshot["_id"]}))
    assert requirements
    return snapshot, requirements


def assert_history(db, before, requirements):
    after = db.weekly_menus.find_one({"_id": before["_id"]})
    assert after["status"] == "revoked"
    assert after["revision"] == before["revision"] + 1
    for key in before.keys() - {
        "status",
        "revision",
        "revoked_at",
        "revoked_by",
        "revoke_reason",
        "updated_at",
        "updated_by",
    }:
        assert after[key] == before[key], key
    assert list(db.menu_requirements.find({"weekly_menu_id": before["_id"]})) == requirements


@pytest.mark.parametrize("action", ["replace", "cancel"])
def test_incident_preserves_all_history_and_fresh_state(seeded_client, cycle, action):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    mongo, db = db_client()
    with mongo:
        db.schools.update_one(
            {"_id": identities.own_school.id}, {"$set": {"name": "Академічний ліцей №4"}}
        )
        db.weekly_menus.update_one({"_id": PydanticObjectId(old["id"])}, {"$set": {"title": WRONG}})
        before, requirements = add_history(client, identities, old, db)
        sources = list(db.weekly_menus.find({"school_id": None}))
        if action == "cancel":
            current = client.get(f"/api/v1/menus/weekly/{old['id']}").json()
            response = cancel(client, current)
            assert response.status_code == 200, response.text
            assert (
                db.weekly_menus.count_documents(
                    {
                        "school_id": identities.own_school.id,
                        "starts_on": before["starts_on"],
                        "status": "published",
                    }
                )
                == 0
            )
            assert cancel(client, current).status_code == 200
            assert list(db.weekly_menus.find({"school_id": None})) == sources
            assigned = publish(client, cycle, [school], starts_on=WEEK)
        else:
            details = conflict(client, target, [school])
            assert details[0]["existing_title"] == WRONG
            assigned = replace(client, target, [school], details)
        assert assigned.status_code == 200, assigned.text
        result = assigned.json()
        if action == "replace":
            assert result["replaced_menu_ids"] == [old["id"]]
        fresh = db.weekly_menus.find_one({"_id": PydanticObjectId(result["created_menu_ids"][0])})
        assert fresh["_id"] != before["_id"]
        assert fresh["source_menu_id"] == PydanticObjectId(result["source_menu_id"])
        assert fresh["status"] == "published"
        assert fresh["revision"] == 1
        assert fresh["notes"] != before["notes"]
        for day in fresh["days"]:
            assert not day["not_served"]
            for key in (
                "closed_at",
                "closed_by",
                "close_reason",
                "reopened_at",
                "reopened_by",
                "requirements_generated_hash",
            ):
                assert day[key] is None
            for item in day["items"]:
                assert item["servings"] == []
                assert not item["is_school_added"]
                assert not item["is_school_customized"]
                assert item["name"] != "Шкільна страва"
        assert db.menu_requirements.count_documents({"weekly_menu_id": fresh["_id"]}) == 0
        assert_history(db, before, requirements)
        active = client.get(
            "/api/v1/menus/weekly", params={"school_id": school, "status": "published"}
        ).json()["items"]
        assert [m["id"] for m in active] == [str(fresh["_id"])]
        for source in sources:
            assert db.weekly_menus.find_one({"_id": source["_id"]}) == source
        # Old cancel cannot revoke a newer replacement, even with an old revision.
        assert cancel(client, old).status_code == 200
        assert db.weekly_menus.find_one({"_id": fresh["_id"]})["status"] == "published"
        duplicate = deepcopy(fresh)
        duplicate["_id"] = PydanticObjectId()
        with pytest.raises(DuplicateKeyError):
            db.weekly_menus.insert_one(duplicate)
        duplicate["status"] = "revoked"
        db.weekly_menus.insert_one(duplicate)


def test_mixed_batch_and_same_source_idempotency(seeded_client, cycle):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    same_school = str(identities.other_school.id)
    same = publish(client, target, [same_school], starts_on=WEEK).json()
    created = client.post(
        "/api/v1/admin/schools", json={"name": "Третя школа"}, headers=csrf_headers(client)
    )
    assert created.status_code == 201, created.text
    empty_school = created.json()["id"]
    schools = [empty_school, same_school, school]
    details = conflict(client, target, schools)
    assert [c["school_id"] for c in details] == [school]
    result = replace(client, target, schools, details)
    assert result.status_code == 200, result.text
    result = result.json()
    assert len(result["created_menu_ids"]) == 2
    assert result["replaced_menu_ids"] == [old["id"]]
    assert result["skipped_existing_school_ids"] == [same_school]
    assert result["source_menu_id"] == same["source_menu_id"]
    repeated = replace(client, target, schools, []).json()
    assert repeated["created_menu_ids"] == repeated["replaced_menu_ids"] == []
    assert repeated["skipped_existing_school_ids"] == schools


def test_stale_confirmation_rejects_and_rolls_back(seeded_client, cycle):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    details = conflict(client, target, [school])
    mongo, db = db_client()
    with mongo:
        db.weekly_menus.update_one({"_id": PydanticObjectId(old["id"])}, {"$inc": {"revision": 1}})
        before = list(db.weekly_menus.find())
        response = replace(client, target, [school, str(identities.other_school.id)], details)
        assert response.status_code == 409, response.text
        assert response.json()["detail"]["code"] == "assignment_conflict"
        assert list(db.weekly_menus.find()) == before


def test_transaction_rollback_after_revoke(seeded_client, cycle):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    details = conflict(client, target, [school])
    mongo, db = db_client()
    with mongo:
        before = list(db.weekly_menus.find())

        async def fail(*args, **kwargs):
            raise RuntimeError("injected insertion failure")

        with patch.object(WeeklyMenu, "insert_many", fail), pytest.raises(RuntimeError):
            replace(client, target, [school, str(identities.other_school.id)], details)
        assert list(db.weekly_menus.find()) == before


@pytest.mark.parametrize("actor", ["school", "other_admin"])
def test_permissions_do_not_allow_cancellation_or_replacement(seeded_client, cycle, actor):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    details = conflict(client, target, [school])
    if actor == "school":
        login(client, identities.school_user.username, identities.school_user_password)
    else:
        # lower admin cannot manage a school owned by another admin
        mongo, db = db_client()
        with mongo:
            db.schools.update_one(
                {"_id": identities.own_school.id}, {"$set": {"admin_owner_id": identities.admin.id}}
            )
        login(client, identities.lower_admin.username, identities.lower_admin_password)
    assert cancel(client, old).status_code == 403
    assert replace(client, target, [school], details).status_code == 403


def test_cancel_stale_revision_and_template_rejected(seeded_client, cycle):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    assert cancel(client, {**old, "revision": old["revision"] + 1}).status_code == 409
    assert cancel(client, target).status_code == 400
    assert client.get(f"/api/v1/menus/weekly/{old['id']}").json()["status"] == "published"


def test_cancellation_does_not_affect_other_school(seeded_client, cycle):
    client, identities = seeded_client
    response = publish(
        client,
        cycle,
        [str(identities.own_school.id), str(identities.other_school.id)],
        starts_on=WEEK,
    )
    assert response.status_code == 200
    copies = [
        client.get(f"/api/v1/menus/weekly/{mid}").json()
        for mid in response.json()["created_menu_ids"]
    ]
    assert cancel(client, copies[0]).status_code == 200
    assert client.get(f"/api/v1/menus/weekly/{copies[1]['id']}").json() == copies[1]


def test_concurrent_replacements_require_fresh_confirmation(seeded_client, cycle):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    other = new_cycle(client, "Ще один цикл")
    details = conflict(client, target, [school])
    original = service._revoke_copy

    async def run():
        ready = asyncio.Event()
        arrivals = 0

        async def synchronized(*args, **kwargs):
            nonlocal arrivals
            arrivals += 1
            if arrivals == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), 5)
            return await original(*args, **kwargs)

        payload = PublishWeeklyMenuRequest(
            school_ids=[PydanticObjectId(school)],
            starts_on=Date(2026, 10, 5),
            replace_existing=True,
            expected_conflicts=details,
        )
        with patch.object(service, "_revoke_copy", synchronized):
            return await asyncio.gather(
                *[
                    service.publish_weekly_menu(
                        PydanticObjectId(t["id"]), payload, identities.admin
                    )
                    for t in (target, other)
                ],
                return_exceptions=True,
            )

    results = client.portal.call(run)
    assert sum(not isinstance(r, Exception) for r in results) == 1, results
    assert any(isinstance(r, service.AssignmentConflictError) for r in results), results
    mongo, db = db_client()
    with mongo:
        assert (
            db.weekly_menus.count_documents(
                {"school_id": identities.own_school.id, "status": "published"}
            )
            == 1
        )
        assert db.weekly_menus.find_one({"_id": PydanticObjectId(old["id"])})["status"] == "revoked"


def test_replacement_unique_key_retry_revokes_only_once(seeded_client, cycle):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    details = conflict(client, target, [school])
    original = WeeklyMenu.insert_many
    attempts = 0

    async def race(*args, **kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise DuplicateKeyError("simulated unique-key race")
        return await original(*args, **kwargs)

    with patch.object(WeeklyMenu, "insert_many", race):
        response = replace(client, target, [school], details)
    assert response.status_code == 200, response.text
    assert attempts == 2
    revoked = client.get(f"/api/v1/menus/weekly/{old['id']}").json()
    assert revoked["revision"] == old["revision"] + 1
    assert response.json()["replaced_menu_ids"] == [old["id"]]


def test_source_copy_index_upgrade_preserves_documents(seeded_client, cycle):
    from app.db.beanie import upgrade_school_copy_index

    client, identities = seeded_client
    prepare(client, identities, cycle)
    mongo, db = db_client()
    with mongo:
        before = list(db.weekly_menus.find())
        db.weekly_menus.create_index(
            [("source_menu_id", 1), ("school_id", 1)],
            name="uq_weekly_menu_source_school",
            unique=True,
            partialFilterExpression={
                "source_menu_id": {"$type": "objectId"},
                "school_id": {"$type": "objectId"},
            },
        )
        client.portal.call(upgrade_school_copy_index)
        client.portal.call(upgrade_school_copy_index)
        assert "uq_weekly_menu_source_school" not in db.weekly_menus.index_information()
        assert (
            db.weekly_menus.index_information()["uq_weekly_menu_published_source_school"][
                "partialFilterExpression"
            ]["status"]
            == "published"
        )
        assert list(db.weekly_menus.find()) == before


def test_reused_source_cannot_leak_operational_state_into_fresh_copy(seeded_client, cycle):
    client, identities = seeded_client
    school, old, target = prepare(client, identities, cycle)
    source = publish(client, target, [str(identities.other_school.id)], starts_on=WEEK).json()
    mongo, db = db_client()
    with mongo:
        db.weekly_menus.update_one(
            {"_id": PydanticObjectId(source["source_menu_id"])},
            {
                "$set": {
                    "days.0.closed_at": datetime.now(UTC),
                    "days.0.reopened_at": datetime.now(UTC),
                    "days.0.not_served": True,
                    "days.0.requirements_generated_hash": "legacy-hash",
                    "days.0.items.0.servings": [
                        {
                            "school_group_id": identities.own_school.groups[0].id,
                            "age_group": identities.own_school.groups[0].age_group.value,
                            "children_count": 12,
                        }
                    ],
                    "days.0.items.0.is_school_added": True,
                    "days.0.items.0.is_school_customized": True,
                }
            },
        )
        before_source = db.weekly_menus.find_one(
            {"_id": PydanticObjectId(source["source_menu_id"])}
        )
        result = replace(client, target, [school], conflict(client, target, [school]))
        assert result.status_code == 200, result.text
        fresh = db.weekly_menus.find_one(
            {"_id": PydanticObjectId(result.json()["created_menu_ids"][0])}
        )
        day = fresh["days"][0]
        assert not day["not_served"]
        assert day["closed_at"] is day["reopened_at"] is day["requirements_generated_hash"] is None
        assert day["items"][0]["servings"] == []
        assert not day["items"][0]["is_school_added"]
        assert not day["items"][0]["is_school_customized"]
        assert db.weekly_menus.find_one({"_id": before_source["_id"]}) == before_source
