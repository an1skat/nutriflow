"""One-time migration: remove group_key and alternative_label from ingredient_amounts.

Run from apps/api:
    uv run python -m app.scripts.migrate_remove_group_key
"""

import pymongo

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    client: pymongo.MongoClient = pymongo.MongoClient(settings.mongo_uri)
    db = client[settings.mongo_db]

    collection = db["dish_card_versions"]

    has_old_fields = collection.count_documents(
        {
            "$or": [
                {"ingredient_amounts.group_key": {"$exists": True}},
                {"ingredient_amounts.alternative_label": {"$exists": True}},
            ]
        }
    )
    print(f"Documents with old fields: {has_old_fields}")

    if has_old_fields == 0:
        print("Nothing to migrate.")
        client.close()
        return

    result = collection.update_many(
        {},
        {
            "$unset": {
                "ingredient_amounts.$[].group_key": "",
                "ingredient_amounts.$[].alternative_label": "",
            }
        },
    )
    print(f"Matched: {result.matched_count}, Modified: {result.modified_count}")
    client.close()


if __name__ == "__main__":
    main()
