"""Prepare a scoped, reviewable repair plan, then explicitly apply that exact plan.

The Extended JSON plan is also the before-image backup. No documents are deleted.
"""

import argparse
from copy import deepcopy
from datetime import UTC, date, datetime, time
from pathlib import Path

from beanie.odm.utils.encoder import Encoder
from bson import ObjectId, json_util
from pymongo import MongoClient

from app.core.config import get_settings
from app.modules.menu_requirements.models import (
    MenuRequirement,
    MenuRequirementDish,
    MenuRequirementIngredientRow,
)
from app.modules.menu_requirements.repair_norms import repair_requirement_norms


def repaired_fields(document: dict) -> dict:
    raw_date = document["service_date"]
    service_date = raw_date.date() if isinstance(raw_date, datetime) else raw_date
    requirement = MenuRequirement.model_construct(
        service_date=service_date,
        dishes=[MenuRequirementDish.model_validate(dish) for dish in document["dishes"]],
        ingredient_rows=[
            MenuRequirementIngredientRow.model_validate(row) for row in document["ingredient_rows"]
        ],
    )
    repair_requirement_norms(requirement)
    return Encoder().encode(
        {
            "dishes": [dish.model_dump() for dish in requirement.dishes],
            "ingredient_rows": [row.model_dump() for row in requirement.ingredient_rows],
        }
    )


def apply_entry(collection, entry: dict) -> str:
    before, after = entry["before"], entry["after"]
    current = collection.find_one({"_id": before["_id"]})
    if current == before:
        result = collection.update_one(
            # Match the entire before image, including manual edits and revision.
            before,
            {"$set": {**after, "updated_at": datetime.now(UTC)}, "$inc": {"revision": 1}},
        )
        if result.modified_count == 1:
            return "updated"
    elif (
        current
        and current.get("revision") == before.get("revision", 1) + 1
        and all(current.get(key) == value for key, value in after.items())
    ):
        return "already applied"
    raise RuntimeError(f"Concurrent change or missing requirement: {before['_id']}; re-plan")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--school-id", type=ObjectId)
    parser.add_argument("--date-from", type=date.fromisoformat)
    parser.add_argument("--date-to", type=date.fromisoformat)
    parser.add_argument(
        "--plan", type=Path, help="Create NEW plan/backup file (no database writes)"
    )
    parser.add_argument("--apply-plan", type=Path, help="Apply previously reviewed plan/backup")
    args = parser.parse_args()
    if bool(args.plan) == bool(args.apply_plan):
        parser.error("Choose --plan or --apply-plan")
    if args.plan and (
        not args.school_id
        or not args.date_from
        or not args.date_to
        or args.date_from > args.date_to
    ):
        parser.error("Planning requires --school-id and a valid --date-from / --date-to range")
    settings = get_settings()
    with MongoClient(settings.mongo_uri, tz_aware=True) as client:
        collection = client[settings.mongo_db].menu_requirements
        if args.apply_plan:
            plan = json_util.loads(
                args.apply_plan.read_text(), json_options=json_util.JSONOptions(tz_aware=True)
            )
            if plan["database"] != settings.mongo_db:
                raise RuntimeError("Plan database does not match MONGO_DB")
            for entry in plan["entries"]:
                print(entry["before"]["_id"], apply_entry(collection, entry))
            return
        entries = []
        for document in collection.find(
            {
                "school_id": args.school_id,
                "service_date": {
                    "$gte": datetime.combine(args.date_from, time.min, UTC),
                    "$lte": datetime.combine(args.date_to, time.min, UTC),
                },
            }
        ).sort("_id", 1):
            after = repaired_fields(deepcopy(document))
            # Compare typed representations so adding model defaults isn't a repair.
            original = Encoder().encode(
                {
                    "dishes": [
                        MenuRequirementDish.model_validate(d).model_dump()
                        for d in document["dishes"]
                    ],
                    "ingredient_rows": [
                        MenuRequirementIngredientRow.model_validate(r).model_dump()
                        for r in document["ingredient_rows"]
                    ],
                }
            )
            if after != original:
                entries.append({"before": document, "after": after})
                print(
                    document["_id"],
                    document["service_date"].date(),
                    document["school_group_name"],
                    "repair planned",
                )
        plan_data = {
            "schema_version": 1,
            "created_at": datetime.now(UTC),
            "database": settings.mongo_db,
            "school_id": args.school_id,
            "date_from": args.date_from.isoformat(),
            "date_to": args.date_to.isoformat(),
            "entries": entries,
        }
        # Exclusive creation prevents overwriting the only before-image backup.
        with args.plan.open("x") as output:
            output.write(json_util.dumps(plan_data, indent=2))
        print(f"{len(entries)} repairs planned; database unchanged; backup: {args.plan}")


if __name__ == "__main__":
    main()
