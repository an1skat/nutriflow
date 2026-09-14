import pytest
from bson import ObjectId

from app.modules.identity.models import community_name_key
from app.scripts.migrate_add_school_community import (
    CommunityMigrationError,
    assert_no_orphan_school_communities,
    audit_community_migration,
)

pytestmark = pytest.mark.no_clean_database


def school(code: object, owner_id: ObjectId | None) -> dict[str, object]:
    return {
        "_id": ObjectId(),
        "community": code,
        "admin_owner_id": owner_id,
    }


def community(
    code: str,
    name: str,
    owner_id: ObjectId | None,
) -> dict[str, object]:
    return {
        "_id": ObjectId(),
        "code": code,
        "name": name,
        "name_key": community_name_key(name),
        "admin_owner_id": owner_id,
    }


def test_migration_infers_the_single_legacy_owner_and_is_idempotent() -> None:
    owner_id = ObjectId()
    schools = [school("obukhivska", owner_id), school("obukhivska", owner_id)]

    first_plan = audit_community_migration(schools, [])

    assert len(first_plan) == 1
    assert first_plan[0].code == "obukhivska"
    assert first_plan[0].name == "Обухівська громада"
    assert first_plan[0].admin_owner_id == owner_id

    migrated = community("obukhivska", "Обухівська громада", owner_id)
    assert audit_community_migration(schools, [migrated]) == []
    assert_no_orphan_school_communities(schools, [migrated])


def test_migration_keeps_ownerless_legacy_community_ownerless() -> None:
    plan = audit_community_migration(
        [school("obukhivska", None), school("obukhivska", None)],
        [],
    )

    assert len(plan) == 1
    assert plan[0].admin_owner_id is None


def test_migration_repairs_existing_ownerless_community_from_legacy_schools() -> None:
    owner_id = ObjectId()
    existing = community("obukhivska", "Обухівська громада", None)

    plan = audit_community_migration(
        [school("obukhivska", owner_id)],
        [existing],
    )

    assert len(plan) == 1
    assert plan[0].existing_id == existing["_id"]
    assert plan[0].admin_owner_id == owner_id


@pytest.mark.parametrize(
    "owners",
    [
        [ObjectId(), ObjectId()],
        [ObjectId(), None],
    ],
)
def test_migration_fails_for_ambiguous_legacy_ownership(
    owners: list[ObjectId | None],
) -> None:
    schools = [school("obukhivska", owner_id) for owner_id in owners]

    with pytest.raises(CommunityMigrationError, match="conflicting school owners") as exc_info:
        audit_community_migration(schools, [])

    for owner_id in owners:
        assert f"{owner_id if owner_id is not None else 'null'}=1" in str(exc_info.value)


def test_migration_fails_for_unknown_or_invalid_legacy_codes() -> None:
    with pytest.raises(CommunityMigrationError, match="no legacy name mapping"):
        audit_community_migration([school("unknown-legacy-code", None)], [])

    with pytest.raises(CommunityMigrationError, match="invalid community code"):
        audit_community_migration([school("INVALID CODE", None)], [])


def test_migration_validates_existing_community_instead_of_overwriting_it() -> None:
    owner_id = ObjectId()
    existing = community("obukhivska", "Обухівська громада", ObjectId())

    with pytest.raises(CommunityMigrationError, match="conflicts with school owner"):
        audit_community_migration([school("obukhivska", owner_id)], [existing])


def test_postcheck_rejects_orphan_school_community() -> None:
    with pytest.raises(CommunityMigrationError, match="orphan School.community"):
        assert_no_orphan_school_communities(
            [school("obukhivska", None)],
            [],
        )
