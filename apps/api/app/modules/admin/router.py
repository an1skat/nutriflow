from typing import Annotated

from beanie import PydanticObjectId
from fastapi import (
    APIRouter,
    Depends,
    Query,
    Response,
    status,
)

from app.api.errors import conflict, forbidden, not_found
from app.modules.admin.schemas import (
    AddCommunitySchoolRequest,
    AdminUserListResponse,
    AdminUserResponse,
    CommunityAdminOptionResponse,
    CommunityListResponse,
    CommunityResponse,
    CommunitySchoolOptionResponse,
    CreateAdminUserRequest,
    CreateCommunityRequest,
    CreateSchoolRequest,
    CreateSchoolUserRequest,
    ResetAdminUserPasswordRequest,
    ResetSchoolUserPasswordRequest,
    SchoolGroupListResponse,
    SchoolGroupResponse,
    SchoolListResponse,
    SchoolListSort,
    SchoolResponse,
    SchoolUserListResponse,
    SchoolUserResponse,
    UpdateAdminUserRequest,
    UpdateCommunityRequest,
    UpdateSchoolGroupRequest,
    UpdateSchoolRequest,
    UpdateSchoolUserRequest,
)
from app.modules.admin.service import (
    AdminAccessDeniedError,
    AdminUserAlreadyExistsError,
    AdminUserNotFoundError,
    AdminUserOwnsSchoolsError,
    CommunityAlreadyExistsError,
    CommunityNotFoundError,
    CommunitySchoolConflictError,
    SchoolGroupNotFoundError,
    SchoolInactiveError,
    SchoolNotFoundError,
    SchoolUserAlreadyExistsError,
    SchoolUserNotFoundError,
)
from app.modules.admin.service import (
    add_school_to_community as add_school_to_community_record,
)
from app.modules.admin.service import (
    create_admin_user as create_admin_user_record,
)
from app.modules.admin.service import (
    create_community as create_community_record,
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
    delete_school_user as delete_school_user_record,
)
from app.modules.admin.service import (
    get_admin_user as get_admin_user_record,
)
from app.modules.admin.service import (
    get_community_with_stats as get_community_with_stats_record,
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
    list_communities as list_community_records,
)
from app.modules.admin.service import (
    list_community_admin_options as list_community_admin_option_records,
)
from app.modules.admin.service import (
    list_community_school_options as list_community_school_option_records,
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
    remove_school_from_community as remove_school_from_community_record,
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
    update_community as update_community_record,
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
from app.modules.identity.models import AdminPermission, CommunityCode, User, UserRole

router = APIRouter()

OwnerUser = Annotated[
    User,
    Depends(require_owner()),
]
CommunityManagerUser = Annotated[
    User,
    Depends(require_permissions(AdminPermission.SCHOOLS_MANAGE)),
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
    "/communities",
    response_model=CommunityListResponse,
)
async def list_communities(
    actor: CommunityManagerUser,
    offset: Offset = 0,
    limit: Limit = 50,
) -> CommunityListResponse:
    communities, total = await list_community_records(actor, offset=offset, limit=limit)
    return CommunityListResponse(
        items=[
            CommunityResponse.from_community(
                item.community,
                admin_username=item.admin_username,
                school_count=item.school_count,
            )
            for item in communities
        ],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/communities",
    response_model=CommunityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_community(
    payload: CreateCommunityRequest,
    actor: CommunityManagerUser,
    _csrf: CsrfProtection,
) -> CommunityResponse:
    try:
        item = await create_community_record(actor, payload)
    except CommunityAlreadyExistsError as exc:
        raise conflict(exc) from exc
    except AdminUserNotFoundError as exc:
        raise not_found(exc) from exc
    return CommunityResponse.from_community(
        item.community,
        admin_username=item.admin_username,
        school_count=item.school_count,
    )


@router.get(
    "/communities/admin-options",
    response_model=list[CommunityAdminOptionResponse],
)
async def list_community_admin_options(
    _owner: OwnerUser,
) -> list[CommunityAdminOptionResponse]:
    admins = await list_community_admin_option_records()
    return [CommunityAdminOptionResponse(id=admin.id, username=admin.username) for admin in admins]


@router.get(
    "/communities/school-options",
    response_model=list[CommunitySchoolOptionResponse],
)
async def list_community_school_options(
    actor: CommunityManagerUser,
) -> list[CommunitySchoolOptionResponse]:
    schools = await list_community_school_option_records(actor)
    return [
        CommunitySchoolOptionResponse(
            id=school.id,
            name=school.name,
            community=school.community,
        )
        for school in schools
    ]


@router.get(
    "/communities/{community_id}",
    response_model=CommunityResponse,
)
async def get_community(
    community_id: PydanticObjectId,
    actor: CommunityManagerUser,
) -> CommunityResponse:
    try:
        item = await get_community_with_stats_record(actor, community_id)
    except CommunityNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc
    return CommunityResponse.from_community(
        item.community,
        admin_username=item.admin_username,
        school_count=item.school_count,
    )


@router.patch(
    "/communities/{community_id}",
    response_model=CommunityResponse,
)
async def update_community(
    community_id: PydanticObjectId,
    payload: UpdateCommunityRequest,
    actor: CommunityManagerUser,
    _csrf: CsrfProtection,
) -> CommunityResponse:
    try:
        item = await update_community_record(actor, community_id, payload)
    except CommunityNotFoundError as exc:
        raise not_found(exc) from exc
    except AdminUserNotFoundError as exc:
        raise not_found(exc) from exc
    except CommunityAlreadyExistsError as exc:
        raise conflict(exc) from exc
    return CommunityResponse.from_community(
        item.community,
        admin_username=item.admin_username,
        school_count=item.school_count,
    )


@router.post(
    "/communities/{community_id}/schools",
    response_model=SchoolResponse,
)
async def add_school_to_community(
    community_id: PydanticObjectId,
    payload: AddCommunitySchoolRequest,
    actor: CommunityManagerUser,
    _csrf: CsrfProtection,
) -> SchoolResponse:
    try:
        school = await add_school_to_community_record(actor, community_id, payload)
    except (CommunityNotFoundError, SchoolNotFoundError) as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except CommunitySchoolConflictError as exc:
        raise conflict(exc) from exc
    return SchoolResponse.from_school(school)


@router.delete(
    "/communities/{community_id}/schools/{school_id}",
    response_model=SchoolResponse,
)
async def remove_school_from_community(
    community_id: PydanticObjectId,
    school_id: PydanticObjectId,
    actor: CommunityManagerUser,
    _csrf: CsrfProtection,
) -> SchoolResponse:
    try:
        school = await remove_school_from_community_record(actor, community_id, school_id)
    except (CommunityNotFoundError, SchoolNotFoundError) as exc:
        raise not_found(exc) from exc
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except CommunitySchoolConflictError as exc:
        raise conflict(exc) from exc
    return SchoolResponse.from_school(school)


@router.get(
    "/schools",
    response_model=SchoolListResponse,
)
async def list_schools(
    admin: SchoolListUser,
    community: CommunityCode | None = None,
    sort_by: SchoolListSort = "name",
    offset: Offset = 0,
    limit: Limit = 50,
) -> SchoolListResponse:
    schools, total = await list_school_records(
        admin,
        community=community,
        sort_by=sort_by,
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
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except (AdminUserNotFoundError, CommunityNotFoundError) as exc:
        raise not_found(exc) from exc

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
    except AdminAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except (AdminUserNotFoundError, CommunityNotFoundError) as exc:
        raise not_found(exc) from exc

    return SchoolResponse.from_school(school)


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
