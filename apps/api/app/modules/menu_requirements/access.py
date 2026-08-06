from collections import defaultdict

from beanie import PydanticObjectId

from app.modules.identity.models import Community, School, User, UserRole
from app.modules.menu_requirements.errors import (
    MenuRequirementAccessDeniedError,
    MenuRequirementNotFoundError,
)


async def allowed_school_ids(current_user: User) -> list[PydanticObjectId] | None:
    if current_user.role == UserRole.SCHOOL_USER:
        if current_user.school_id is None:
            raise MenuRequirementAccessDeniedError("School access denied")
        return [current_user.school_id]

    if current_user.role == UserRole.ADMIN:
        schools = await School.find(School.admin_owner_id == current_user.id).to_list()
        return [school.id for school in schools]

    if current_user.role in {UserRole.OWNER, UserRole.TECHNOLOGIST}:
        return None

    raise MenuRequirementAccessDeniedError("Menu requirement access denied")


async def can_access_school(
    current_user: User,
    school_id: PydanticObjectId,
) -> bool:
    school_ids = await allowed_school_ids(current_user)
    return school_ids is None or school_id in school_ids


async def get_accessible_community_schools(
    current_user: User,
    community: Community,
) -> list[School]:
    if current_user.role == UserRole.SCHOOL_USER:
        raise MenuRequirementAccessDeniedError("Community access denied")

    schools = await (
        School.find(School.community == community).sort([("name", 1), ("_id", 1)]).to_list()
    )
    if not schools:
        raise MenuRequirementNotFoundError("Community has no schools")

    school_ids = await allowed_school_ids(current_user)
    if school_ids is not None:
        allowed = set(school_ids)
        if any(school.id not in allowed for school in schools):
            raise MenuRequirementAccessDeniedError("Community access denied")

    return schools


async def list_accessible_communities(
    current_user: User,
) -> list[tuple[Community, list[School]]]:
    if current_user.role == UserRole.SCHOOL_USER:
        raise MenuRequirementAccessDeniedError("Community access denied")

    schools = await (
        School.find({"community": {"$ne": None}})
        .sort([("community", 1), ("name", 1), ("_id", 1)])
        .to_list()
    )

    schools_by_community: dict[Community, list[School]] = defaultdict(list)
    for school in schools:
        if school.community is not None:
            schools_by_community[school.community].append(school)

    school_ids = await allowed_school_ids(current_user)
    allowed = set(school_ids) if school_ids is not None else None

    return [
        (community, community_schools)
        for community, community_schools in sorted(
            schools_by_community.items(),
            key=lambda item: item[0],
        )
        if allowed is None or all(school.id in allowed for school in community_schools)
    ]
