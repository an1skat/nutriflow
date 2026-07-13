from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query

from app.api.errors import not_found
from app.modules.admin.schemas import SchoolGroupListResponse, SchoolGroupResponse
from app.modules.admin.service import SchoolGroupNotFoundError, get_school_group, list_school_groups
from app.modules.auth.dependencies import require_roles
from app.modules.identity.models import User, UserRole

router = APIRouter()

SchoolUser = Annotated[
    User,
    Depends(require_roles(UserRole.SCHOOL_USER)),
]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


@router.get(
    "/groups",
    response_model=SchoolGroupListResponse,
)
async def list_own_school_groups(
    current_user: SchoolUser,
    offset: Offset = 0,
    limit: Limit = 50,
) -> SchoolGroupListResponse:
    groups, total = await list_school_groups(
        current_user.school_id,
        offset=offset,
        limit=limit,
    )
    return SchoolGroupListResponse(
        items=[
            SchoolGroupResponse.from_group(group, school_id=current_user.school_id)
            for group in groups
        ],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/groups/{group_id}",
    response_model=SchoolGroupResponse,
)
async def get_own_school_group(
    group_id: PydanticObjectId,
    current_user: SchoolUser,
) -> SchoolGroupResponse:
    try:
        group = await get_school_group(current_user.school_id, group_id)
    except SchoolGroupNotFoundError as exc:
        raise not_found(exc) from exc

    return SchoolGroupResponse.from_group(group, school_id=current_user.school_id)
