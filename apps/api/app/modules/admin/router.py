from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.modules.admin.schemas import (
    CreateSchoolRequest,
    CreateSchoolUserRequest,
    SchoolResponse,
    SchoolUserResponse,
)
from app.modules.admin.service import (
    SchoolAlreadyExistsError,
    SchoolInactiveError,
    SchoolNotFoundError,
    SchoolUserAlreadyExistsError,
)
from app.modules.admin.service import (
    create_school as create_school_record,
)
from app.modules.admin.service import (
    create_school_user as create_school_user_record,
)
from app.modules.auth.dependencies import (
    CsrfProtection,
    require_roles,
)
from app.modules.identity.models import User, UserRole

router = APIRouter()

AdminUser = Annotated[
    User,
    Depends(require_roles(UserRole.ADMIN)),
]


@router.post(
    "/schools",
    response_model=SchoolResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_school(
    payload: CreateSchoolRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> SchoolResponse:
    try:
        school = await create_school_record(payload)
    except SchoolAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return SchoolResponse.from_school(school)


@router.post(
    "/schools/{school_id}/users",
    response_model=SchoolUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_school_user(
    school_id: PydanticObjectId,
    payload: CreateSchoolUserRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> SchoolUserResponse:
    try:
        user = await create_school_user_record(
            school_id,
            payload,
        )
    except SchoolNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except (
        SchoolInactiveError,
        SchoolUserAlreadyExistsError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return SchoolUserResponse.from_user(user)
