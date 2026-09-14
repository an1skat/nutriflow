import asyncio
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

from app.modules.admin import service
from app.modules.admin.schemas import AddCommunitySchoolRequest, UpdateCommunityRequest
from app.modules.admin.service import AdminAccessDeniedError, CommunitySchoolConflictError
from app.modules.auth.dependencies import require_permissions
from app.modules.identity.models import AdminPermission, School, UserRole

pytestmark = pytest.mark.no_clean_database


def test_update_community_schema_rejects_code() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        UpdateCommunityRequest.model_validate({"code": "community-b"})


@pytest.mark.parametrize(
    ("role", "permissions", "allowed"),
    [
        (UserRole.OWNER, [], True),
        (UserRole.ADMIN, [AdminPermission.SCHOOLS_MANAGE], True),
        (UserRole.ADMIN, [], False),
        (UserRole.TECHNOLOGIST, [], False),
        (UserRole.SCHOOL_USER, [], False),
    ],
)
def test_community_management_permission_matrix(role, permissions, allowed) -> None:
    actor = SimpleNamespace(role=role, permissions=permissions)
    dependency = require_permissions(AdminPermission.SCHOOLS_MANAGE)

    if allowed:
        assert asyncio.run(dependency(actor)) is actor
        return

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(dependency(actor))
    assert exc_info.value.status_code == 403


def test_add_school_uses_atomic_expected_state_and_reports_conflict(monkeypatch) -> None:
    school_id = ObjectId()
    owner_id = ObjectId()
    actor = SimpleNamespace(id=ObjectId(), role=UserRole.OWNER)
    community = SimpleNamespace(code="community-a", admin_owner_id=owner_id)
    school = SimpleNamespace(
        id=school_id,
        community=None,
        admin_owner_id=None,
        updated_at=None,
    )
    captured: dict[str, object] = {}

    class Collection:
        async def update_one(self, query, update):
            captured["query"] = query
            captured["update"] = update
            return SimpleNamespace(matched_count=0)

    async def get_community(*_args):
        return community

    async def get_school(_school_id):
        return school

    monkeypatch.setattr(service, "get_community_for_actor", get_community)
    monkeypatch.setattr(service, "get_school", get_school)
    monkeypatch.setattr(School, "get_pymongo_collection", lambda: Collection())

    with pytest.raises(CommunitySchoolConflictError, match="changed concurrently"):
        asyncio.run(
            service.add_school_to_community(
                actor,
                ObjectId(),
                AddCommunitySchoolRequest(school_id=school_id),
            )
        )

    assert captured["query"] == {
        "_id": school_id,
        "community": None,
        "admin_owner_id": None,
    }
    assert captured["update"]["$set"]["community"] == "community-a"
    assert captured["update"]["$set"]["admin_owner_id"] == owner_id


def test_admin_cannot_remove_a_school_owned_by_another_admin(monkeypatch) -> None:
    actor = SimpleNamespace(id=ObjectId(), role=UserRole.ADMIN)
    community = SimpleNamespace(code="community-a", admin_owner_id=actor.id)
    school = SimpleNamespace(
        id=ObjectId(),
        community="community-a",
        admin_owner_id=ObjectId(),
    )

    async def get_community(*_args):
        return community

    async def get_school(_school_id):
        return school

    monkeypatch.setattr(service, "get_community_for_actor", get_community)
    monkeypatch.setattr(service, "get_school", get_school)

    with pytest.raises(AdminAccessDeniedError, match="School access denied"):
        asyncio.run(
            service.remove_school_from_community(
                actor,
                ObjectId(),
                school.id,
            )
        )
