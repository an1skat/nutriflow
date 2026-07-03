from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.modules.admin.schemas import (
    CreateSchoolRequest,
    CreateSchoolUserRequest,
    ResetSchoolUserPasswordRequest,
    SchoolListResponse,
    SchoolResponse,
    SchoolUserListResponse,
    SchoolUserResponse,
    UpdateSchoolRequest,
    UpdateSchoolUserRequest,
)
from app.modules.admin.service import (
    SchoolAlreadyExistsError,
    SchoolInactiveError,
    SchoolNotFoundError,
    SchoolUserAlreadyExistsError,
    SchoolUserNotFoundError,
)
from app.modules.admin.service import (
    create_school as create_school_record,
)
from app.modules.admin.service import (
    create_school_user as create_school_user_record,
)
from app.modules.admin.service import (
    delete_school as delete_school_record,
)
from app.modules.admin.service import (
    delete_school_user as delete_school_user_record,
)
from app.modules.admin.service import (
    get_school as get_school_record,
)
from app.modules.admin.service import (
    get_school_user as get_school_user_record,
)
from app.modules.admin.service import (
    list_school_users as list_school_users_records,
)
from app.modules.admin.service import (
    list_schools as list_school_records,
)
from app.modules.admin.service import (
    reset_school_user_password as reset_school_user_password_record,
)
from app.modules.admin.service import (
    update_school as update_school_record,
)
from app.modules.admin.service import (
    update_school_user as update_school_user_record,
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
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


def not_found(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=str(exc),
    )


def conflict(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=str(exc),
    )


@router.get(
    "/schools",
    response_model=SchoolListResponse,
)
async def list_schools(
    _admin: AdminUser,
    offset: Offset = 0,
    limit: Limit = 50,
    include_deleted: bool = False,
) -> SchoolListResponse:
    schools, total = await list_school_records(
        offset=offset,
        limit=limit,
        include_deleted=include_deleted,
    )
    return SchoolListResponse(
        items=[SchoolResponse.from_school(school) for school in schools],
        total=total,
        offset=offset,
        limit=limit,
    )


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
        raise conflict(exc) from exc

    return SchoolResponse.from_school(school)


@router.get(
    "/schools/{school_id}",
    response_model=SchoolResponse,
)
async def get_school(
    school_id: PydanticObjectId,
    _admin: AdminUser,
) -> SchoolResponse:
    try:
        school = await get_school_record(school_id)
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc

    return SchoolResponse.from_school(school)


@router.patch(
    "/schools/{school_id}",
    response_model=SchoolResponse,
)
async def update_school(
    school_id: PydanticObjectId,
    payload: UpdateSchoolRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> SchoolResponse:
    try:
        school = await update_school_record(school_id, payload)
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc
    except SchoolAlreadyExistsError as exc:
        raise conflict(exc) from exc

    return SchoolResponse.from_school(school)


@router.delete(
    "/schools/{school_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_school(
    school_id: PydanticObjectId,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> Response:
    try:
        await delete_school_record(school_id)
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/schools/{school_id}/users",
    response_model=SchoolUserListResponse,
)
async def list_school_users(
    school_id: PydanticObjectId,
    _admin: AdminUser,
    offset: Offset = 0,
    limit: Limit = 50,
    include_deleted: bool = False,
) -> SchoolUserListResponse:
    try:
        users, total = await list_school_users_records(
            school_id,
            offset=offset,
            limit=limit,
            include_deleted=include_deleted,
        )
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc

    return SchoolUserListResponse(
        items=[SchoolUserResponse.from_user(user) for user in users],
        total=total,
        offset=offset,
        limit=limit,
    )


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
        raise not_found(exc) from exc
    except (
        SchoolInactiveError,
        SchoolUserAlreadyExistsError,
    ) as exc:
        raise conflict(exc) from exc

    return SchoolUserResponse.from_user(user)


@router.get(
    "/schools/{school_id}/users/{user_id}",
    response_model=SchoolUserResponse,
)
async def get_school_user(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    _admin: AdminUser,
) -> SchoolUserResponse:
    try:
        user = await get_school_user_record(school_id, user_id)
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc

    return SchoolUserResponse.from_user(user)


@router.patch(
    "/schools/{school_id}/users/{user_id}",
    response_model=SchoolUserResponse,
)
async def update_school_user(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    payload: UpdateSchoolUserRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> SchoolUserResponse:
    try:
        user = await update_school_user_record(
            school_id,
            user_id,
            payload,
        )
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc
    except SchoolUserAlreadyExistsError as exc:
        raise conflict(exc) from exc

    return SchoolUserResponse.from_user(user)


@router.delete(
    "/schools/{school_id}/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_school_user(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> Response:
    try:
        await delete_school_user_record(school_id, user_id)
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/schools/{school_id}/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reset_school_user_password(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    payload: ResetSchoolUserPasswordRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> Response:
    try:
        await reset_school_user_password_record(
            school_id,
            user_id,
            payload,
        )
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
