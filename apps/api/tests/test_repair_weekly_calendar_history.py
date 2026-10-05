import sys
from datetime import UTC, datetime, timedelta

import pytest
from bson import BSON, Int64, ObjectId, json_util
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.modules.menus.models import WeeklyMenu
from app.scripts import repair_weekly_calendar_history as repair

INDEX_NAME = "uq_weekly_menu_school_meal_week"


def menu(doc_id, meal, starts_on, *, school=None, source=None, status="published"):
    return {
        "_id": doc_id,
        "school_id": school,
        "source_menu_id": source,
        "cycle_template_id": None,
        "title": "Історичне меню",
        "meal_type": meal,
        "status": status,
        "starts_on": starts_on,
        "ends_on": None,
        "revision": Int64(7),
        "created_at": datetime(2026, 9, 1, tzinfo=UTC),
        "published_at": datetime(2026, 9, 2, tzinfo=UTC),
        "updated_at": datetime(2026, 9, 3, tzinfo=UTC),
        "notes": "Нотатки лишаються",
        "days": [
            {
                "weekday": weekday,
                "date": starts_on + timedelta(days=i),
                "items": [
                    {
                        "id": ObjectId(),
                        "name": "Шкільна страва",
                        "servings": [{"children_count": 12}],
                        "is_school_added": True,
                        "is_school_customized": True,
                        "not_served": True,
                    }
                ],
                "notes": "Збережені нотатки дня",
                "closed_at": datetime(2026, 10, 1, tzinfo=UTC),
                "closed_by": ObjectId(),
                "close_reason": "manual",
                "reopened_at": datetime(2026, 10, 2, tzinfo=UTC),
                "reopened_by": ObjectId(),
                "close_notification_pending": True,
                "close_notification_sent_at": datetime(2026, 10, 3, tzinfo=UTC),
                "requirements_generated_hash": "f" * 64,
            }
            for i, weekday in enumerate(repair.WEEKDAYS)
        ],
    }


def collection_bytes(collection):
    return [BSON.encode(doc) for doc in collection.find().sort("_id", 1)]


@pytest.fixture
def audited_db(seeded_client):
    _, identities = seeded_client
    settings = get_settings()
    assert settings.mongo_db == "nutriflow_test"
    with MongoClient(settings.mongo_uri, tz_aware=True) as client:
        db = client[settings.mongo_db]
        # Reproduce pre-repair corruption that the corrected production index will reject.
        db.weekly_menus.drop_index(INDEX_NAME)
        docs = []
        for source_id, (meal, correct_start) in repair.RESTORATIONS.items():
            starts_on = (
                correct_start
                if source_id == ObjectId("6a84840bf9867d3ec9e6c8a8")
                else datetime(2026, 10, 5, tzinfo=UTC)
            )
            docs.append(menu(source_id, meal, starts_on))
            copy_id = ObjectId()
            docs.append(
                menu(copy_id, meal, starts_on, school=identities.other_school.id, source=source_id)
            )
            db.menu_requirements.insert_one(
                {
                    "_id": ObjectId(),
                    "weekly_menu_id": copy_id,
                    "school_id": identities.other_school.id,
                    "service_date": correct_start,
                    "revision": Int64(3),
                    "dishes": [{"name": "Шкільна страва", "children_count": 12}],
                    "ingredient_rows": [{"amount": "123.45"}],
                }
            )
        for ordinary_id, (special_id, starts_on) in repair.REPLACEMENTS.items():
            ordinary_source = (
                ObjectId("6a84840bf9867d3ec9e6c8a8") if starts_on.day == 28 else ObjectId()
            )
            if ordinary_source not in repair.RESTORATIONS:
                docs.append(menu(ordinary_source, "lunch", starts_on))
            special_source = ObjectId()
            docs.append(menu(special_source, "lunch", starts_on))
            docs.append(
                menu(
                    ordinary_id,
                    "lunch",
                    starts_on,
                    school=identities.own_school.id,
                    source=ordinary_source,
                )
            )
            special = menu(
                special_id,
                "lunch",
                starts_on,
                school=identities.own_school.id,
                source=special_source,
            )
            special["title"] = "Обіди без першого"
            docs.append(special)
            db.menu_requirements.insert_one(
                {
                    "_id": ObjectId(),
                    "weekly_menu_id": ordinary_id,
                    "service_date": starts_on,
                    "children_count": 12,
                    "notes": "Збережена звичайна меню-вимога",
                }
            )
        # The 12 legitimate published/revoked breakfast history pairs must be untouched.
        for _ in range(12):
            school = ObjectId()
            for status in ("published", "revoked"):
                docs.append(
                    menu(
                        ObjectId(),
                        "breakfast",
                        datetime(2026, 9, 14, tzinfo=UTC),
                        school=school,
                        source=ObjectId(),
                        status=status,
                    )
                )
        db.weekly_menus.insert_many(docs)
        yield db, identities.admin.id


def test_plan_cli_is_read_only_and_records_exact_before_images(audited_db, tmp_path, monkeypatch):
    db, actor = audited_db
    menus = collection_bytes(db.weekly_menus)
    requirements = collection_bytes(db.menu_requirements)
    indexes = db.weekly_menus.index_information()
    path = tmp_path / "repair.json"
    monkeypatch.setattr(sys, "argv", ["repair", "--plan", str(path), "--actor-id", str(actor)])
    repair.main()
    plan = json_util.loads(path.read_text(), json_options=repair.JSON_OPTIONS)
    assert [BSON.encode(doc) for doc in plan["weekly_menus_before"]] == menus
    assert collection_bytes(db.weekly_menus) == menus
    assert collection_bytes(db.menu_requirements) == requirements
    assert db.weekly_menus.index_information() == indexes
    assert len(plan["entries"]) == 9  # three sources, three dated copies, three revocations
    assert "SOURCES DATE-RESTORED: 3" in plan["summary"]
    assert "SCHOOL COPIES DATE-RESTORED: 3" in plan["summary"]
    assert "COPIES REVOKED: 3" in plan["summary"]
    assert "EXPECTED PUBLISHED DUPLICATES: 0" in plan["summary"]
    cycle_one_id = ObjectId("6a84840bf9867d3ec9e6c8a8")
    correct_family = {
        doc["_id"]
        for doc in plan["weekly_menus_before"]
        if doc["_id"] == cycle_one_id or doc.get("source_menu_id") == cycle_one_id
    }
    repaired_ids = {entry["before"]["_id"] for entry in plan["entries"]}
    assert repaired_ids & correct_family == {ObjectId("6ab625491038d4c31d4e525b")}
    assert all("ends_on" not in entry["set"] for entry in plan["entries"])


@pytest.mark.parametrize("legacy_end", [None, datetime(2026, 10, 9, tzinfo=UTC)])
def test_apply_preserves_operational_history_requirements_and_untouched_pairs(
    audited_db, legacy_end
):
    db, actor = audited_db
    db.weekly_menus.update_many({}, {"$set": {"ends_on": legacy_end}})
    before = {doc["_id"]: doc for doc in db.weekly_menus.find()}
    requirements = collection_bytes(db.menu_requirements)
    plan = repair.build_plan(db, actor)
    # Exercise the actual file representation, including BSON Int64 revisions.
    plan = json_util.loads(
        json_util.dumps(plan, json_options=repair.JSON_OPTIONS), json_options=repair.JSON_OPTIONS
    )
    repair.apply_plan(db, plan)
    after = list(db.weekly_menus.find())
    assert repair.published_duplicates(after) == []
    assert collection_bytes(db.menu_requirements) == requirements
    entries = {entry["before"]["_id"]: entry for entry in plan["entries"]}
    for doc in after:
        original = before[doc["_id"]]
        assert BSON.encode({"ends_on": doc["ends_on"]}) == BSON.encode(
            {"ends_on": original["ends_on"]}
        )
        assert doc["ends_on"] == legacy_end
        if doc["_id"] not in entries:
            assert BSON.encode(doc) == BSON.encode(original)
            continue
        assert doc == repair.after_image(entries[doc["_id"]])
        assert doc["revision"] == original["revision"] + 1
        assert doc["updated_at"] == original["updated_at"]
        for old_day, new_day in zip(original["days"], doc["days"], strict=True):
            assert {k: v for k, v in new_day.items() if k != "date"} == {
                k: v for k, v in old_day.items() if k != "date"
            }
        assert doc["starts_on"] != datetime(2026, 10, 5, tzinfo=UTC)
    repair.validate_post_repair(after)
    # The corrected real index can now be built despite the intentional historical pairs.
    index = next(i for i in WeeklyMenu.Settings.indexes if i.document.get("name") == INDEX_NAME)
    db.weekly_menus.create_indexes([index])
    with pytest.raises(RuntimeError, match="before-image"):
        repair.apply_plan(db, plan)


@pytest.mark.parametrize(
    "change",
    ["revision", "items", "replacement", "requirements", "new_copy", "relationship", "missing"],
)
def test_before_image_mismatch_aborts_whole_apply(audited_db, change):
    db, actor = audited_db
    plan = repair.build_plan(db, actor)
    source_id = next(iter(repair.RESTORATIONS))
    if change == "revision":
        db.weekly_menus.update_one({"_id": source_id}, {"$inc": {"revision": 1}})
    elif change == "items":
        db.weekly_menus.update_one({"_id": source_id}, {"$set": {"days.0.items.0.name": "Правка"}})
    elif change == "replacement":
        special_id = next(iter(repair.REPLACEMENTS.values()))[0]
        db.weekly_menus.update_one({"_id": special_id}, {"$set": {"status": "revoked"}})
    elif change == "requirements":
        db.menu_requirements.update_one({}, {"$set": {"notes": "Паралельна зміна"}})
    elif change == "relationship":
        ordinary_id = next(iter(repair.REPLACEMENTS))
        db.weekly_menus.update_one({"_id": ordinary_id}, {"$set": {"source_menu_id": ObjectId()}})
    elif change == "missing":
        db.weekly_menus.delete_one({"_id": source_id})
    else:
        ordinary_id = next(iter(repair.REPLACEMENTS))
        ordinary = db.weekly_menus.find_one({"_id": ordinary_id})
        db.weekly_menus.insert_one(
            menu(
                ObjectId(),
                "lunch",
                datetime(2026, 9, 14, tzinfo=UTC),
                school=ordinary["school_id"],
                source=ObjectId(),
            )
        )
    menus = collection_bytes(db.weekly_menus)
    requirements = collection_bytes(db.menu_requirements)
    with pytest.raises(RuntimeError):
        repair.apply_plan(db, plan)
    assert collection_bytes(db.weekly_menus) == menus
    assert collection_bytes(db.menu_requirements) == requirements


def test_failure_after_first_write_rolls_back_transaction(audited_db, monkeypatch):
    db, actor = audited_db
    plan = repair.build_plan(db, actor)
    menus = collection_bytes(db.weekly_menus)
    requirements = collection_bytes(db.menu_requirements)
    collection_type = type(db.weekly_menus)
    original = collection_type.update_one
    calls = 0

    def failing_update(collection, *args, **kwargs):
        nonlocal calls
        if collection.name == "weekly_menus":
            calls += 1
            if calls == 2:
                raise RuntimeError("Injected failure after first write")
        return original(collection, *args, **kwargs)

    monkeypatch.setattr(collection_type, "update_one", failing_update)
    with pytest.raises(RuntimeError, match="Injected failure"):
        repair.apply_plan(db, plan)
    assert calls == 2
    assert collection_bytes(db.weekly_menus) == menus
    assert collection_bytes(db.menu_requirements) == requirements


def test_post_validation_failure_rolls_back_all_writes(audited_db, monkeypatch):
    db, actor = audited_db
    plan = repair.build_plan(db, actor)
    menus = collection_bytes(db.weekly_menus)
    original = repair.validate_post_repair
    calls = 0

    def fail_post(documents):
        nonlocal calls
        calls += 1
        original(documents)
        if calls == 2:  # first is plan validation; second sees the transactional writes
            raise RuntimeError("Post-apply validation failed")

    monkeypatch.setattr(repair, "validate_post_repair", fail_post)
    with pytest.raises(RuntimeError, match="Post-apply"):
        repair.apply_plan(db, plan)
    assert collection_bytes(db.weekly_menus) == menus


def test_plan_rejects_unaudited_content_changes(audited_db):
    db, actor = audited_db
    plan = repair.build_plan(db, actor)
    menus = collection_bytes(db.weekly_menus)
    plan["entries"][0]["set"]["notes"] = "Неавторизована правка"
    with pytest.raises(RuntimeError, match="unaudited"):
        repair.apply_plan(db, plan)
    assert collection_bytes(db.weekly_menus) == menus


def test_lunch_cycle_one_is_only_rewritten_for_individual_date_mismatch(audited_db):
    db, actor = audited_db
    cycle_id = ObjectId("6a84840bf9867d3ec9e6c8a8")
    db.weekly_menus.update_one({"_id": cycle_id}, {"$set": {"days.2.date": datetime(2026, 10, 7)}})
    before = db.weekly_menus.find_one({"_id": cycle_id})
    requirements = collection_bytes(db.menu_requirements)
    plan = repair.build_plan(db, actor)
    entry = next(e for e in plan["entries"] if e["before"]["_id"] == cycle_id)
    assert entry["set"] == {"days.2.date": datetime(2026, 9, 30, tzinfo=UTC)}
    repair.apply_plan(db, plan)
    after = db.weekly_menus.find_one({"_id": cycle_id})
    assert after["ends_on"] is None
    expected = {**before, "revision": before["revision"] + 1}
    expected["days"][2]["date"] = datetime(2026, 9, 30, tzinfo=UTC)
    assert after == expected
    assert collection_bytes(db.menu_requirements) == requirements


def test_school_week_index_allows_history_but_rejects_two_published(seeded_client):
    _, identities = seeded_client
    settings = get_settings()
    assert settings.mongo_db == "nutriflow_test"
    index = next(i for i in WeeklyMenu.Settings.indexes if i.document.get("name") == INDEX_NAME)
    assert index.document["partialFilterExpression"] == {
        "school_id": {"$type": "objectId"},
        "starts_on": {"$type": "date"},
        "status": "published",
    }
    with MongoClient(settings.mongo_uri) as client:
        collection = client[settings.mongo_db].weekly_menus
        for status in ("published", "revoked", "archived"):
            collection.insert_one(
                menu(
                    ObjectId(),
                    "breakfast",
                    datetime(2026, 9, 14),
                    school=identities.own_school.id,
                    source=ObjectId(),
                    status=status,
                )
            )
        with pytest.raises(DuplicateKeyError):
            collection.insert_one(
                menu(
                    ObjectId(),
                    "breakfast",
                    datetime(2026, 9, 14),
                    school=identities.own_school.id,
                    source=ObjectId(),
                )
            )
        assert collection.count_documents({"school_id": identities.own_school.id}) == 3
