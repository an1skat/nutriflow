"""One-time migration: add communities and replace legacy school indexes.

Run from apps/api:
    uv run python -m app.scripts.migrate_add_school_community
"""

from typing import get_args

import pymongo

from app.core.config import get_settings
from app.modules.identity.models import Community, School

LEGACY_SCHOOL_INDEXES = (
    "uq_school_code",
    "ix_school_admin_owner",
)


def main() -> None:
    settings = get_settings()
    client: pymongo.MongoClient = pymongo.MongoClient(settings.mongo_uri)

    try:
        collection = client[settings.mongo_db][School.Settings.name]
        allowed_communities = list(get_args(Community.__value__))
        invalid_count = collection.count_documents(
            {
                "community": {
                    "$exists": True,
                    "$ne": None,
                    "$nin": allowed_communities,
                }
            }
        )
        if invalid_count:
            raise RuntimeError(
                f"Found {invalid_count} schools with a community outside Community"
            )

        result = collection.update_many(
            {"community": {"$exists": False}},
            {"$set": {"community": None}},
        )
        print(f"Backfilled: {result.modified_count} school(s)")

        legacy_code_result = collection.update_many(
            {"code": {"$exists": True}},
            {"$unset": {"code": ""}},
        )
        print(f"Removed legacy code from: {legacy_code_result.modified_count} school(s)")

        index_names = collection.create_indexes(School.Settings.indexes)
        print(f"Created or verified indexes: {', '.join(index_names)}")

        current_indexes = collection.index_information()
        for index_name in LEGACY_SCHOOL_INDEXES:
            if index_name in current_indexes:
                collection.drop_index(index_name)
                print(f"Dropped legacy index: {index_name}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
