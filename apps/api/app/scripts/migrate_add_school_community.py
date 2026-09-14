"""One-time migration: add Community metadata and replace legacy school indexes.

Run from apps/api:
    uv run python -m app.scripts.migrate_add_school_community
"""

from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime

import pymongo
from bson import ObjectId
from pydantic import TypeAdapter, ValidationError

from app.core.config import get_settings
from app.modules.identity.models import (
    Community,
    CommunityCode,
    School,
    TrimmedName,
    community_name_key,
)

LEGACY_COMMUNITY_NAMES = {
    "obukhivska": "Обухівська громада",
}
LEGACY_SCHOOL_INDEXES = (
    "uq_school_code",
    "ix_school_admin_owner",
)

_community_code_adapter = TypeAdapter(CommunityCode)
_community_name_adapter = TypeAdapter(TrimmedName)


class CommunityMigrationError(RuntimeError):
    """The production data cannot be migrated without an explicit decision."""


@dataclass(frozen=True)
class CommunityMutation:
    code: str
    name: str
    admin_owner_id: ObjectId | None
    existing_id: ObjectId | None = None


def audit_community_migration(
    school_documents: Iterable[Mapping[str, object]],
    community_documents: Iterable[Mapping[str, object]],
) -> list[CommunityMutation]:
    """Validate all references and return the complete mutation plan."""
    existing_by_code: dict[str, Mapping[str, object]] = {}
    name_key_to_code: dict[str, str] = {}

    for document in community_documents:
        code = _validate_stored_code(document.get("code"), context="Community")
        name = _validate_stored_name(document.get("name"), code=code)
        expected_name_key = community_name_key(name)
        if document.get("name_key") != expected_name_key:
            raise CommunityMigrationError(
                f"Community '{code}' has an invalid name_key; expected '{expected_name_key}'"
            )

        community_id = document.get("_id")
        if not isinstance(community_id, ObjectId):
            raise CommunityMigrationError(f"Community '{code}' has an invalid _id")
        _validate_owner_id(document.get("admin_owner_id"), context=f"Community '{code}'")

        if code in existing_by_code:
            raise CommunityMigrationError(f"Duplicate Community.code '{code}'")
        duplicate_name_code = name_key_to_code.get(expected_name_key)
        if duplicate_name_code is not None and duplicate_name_code != code:
            raise CommunityMigrationError(
                f"Communities '{duplicate_name_code}' and '{code}' have the same normalized name"
            )

        existing_by_code[code] = document
        name_key_to_code[expected_name_key] = code

    owner_counts_by_code: dict[str, Counter[ObjectId | None]] = defaultdict(Counter)
    for document in school_documents:
        raw_code = document.get("community")
        if raw_code is None:
            continue
        school_id = document.get("_id", "<unknown>")
        code = _validate_stored_code(raw_code, context=f"School '{school_id}'")
        owner_id = _validate_owner_id(
            document.get("admin_owner_id"),
            context=f"School '{school_id}'",
        )
        owner_counts_by_code[code][owner_id] += 1

    mutations: list[CommunityMutation] = []
    for code in sorted(owner_counts_by_code):
        owner_id = _resolve_legacy_owner(code, owner_counts_by_code[code])
        existing = existing_by_code.get(code)
        if existing is None:
            name = LEGACY_COMMUNITY_NAMES.get(code)
            if name is None:
                raise CommunityMigrationError(
                    f"School.community '{code}' has no Community document "
                    "and no legacy name mapping"
                )
            name_key = community_name_key(name)
            duplicate_name_code = name_key_to_code.get(name_key)
            if duplicate_name_code is not None and duplicate_name_code != code:
                raise CommunityMigrationError(
                    f"Legacy Community '{code}' conflicts by name with '{duplicate_name_code}'"
                )
            name_key_to_code[name_key] = code
            mutations.append(
                CommunityMutation(code=code, name=name, admin_owner_id=owner_id)
            )
            continue

        existing_owner_id = _validate_owner_id(
            existing.get("admin_owner_id"),
            context=f"Community '{code}'",
        )
        if existing_owner_id == owner_id:
            continue
        if existing_owner_id is None and owner_id is not None:
            mutations.append(
                CommunityMutation(
                    code=code,
                    name=str(existing["name"]),
                    admin_owner_id=owner_id,
                    existing_id=existing["_id"],
                )
            )
            continue
        raise CommunityMigrationError(
            f"Community '{code}' owner '{existing_owner_id}' conflicts with school owner "
            f"'{owner_id}'"
        )

    return mutations


def assert_no_orphan_school_communities(
    school_documents: Iterable[Mapping[str, object]],
    community_documents: Iterable[Mapping[str, object]],
) -> None:
    school_codes = {
        _validate_stored_code(document.get("community"), context="School")
        for document in school_documents
        if document.get("community") is not None
    }
    community_codes = {
        _validate_stored_code(document.get("code"), context="Community")
        for document in community_documents
    }
    missing_codes = sorted(school_codes - community_codes)
    if missing_codes:
        raise CommunityMigrationError(
            f"Postcheck found orphan School.community values: {', '.join(missing_codes)}"
        )


def _validate_stored_code(value: object, *, context: str) -> str:
    try:
        code = _community_code_adapter.validate_python(value)
    except ValidationError as exc:
        raise CommunityMigrationError(
            f"{context} has invalid community code {value!r}"
        ) from exc
    if code != value:
        raise CommunityMigrationError(
            f"{context} community code {value!r} is not stored in canonical form '{code}'"
        )
    return code


def _validate_stored_name(value: object, *, code: str) -> str:
    try:
        name = _community_name_adapter.validate_python(value)
    except ValidationError as exc:
        raise CommunityMigrationError(f"Community '{code}' has invalid name {value!r}") from exc
    if name != value:
        raise CommunityMigrationError(
            f"Community '{code}' name {value!r} is not stored in canonical form"
        )
    return name


def _validate_owner_id(value: object, *, context: str) -> ObjectId | None:
    if value is None or isinstance(value, ObjectId):
        return value
    raise CommunityMigrationError(f"{context} has invalid admin_owner_id {value!r}")


def _resolve_legacy_owner(
    code: str,
    owner_counts: Counter[ObjectId | None],
) -> ObjectId | None:
    non_null_owners = [owner_id for owner_id in owner_counts if owner_id is not None]
    has_ownerless_schools = owner_counts.get(None, 0) > 0
    if len(non_null_owners) > 1 or (non_null_owners and has_ownerless_schools):
        counts = ", ".join(
            f"{owner_id if owner_id is not None else 'null'}={owner_counts[owner_id]}"
            for owner_id in sorted(
                owner_counts,
                key=lambda value: "" if value is None else str(value),
            )
        )
        raise CommunityMigrationError(
            f"Community '{code}' has conflicting school owners: {counts}"
        )
    return non_null_owners[0] if non_null_owners else None


def _apply_community_plan(
    communities: pymongo.collection.Collection,
    plan: list[CommunityMutation],
    *,
    now: datetime,
) -> None:
    for mutation in plan:
        if mutation.existing_id is None:
            communities.update_one(
                {"code": mutation.code},
                {
                    "$setOnInsert": {
                        "name": mutation.name,
                        "name_key": community_name_key(mutation.name),
                        "admin_owner_id": mutation.admin_owner_id,
                        "created_at": now,
                        "updated_at": now,
                    }
                },
                upsert=True,
            )
            continue

        result = communities.update_one(
            {
                "_id": mutation.existing_id,
                "code": mutation.code,
                "admin_owner_id": None,
            },
            {
                "$set": {
                    "admin_owner_id": mutation.admin_owner_id,
                    "updated_at": now,
                }
            },
        )
        if result.matched_count != 1:
            raise CommunityMigrationError(
                f"Community '{mutation.code}' changed after preflight; migration aborted"
            )


def main() -> None:
    settings = get_settings()
    client: pymongo.MongoClient = pymongo.MongoClient(settings.mongo_uri)

    try:
        database = client[settings.mongo_db]
        schools = database[School.Settings.name]
        communities = database[Community.Settings.name]
        now = datetime.now(UTC)

        school_documents = list(schools.find({}, {"community": 1, "admin_owner_id": 1}))
        community_documents = list(communities.find({}))
        plan = audit_community_migration(school_documents, community_documents)
        print(
            f"Preflight passed: {len(school_documents)} school(s), "
            f"{len(community_documents)} existing community document(s)"
        )

        backfill_result = schools.update_many(
            {"community": {"$exists": False}},
            {"$set": {"community": None}},
        )
        _apply_community_plan(communities, plan, now=now)

        postcheck_schools = list(schools.find({}, {"community": 1, "admin_owner_id": 1}))
        postcheck_communities = list(communities.find({}))
        assert_no_orphan_school_communities(postcheck_schools, postcheck_communities)
        remaining_plan = audit_community_migration(
            postcheck_schools,
            postcheck_communities,
        )
        if remaining_plan:
            raise CommunityMigrationError("Postcheck found unapplied Community mutations")
        print("Postcheck passed: every non-null School.community has a valid Community")

        community_indexes = communities.create_indexes(Community.Settings.indexes)
        print(f"Created or verified community indexes: {', '.join(community_indexes)}")
        print(f"Backfilled: {backfill_result.modified_count} school(s)")

        legacy_code_result = schools.update_many(
            {"code": {"$exists": True}},
            {"$unset": {"code": ""}},
        )
        print(f"Removed legacy code from: {legacy_code_result.modified_count} school(s)")

        index_names = schools.create_indexes(School.Settings.indexes)
        print(f"Created or verified indexes: {', '.join(index_names)}")

        current_indexes = schools.index_information()
        for index_name in LEGACY_SCHOOL_INDEXES:
            if index_name in current_indexes:
                schools.drop_index(index_name)
                print(f"Dropped legacy index: {index_name}")
    except CommunityMigrationError as exc:
        raise SystemExit(f"Community migration aborted: {exc}") from exc
    finally:
        client.close()


if __name__ == "__main__":
    main()
