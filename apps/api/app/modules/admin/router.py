from typing import Annotated

from beanie import PydanticObjectId
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)

from app.core.config import Settings, get_settings
from app.modules.admin.schemas import (
    AdminUserListResponse,
    AdminUserResponse,
    CreateAdminUserRequest,
    CreateSchoolRequest,
    CreateSchoolUserRequest,
    DeleteSchoolRequest,
    ResetAdminUserPasswordRequest,
    ResetSchoolUserPasswordRequest,
    SchoolGroupListResponse,
    SchoolGroupResponse,
    SchoolListResponse,
    SchoolResponse,
    SchoolUserListResponse,
    SchoolUserResponse,
    UpdateAdminUserRequest,
    UpdateSchoolGroupRequest,
    UpdateSchoolRequest,
    UpdateSchoolUserRequest,
)
from app.modules.admin.security import (
    DELETE_CONFIRMATION_COOKIE_NAME,
    DELETE_CONFIRMATION_TTL_SECONDS,
    create_delete_confirmation_token,
    delete_confirmation_token_is_valid,
)
from app.modules.admin.service import (
    AdminAccessDeniedError,
    AdminUserAlreadyExistsError,
    AdminUserNotFoundError,
    AdminUserOwnsSchoolsError,
    InvalidAdminPasswordError,
    SchoolAlreadyExistsError,
    SchoolGroupNotFoundError,
    SchoolInactiveError,
    SchoolNotFoundError,
    SchoolUserAlreadyExistsError,
    SchoolUserNotFoundError,
    confirm_admin_password,
)
from app.modules.admin.service import (
    create_admin_user as create_admin_user_record,
)
from app.modules.admin.service import (
    create_school as create_school_record,
)
from app.modules.admin.service import (
    create_school_user as create_school_user_record,
)
from app.modules.admin.service import (
    delete_admin_user as delete_admin_user_record,
)
from app.modules.admin.service import (
    delete_school as delete_school_record,
)
from app.modules.admin.service import (
    delete_school_user as delete_school_user_record,
)
from app.modules.admin.service import (
    get_admin_user as get_admin_user_record,
)
from app.modules.admin.service import (
    get_school as get_school_record,
)
from app.modules.admin.service import (
    get_school_group as get_school_group_record,
)
from app.modules.admin.service import (
    get_school_user as get_school_user_record,
)
from app.modules.admin.service import (
    list_admin_users as list_admin_user_records,
)
from app.modules.admin.service import (
    list_school_groups as list_school_groups_records,
)
from app.modules.admin.service import (
    list_school_users as list_school_users_records,
)
from app.modules.admin.service import (
    list_schools as list_school_records,
)
from app.modules.admin.service import (
    reset_admin_user_password as reset_admin_user_password_record,
)
from app.modules.admin.service import (
    reset_school_user_password as reset_school_user_password_record,
)
from app.modules.admin.service import (
    update_admin_user as update_admin_user_record,
)
from app.modules.admin.service import (
    update_school as update_school_record,
)
from app.modules.admin.service import (
    update_school_group as update_school_group_record,
)
from app.modules.admin.service import (
    update_school_user as update_school_user_record,
)
from app.modules.auth.dependencies import (
    CsrfProtection,
    require_any_permission,
    require_owner,
    require_permissions,
)
from app.modules.identity.models import AdminPermission, User, UserRole

router = APIRouter()

AppSettings = Annotated[Settings, Depends(get_settings)]
OwnerUser = Annotated[
    User,
    Depends(require_owner()),
]
SchoolManagerUser = Annotated[
    User,
    Depends(require_permissions(AdminPermission.SCHOOLS_MANAGE)),
]
SchoolListUser = Annotated[
    User,
    Depends(
        require_any_permission(
            AdminPermission.SCHOOLS_MANAGE,
            AdminPermission.MENUS_MANAGE,
        )
    ),
]
SchoolGroupManagerUser = Annotated[
    User,
    Depends(require_permissions(AdminPermission.SCHOOL_GROUPS_MANAGE)),
]
SchoolUserManagerUser = Annotated[
    User,
    Depends(require_permissions(AdminPermission.SCHOOL_USERS_MANAGE)),
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


def forbidden(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=str(exc),
    )


def admin_path(settings: Settings) -> str:
    api_path = settings.api_v1_prefix.rstrip("/") or "/"
    return f"{api_path}/admin"


def has_recent_delete_confirmation(
    request: Request,
    admin: User,
    settings: Settings,
) -> bool:
    token = request.cookies.get(DELETE_CONFIRMATION_COOKIE_NAME)
    return delete_confirmation_token_is_valid(token, admin, settings=settings)


def set_delete_confirmation_cookie(
    response: Response,
    admin: User,
    settings: Settings,
) -> None:
    response.set_cookie(
        key=DELETE_CONFIRMATION_COOKIE_NAME,
        value=create_delete_confirmation_token(admin, settings=settings),
        max_age=DELETE_CONFIRMATION_TTL_SECONDS,
        path=admin_path(settings),
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )


@router.get(
    "/admins",
    response_model=AdminUserListResponse,
)
async def list_admin_users(
    _owner: OwnerUser,
    offset: Offset = 0,
    limit: Limit = 50,
) -> AdminUserListResponse:
    users, total = await list_admin_user_records(
        offset=offset,
        limit=limit,
    )
    return AdminUserListResponse(
        items=[AdminUserResponse.from_user(user) for user in users],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/admins",
    response_model=AdminUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_admin_user(
    payload: CreateAdminUserRequest,
    owner: OwnerUser,
    _csrf: CsrfProtection,
) -> AdminUserResponse:
    try:
        user = await create_admin_user_record(owner, payload)
    except AdminUserAlreadyExistsError as exc:
        raise conflict(exc) from exc

    return AdminUserResponse.from_user(user)


@router.get(
    "/admins/{user_id}",
    response_model=AdminUserResponse,
)
async def get_admin_user(
    user_id: PydanticObjectId,
    _owner: OwnerUser,
) -> AdminUserResponse:
    try:
        user = await get_admin_user_record(user_id)
    except AdminUserNotFoundError as exc:
        raise not_found(exc) from exc

    return AdminUserResponse.from_user(user)


@router.patch(
    "/admins/{user_id}",
    response_model=AdminUserResponse,
)
async def update_admin_user(
    user_id: PydanticObjectId,
    payload: UpdateAdminUserRequest,
    _owner: OwnerUser,
    _csrf: CsrfProtection,
) -> AdminUserResponse:
    try:
        user = await update_admin_user_record(user_id, payload)
    except AdminUserNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminUserAlreadyExistsError as exc:
        raise conflict(exc) from exc
    except AdminUserOwnsSchoolsError as exc:
        raise conflict(exc) from exc

    return AdminUserResponse.from_user(user)


@router.delete(
    "/admins/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_admin_user(
    user_id: PydanticObjectId,
    _owner: OwnerUser,
    _csrf: CsrfProtection,
) -> Response:
    try:
        await delete_admin_user_record(user_id)
    except AdminUserNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminUserOwnsSchoolsError as exc:
        raise conflict(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/admins/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reset_admin_user_password(
    user_id: PydanticObjectId,
    payload: ResetAdminUserPasswordRequest,
    _owner: OwnerUser,
    _csrf: CsrfProtection,
) -> Response:
    try:
        await reset_admin_user_password_record(user_id, payload)
    except AdminUserNotFoundError as exc:
        raise not_found(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/schools",
    response_model=SchoolListResponse,
)
async def list_schools(
    admin: SchoolListUser,
    offset: Offset = 0,
    limit: Limit = 50,
) -> SchoolListResponse:
    schools, total = await list_school_records(
        admin,
        offset=offset,
        limit=limit,
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
    admin: SchoolManagerUser,
    _csrf: CsrfProtection,
) -> SchoolResponse:
    try:
        school = await create_school_record(admin, payload)
    except SchoolAlreadyExistsError as exc:
        raise conflict(exc) from exc
    except (AdminAccessDeniedError, AdminUserNotFoundError) as exc:
        raise forbidden(exc) from exc

    return SchoolResponse.from_school(school)


@router.get(
    "/schools/{school_id}",
    response_model=SchoolResponse,
)
async def get_school(
    school_id: PydanticObjectId,
    admin: SchoolManagerUser,
) -> SchoolResponse:
    try:
        school = await get_school_record(school_id)
        if admin.role == UserRole.ADMIN and school.admin_owner_id != admin.id:
            raise AdminAccessDeniedError("School access denied")
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return SchoolResponse.from_school(school)


@router.patch(
    "/schools/{school_id}",
    response_model=SchoolResponse,
)
async def update_school(
    school_id: PydanticObjectId,
    payload: UpdateSchoolRequest,
    admin: SchoolManagerUser,
    _csrf: CsrfProtection,
) -> SchoolResponse:
    try:
        school = await update_school_record(admin, school_id, payload)
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc
    except SchoolAlreadyExistsError as exc:
        raise conflict(exc) from exc
    except (AdminAccessDeniedError, AdminUserNotFoundError) as exc:
        raise forbidden(exc) from exc

    return SchoolResponse.from_school(school)


@router.delete(
    "/schools/{school_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_school(
    school_id: PydanticObjectId,
    request: Request,
    settings: AppSettings,
    admin: SchoolManagerUser,
    _csrf: CsrfProtection,
    payload: DeleteSchoolRequest | None = None,
) -> Response:
    password_was_required = not has_recent_delete_confirmation(
        request,
        admin,
        settings,
    )

    try:
        if password_was_required:
            confirm_admin_password(admin, payload)

        await delete_school_record(admin, school_id)
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc
    except InvalidAdminPasswordError as exc:
        raise forbidden(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    response = Response(status_code=status.HTTP_204_NO_CONTENT)

    if password_was_required:
        set_delete_confirmation_cookie(response, admin, settings)

    return response


@router.get(
    "/schools/{school_id}/groups",
    response_model=SchoolGroupListResponse,
)
async def list_school_groups(
    school_id: PydanticObjectId,
    admin: SchoolGroupManagerUser,
    offset: Offset = 0,
    limit: Limit = 50,
) -> SchoolGroupListResponse:
    try:
        groups, total = await list_school_groups_records(
            school_id,
            offset=offset,
            limit=limit,
            actor=admin,
        )
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return SchoolGroupListResponse(
        items=[SchoolGroupResponse.from_group(group, school_id=school_id) for group in groups],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/schools/{school_id}/groups/{group_id}",
    response_model=SchoolGroupResponse,
)
async def get_school_group(
    school_id: PydanticObjectId,
    group_id: PydanticObjectId,
    admin: SchoolGroupManagerUser,
) -> SchoolGroupResponse:
    try:
        group = await get_school_group_record(school_id, group_id, actor=admin)
    except (SchoolNotFoundError, SchoolGroupNotFoundError) as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return SchoolGroupResponse.from_group(group, school_id=school_id)


@router.patch(
    "/schools/{school_id}/groups/{group_id}",
    response_model=SchoolGroupResponse,
)
async def update_school_group(
    school_id: PydanticObjectId,
    group_id: PydanticObjectId,
    payload: UpdateSchoolGroupRequest,
    admin: SchoolGroupManagerUser,
    _csrf: CsrfProtection,
) -> SchoolGroupResponse:
    try:
        group = await update_school_group_record(
            school_id,
            group_id,
            payload,
            actor=admin,
        )
    except (SchoolNotFoundError, SchoolGroupNotFoundError) as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return SchoolGroupResponse.from_group(group, school_id=school_id)


@router.get(
    "/schools/{school_id}/users",
    response_model=SchoolUserListResponse,
)
async def list_school_users(
    school_id: PydanticObjectId,
    admin: SchoolUserManagerUser,
    offset: Offset = 0,
    limit: Limit = 50,
) -> SchoolUserListResponse:
    try:
        users, total = await list_school_users_records(
            admin,
            school_id,
            offset=offset,
            limit=limit,
        )
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

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
    admin: SchoolUserManagerUser,
    _csrf: CsrfProtection,
) -> SchoolUserResponse:
    try:
        user = await create_school_user_record(
            admin,
            school_id,
            payload,
        )
    except SchoolNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc
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
    admin: SchoolUserManagerUser,
) -> SchoolUserResponse:
    try:
        user = await get_school_user_record(admin, school_id, user_id)
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return SchoolUserResponse.from_user(user)


@router.patch(
    "/schools/{school_id}/users/{user_id}",
    response_model=SchoolUserResponse,
)
async def update_school_user(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    payload: UpdateSchoolUserRequest,
    admin: SchoolUserManagerUser,
    _csrf: CsrfProtection,
) -> SchoolUserResponse:
    try:
        user = await update_school_user_record(
            admin,
            school_id,
            user_id,
            payload,
        )
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc
    except SchoolUserAlreadyExistsError as exc:
        raise conflict(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return SchoolUserResponse.from_user(user)


@router.delete(
    "/schools/{school_id}/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_school_user(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    admin: SchoolUserManagerUser,
    _csrf: CsrfProtection,
) -> Response:
    try:
        await delete_school_user_record(admin, school_id, user_id)
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/schools/{school_id}/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reset_school_user_password(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    payload: ResetSchoolUserPasswordRequest,
    admin: SchoolUserManagerUser,
    _csrf: CsrfProtection,
) -> Response:
    try:
        await reset_school_user_password_record(
            admin,
            school_id,
            user_id,
            payload,
        )
    except (SchoolNotFoundError, SchoolUserNotFoundError) as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
