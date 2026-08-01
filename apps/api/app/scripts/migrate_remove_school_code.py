"""One-time migration: remove the legacy school code field and its index.

Run from apps/api:
    uv run python -m app.scripts.migrate_remove_school_code
"""

import pymongo

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    client: pymongo.MongoClient = pymongo.MongoClient(settings.mongo_uri)

    try:
        collection = client[settings.mongo_db]["schools"]

        if "uq_school_code" in collection.index_information():
            collection.drop_index("uq_school_code")
            print("Dropped legacy index: uq_school_code")

        result = collection.update_many(
            {"code": {"$exists": True}},
            {"$unset": {"code": ""}},
        )
        print(f"Matched: {result.matched_count}, Modified: {result.modified_count}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
