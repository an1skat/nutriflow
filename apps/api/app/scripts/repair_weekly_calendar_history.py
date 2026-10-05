"""One-off historical calendar repair. Planning never initializes ODM or writes indexes.

Usage (from apps/api):
  python -m app.scripts.repair_weekly_calendar_history --plan repair.json --actor-id OWNER_ID
  python -m app.scripts.repair_weekly_calendar_history --apply-plan repair.json

The Extended JSON plan contains full WeeklyMenu before-images and BSON fingerprints
of every MenuRequirement. Apply uses only the recorded mutations, in one transaction.
Revision increases by one per mutated menu; updated_at and operational history stay intact.
The published-only unique index is defined in WeeklyMenu.Settings, not installed here.
"""

import argparse
import hashlib
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path

from bson import BSON, ObjectId, json_util
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from app.core.config import get_settings

RESTORATIONS = {
    ObjectId("6a84840ef9867d3ec9e6c948"): ("breakfast", datetime(2026, 9, 7, tzinfo=UTC)),
    ObjectId("6a84840df9867d3ec9e6c92c"): ("breakfast", datetime(2026, 9, 28, tzinfo=UTC)),
    ObjectId("6a84840cf9867d3ec9e6c8cd"): ("lunch", datetime(2026, 9, 7, tzinfo=UTC)),
    # Already correct: only individual calendar mismatches warrant a write.
    ObjectId("6a84840bf9867d3ec9e6c8a8"): ("lunch", datetime(2026, 9, 28, tzinfo=UTC)),
}
REPLACEMENTS = {
    ObjectId("6aa79d8a20862042f00f8e66"): (
        ObjectId("6aac38aaddd23826456cff01"),
        datetime(2026, 9, 14, tzinfo=UTC),
    ),
    ObjectId("6aab92cbcc8b14a400cbaeac"): (
        ObjectId("6ab0f7ebb56e53566e8bf5c1"),
        datetime(2026, 9, 21, tzinfo=UTC),
    ),
    ObjectId("6ab625491038d4c31d4e525b"): (
        ObjectId("6aba5b1ba0fbf500dd86cd6d"),
        datetime(2026, 9, 28, tzinfo=UTC),
    ),
}
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday")
FORMAT = "nutriflow-weekly-calendar-repair-v1"
JSON_OPTIONS = json_util.CANONICAL_JSON_OPTIONS.with_options(tz_aware=True)


def fingerprint(document: dict) -> str:
    return hashlib.sha256(BSON.encode(document)).hexdigest()


def requirements_snapshot(db, session) -> list[dict]:
    return [
        {"_id": doc["_id"], "sha256": fingerprint(doc)}
        for doc in db.menu_requirements.find({}, session=session).sort("_id", 1)
    ]


def published_duplicates(documents: list[dict]) -> list[list[ObjectId]]:
    groups: dict[tuple, list[ObjectId]] = {}
    for doc in documents:
        if (
            doc.get("status") == "published"
            and isinstance(doc.get("school_id"), ObjectId)
            and isinstance(doc.get("starts_on"), datetime)
        ):
            key = (doc["school_id"], doc["meal_type"], doc["starts_on"])
            groups.setdefault(key, []).append(doc["_id"])
    return [ids for ids in groups.values() if len(ids) > 1]


def calendar_changes(document: dict, starts_on: datetime) -> dict:
    changes = {}
    # ends_on is optional legacy metadata, not part of the audited corruption.
    if document.get("starts_on") != starts_on:
        changes["starts_on"] = starts_on
    weekdays = [day["weekday"] for day in document["days"]]
    if not weekdays or len(set(weekdays)) != len(weekdays) or set(weekdays) - set(WEEKDAYS):
        raise RuntimeError(f"Unexpected weekday shape: {document['_id']}")
    for index, day in enumerate(document["days"]):
        target = starts_on + timedelta(days=WEEKDAYS.index(day["weekday"]))
        if day.get("date") != target:
            changes[f"days.{index}.date"] = target
    return changes


def validate_replacements(documents: dict, *, revoked: bool = False) -> None:
    schools = set()
    for ordinary_id, (special_id, starts_on) in REPLACEMENTS.items():
        ordinary, special = documents.get(ordinary_id), documents.get(special_id)
        if ordinary is None or special is None:
            raise RuntimeError(f"Missing replacement pair: {ordinary_id}, {special_id}")
        schools.add(ordinary.get("school_id"))
        for doc in (ordinary, special):
            if (
                not isinstance(doc.get("school_id"), ObjectId)
                or not isinstance(doc.get("source_menu_id"), ObjectId)
                or doc.get("meal_type") != "lunch"
                or doc.get("starts_on") != starts_on
                or doc["source_menu_id"] not in documents
            ):
                raise RuntimeError(f"Unexpected replacement relationship/calendar: {doc['_id']}")
        if ordinary["school_id"] != special["school_id"]:
            raise RuntimeError("Replacement belongs to another school")
        if ordinary.get("status") != ("revoked" if revoked else "published"):
            raise RuntimeError(f"Unexpected ordinary status: {ordinary_id}")
        if special.get("status") != "published":
            raise RuntimeError(f"Replacement is no longer published: {special_id}")
    if len(schools) != 1:
        raise RuntimeError("Replacement pairs do not belong to the same school")
    last_copy = documents[ObjectId("6ab625491038d4c31d4e525b")]
    if last_copy["source_menu_id"] != ObjectId("6a84840bf9867d3ec9e6c8a8"):
        raise RuntimeError("September 28 ordinary lunch copy no longer belongs to Cycle 1")


def after_image(entry: dict) -> dict:
    result = deepcopy(entry["before"])
    for path, value in entry["set"].items():
        if path.startswith("days."):
            result["days"][int(path.split(".")[1])]["date"] = value
        else:
            result[path] = value
    result["revision"] = result.get("revision", 0) + entry["revision_increment"]
    return result


def calendar_image(document: dict) -> dict:
    return {
        "starts_on": document.get("starts_on"),
        "ends_on": document.get("ends_on"),
        "day_dates": {day["weekday"]: day.get("date") for day in document["days"]},
    }


def validate_post_repair(documents: list[dict]) -> None:
    by_id = {doc["_id"]: doc for doc in documents}
    for source_id, (meal_type, starts_on) in RESTORATIONS.items():
        source = by_id.get(source_id)
        if (
            source is None
            or source.get("school_id") is not None
            or source.get("source_menu_id") is not None
            or source.get("meal_type") != meal_type
        ):
            raise RuntimeError(f"Unexpected historical source: {source_id}")
        family = [source, *[doc for doc in documents if doc.get("source_menu_id") == source_id]]
        for doc in family:
            if doc.get("meal_type") != meal_type or calendar_changes(doc, starts_on):
                raise RuntimeError(f"Calendar invariant failed: {doc['_id']}")
    validate_replacements(by_id, revoked=True)
    duplicates = published_duplicates(documents)
    if duplicates:
        raise RuntimeError(f"PUBLISHED DUPLICATES: {len(duplicates)}; aborting")


def build_plan(db, actor_id: ObjectId) -> dict:
    def read(session):
        actor = db.users.find_one({"_id": actor_id}, session=session)
        if not actor or actor.get("role") not in {"OWNER", "ADMIN"} or not actor.get("is_active"):
            raise RuntimeError("Planning requires an active OWNER/ADMIN --actor-id")
        documents = list(db.weekly_menus.find({}, session=session).sort("_id", 1))
        by_id = {doc["_id"]: doc for doc in documents}
        now = datetime.now(UTC)
        now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
        updates: dict[ObjectId, dict] = {}
        for source_id, (meal_type, starts_on) in RESTORATIONS.items():
            source = by_id.get(source_id)
            if (
                source is None
                or source.get("school_id") is not None
                or source.get("source_menu_id") is not None
                or source.get("meal_type") != meal_type
            ):
                raise RuntimeError(f"Missing/unexpected audited source: {source_id}")
            family = [source, *[d for d in documents if d.get("source_menu_id") == source_id]]
            for doc in family:
                if doc.get("meal_type") != meal_type or (
                    doc is not source and not isinstance(doc.get("school_id"), ObjectId)
                ):
                    raise RuntimeError(f"Unexpected source/copy relationship: {doc['_id']}")
                changes = calendar_changes(doc, starts_on)
                if changes:
                    updates[doc["_id"]] = changes
        # Verify the known pairs against the calendar that will be restored.
        restored = deepcopy(by_id)
        for doc_id, changes in updates.items():
            restored[doc_id] = after_image(
                {"before": by_id[doc_id], "set": changes, "revision_increment": 0}
            )
        validate_replacements(restored)
        for ordinary_id in REPLACEMENTS:
            updates.setdefault(ordinary_id, {}).update(
                status="revoked",
                revoked_at=now,
                revoked_by=actor_id,
                revoke_reason="manual",
                updated_by=actor_id,
            )
        entries = [
            {"before": by_id[doc_id], "set": changes, "revision_increment": 1}
            for doc_id, changes in sorted(updates.items())
        ]
        for entry in entries:
            entry["target_calendar"] = calendar_image(after_image(entry))
            entry["requested_status"] = entry["set"].get("status")
        after = {entry["before"]["_id"]: after_image(entry) for entry in entries}
        validate_post_repair([after.get(doc["_id"], doc) for doc in documents])
        return {
            "format": FORMAT,
            "database": db.name,
            "created_at": now,
            "actor_before": actor,
            "weekly_menus_before": documents,
            "requirements_before": requirements_snapshot(db, session),
            "entries": entries,
        }

    with db.client.start_session() as session:
        return session.with_transaction(read, read_concern=ReadConcern("snapshot"))


def validate_plan(plan: dict, database: str) -> None:
    if plan.get("format") != FORMAT or plan.get("database") != database:
        raise RuntimeError("Wrong plan format/database")
    before = {doc["_id"]: doc for doc in plan["weekly_menus_before"]}
    seen = set()
    for entry in plan["entries"]:
        doc = entry["before"]
        doc_id = doc["_id"]
        if doc_id in seen or before.get(doc_id) != doc or entry["revision_increment"] != 1:
            raise RuntimeError("Invalid or repeated plan entry")
        seen.add(doc_id)
        source_id = doc_id if doc_id in RESTORATIONS else doc.get("source_menu_id")
        permitted = {}
        if source_id in RESTORATIONS:
            permitted = calendar_changes(doc, RESTORATIONS[source_id][1])
        if doc_id in REPLACEMENTS:
            permitted.update(
                status="revoked",
                revoked_at=plan["created_at"],
                revoked_by=plan["actor_before"]["_id"],
                revoke_reason="manual",
                updated_by=plan["actor_before"]["_id"],
            )
        if not permitted or entry["set"] != permitted:
            raise RuntimeError(f"Plan contains unaudited changes: {doc_id}")
        if entry.get("target_calendar") != calendar_image(after_image(entry)) or entry.get(
            "requested_status"
        ) != entry["set"].get("status"):
            raise RuntimeError(f"Inconsistent recorded target: {doc_id}")
    after = {entry["before"]["_id"]: after_image(entry) for entry in plan["entries"]}
    validate_post_repair([after.get(doc["_id"], doc) for doc in before.values()])


def apply_plan(db, plan: dict) -> None:
    validate_plan(plan, db.name)

    def apply(session):
        current = list(db.weekly_menus.find({}, session=session).sort("_id", 1))
        if [fingerprint(d) for d in current] != [
            fingerprint(d) for d in plan["weekly_menus_before"]
        ]:
            raise RuntimeError("WeeklyMenu before-image/IDs changed; abort and generate a new plan")
        if requirements_snapshot(db, session) != plan["requirements_before"]:
            raise RuntimeError("MenuRequirements changed; abort and generate a new plan")
        actor = db.users.find_one({"_id": plan["actor_before"]["_id"]}, session=session)
        if actor != plan["actor_before"]:
            raise RuntimeError("Repair actor changed; abort")
        # Before-image checks cover every copy/source/replacement and any unplanned published key.
        for entry in plan["entries"]:
            result = db.weekly_menus.update_one(
                {"_id": entry["before"]["_id"]},
                {"$set": entry["set"], "$inc": {"revision": entry["revision_increment"]}},
                session=session,
            )
            if result.matched_count != 1:
                raise RuntimeError("Planned document disappeared; abort")
        after = list(db.weekly_menus.find({}, session=session).sort("_id", 1))
        expected = {entry["before"]["_id"]: after_image(entry) for entry in plan["entries"]}
        for original, actual in zip(current, after, strict=True):
            if actual != expected.get(original["_id"], original):
                raise RuntimeError(f"Unexpected content mutation: {original['_id']}")
        validate_post_repair(after)
        if requirements_snapshot(db, session) != plan["requirements_before"]:
            raise RuntimeError("MenuRequirement preservation failed; abort")

    with db.client.start_session() as session:
        session.with_transaction(
            apply, read_concern=ReadConcern("snapshot"), write_concern=WriteConcern("majority")
        )


def summary(plan: dict) -> str:
    lines = []
    source_count = copy_count = revoke_count = 0
    for entry in plan["entries"]:
        doc, changes = entry["before"], entry["set"]
        if any(key == "starts_on" or key.startswith("days.") for key in changes):
            if doc["_id"] in RESTORATIONS:
                source_count += 1
                lines.append(
                    f"RESTORE SOURCE: {doc['_id']} {doc.get('starts_on')} -> "
                    f"{RESTORATIONS[doc['_id']][1].date()}"
                )
            else:
                copy_count += 1
        if changes.get("status") == "revoked":
            revoke_count += 1
            lines.append(
                f"REVOKE REPLACED COPY: {doc['_id']} published -> revoked "
                f"replacement={REPLACEMENTS[doc['_id']][0]}"
            )
    for source_id in RESTORATIONS:
        copies = [d for d in plan["weekly_menus_before"] if d.get("source_menu_id") == source_id]
        mismatches = sum(bool(calendar_changes(d, RESTORATIONS[source_id][1])) for d in copies)
        lines.append(
            f"RESTORE SCHOOL COPIES: source {source_id}; {len(copies)} copies; "
            f"date mismatches: {mismatches}"
        )
    lines.extend(
        [
            f"SOURCES DATE-RESTORED: {source_count}",
            f"SCHOOL COPIES DATE-RESTORED: {copy_count}",
            f"COPIES REVOKED: {revoke_count}",
            f"UNTOUCHED REQUIREMENTS: count={len(plan['requirements_before'])}",
            "REVISION: +1 per mutated document; updated_at preserved",
            "EXPECTED: audited calendars match weekdays; special replacements stay published",
            "EXPECTED: items/servings/closures/relationships/requirements unchanged",
            "EXPECTED: published + revoked historical pairs allowed; no new weeks created",
            "EXPECTED PUBLISHED DUPLICATES: 0",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan", type=Path)
    mode.add_argument("--apply-plan", type=Path)
    parser.add_argument(
        "--actor-id", type=ObjectId, help="Active OWNER/ADMIN ID; required for --plan"
    )
    args = parser.parse_args()
    if args.plan and args.actor_id is None:
        parser.error("--plan requires --actor-id for explicit revocation attribution")
    if args.apply_plan and args.actor_id is not None:
        parser.error("Apply uses the actor recorded in the plan")
    settings = get_settings()
    try:
        with MongoClient(settings.mongo_uri, tz_aware=True) as client:
            db = client[settings.mongo_db]
            if args.plan:
                plan = build_plan(db, args.actor_id)
                plan["summary"] = summary(plan)
                with args.plan.open("x", encoding="utf-8") as output:
                    output.write(
                        json_util.dumps(
                            plan, indent=2, ensure_ascii=False, json_options=JSON_OPTIONS
                        )
                    )
                print(plan["summary"])
                print(f"DATABASE UNCHANGED; plan/backup: {args.plan}")
            else:
                plan = json_util.loads(
                    args.apply_plan.read_text(encoding="utf-8"),
                    json_options=JSON_OPTIONS,
                )
                apply_plan(db, plan)
                print(summary(plan))
                print("PUBLISHED DUPLICATES: 0")
                print("APPLIED: one transaction; historical content and requirements preserved")
    except (RuntimeError, ValueError, KeyError, TypeError, PyMongoError) as exc:
        raise SystemExit(f"ABORT: {exc}") from exc


if __name__ == "__main__":
    main()
