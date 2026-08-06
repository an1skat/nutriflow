from datetime import UTC, datetime

from beanie import PydanticObjectId
from pymongo.asynchronous.client_session import AsyncClientSession
from pymongo.errors import DuplicateKeyError

from app.db.mongo import get_mongo_client
from app.modules.admin.schemas import (
    CreateAdminUserRequest,
    CreateSchoolRequest,
    CreateSchoolUserRequest,
    ResetAdminUserPasswordRequest,
    ResetSchoolUserPasswordRequest,
    SchoolListSort,
    UpdateAdminUserRequest,
    UpdateSchoolGroupRequest,
    UpdateSchoolRequest,
    UpdateSchoolUserRequest,
)
from app.modules.auth.security import hash_password
from app.modules.identity.models import (
    AdminPermission,
    Community,
    RefreshRevokeReason,
    RefreshSession,
    School,
    SchoolGroup,
    User,
    UserRole,
)


class SchoolNotFoundError(ValueError):
    """The requested school does not exist."""


class SchoolInactiveError(ValueError):
    """The requested school is inactive."""


class SchoolUserAlreadyExistsError(ValueError):
    """A user with the same username or email already exists."""


class SchoolUserNotFoundError(ValueError):
    """The requested school user does not exist in the school."""


class SchoolGroupNotFoundError(ValueError):
    """The requested school group does not exist in the school."""


class AdminAccessDeniedError(ValueError):
    """The administrator cannot operate on the requested tenant data."""


class AdminUserAlreadyExistsError(ValueError):
    """A lower administrator with the same username or email already exists."""


class AdminUserNotFoundError(ValueError):
    """The requested lower administrator does not exist."""


class AdminUserOwnsSchoolsError(ValueError):
    """The requested lower administrator still owns schools."""


async def list_schools(
    actor: User,
    *,
    community: Community | None,
    sort_by: SchoolListSort,
    offset: int,
    limit: int,
) -> tuple[list[School], int]:
    filters: dict[str, object] = {}
    if actor.role == UserRole.ADMIN:
        filters["admin_owner_id"] = actor.id
    if community is not None:
        filters["community"] = community

    sort_fields = ("community", "name", "_id") if sort_by == "community" else ("name", "_id")

    query = School.find(filters)
    total = await query.count()
    schools = await query.sort(*sort_fields).skip(offset).limit(limit).to_list()
    return schools, total


async def get_school(school_id: PydanticObjectId) -> School:
    school = await School.get(school_id)

    if school is None:
        raise SchoolNotFoundError("School not found")

    return school


async def get_school_for_actor(
    actor: User,
    school_id: PydanticObjectId,
) -> School:
    school = await get_school(school_id)
    _ensure_school_access(actor, school)
    return school


async def create_school(actor: User, data: CreateSchoolRequest) -> School:
    admin_owner_id = await _resolve_school_owner(actor, data.admin_owner_id)
    school = School(
        name=data.name,
        community=data.community,
        admin_owner_id=admin_owner_id,
    )

    await school.insert()

    return school


async def update_school(
    actor: User,
    school_id: PydanticObjectId,
    data: UpdateSchoolRequest,
) -> School:
    school = await get_school_for_actor(actor, school_id)
    was_active = school.is_active

    if "name" in data.model_fields_set:
        school.name = data.name
    if "community" in data.model_fields_set:
        school.community = data.community
    if "admin_owner_id" in data.model_fields_set:
        if actor.role != UserRole.OWNER:
            raise AdminAccessDeniedError("Only owner can reassign schools")
        school.admin_owner_id = await _resolve_school_owner(actor, data.admin_owner_id)
    if "is_active" in data.model_fields_set:
        school.is_active = bool(data.is_active)

    school.updated_at = datetime.now(UTC)

    await school.save()

    if was_active and not school.is_active:
        await _revoke_school_sessions(
            school.id,
            reason=RefreshRevokeReason.SCHOOL_DISABLED,
        )

    return school


async def list_school_groups(
    school_id: PydanticObjectId,
    *,
    offset: int,
    limit: int,
    actor: User | None = None,
) -> tuple[list[SchoolGroup], int]:
    school = await get_school_for_actor(actor, school_id) if actor else await get_school(school_id)
    return school.groups[offset : offset + limit], len(school.groups)


async def get_school_group(
    school_id: PydanticObjectId,
    group_id: PydanticObjectId,
    *,
    actor: User | None = None,
) -> SchoolGroup:
    school = await get_school_for_actor(actor, school_id) if actor else await get_school(school_id)
    group = _find_school_group(school, group_id)

    if group is None:
        raise SchoolGroupNotFoundError("School group not found")

    return group


async def update_school_group(
    school_id: PydanticObjectId,
    group_id: PydanticObjectId,
    data: UpdateSchoolGroupRequest,
    *,
    actor: User | None = None,
) -> SchoolGroup:
    school = await get_school_for_actor(actor, school_id) if actor else await get_school(school_id)
    group = _find_school_group(school, group_id)

    if group is None:
        raise SchoolGroupNotFoundError("School group not found")

    if "name" in data.model_fields_set:
        group.name = data.name
    if "is_active" in data.model_fields_set:
        group.is_active = bool(data.is_active)

    group.updated_at = datetime.now(UTC)
    school.updated_at = group.updated_at
    await school.save()
    return group


def _find_school_group(
    school: School,
    group_id: PydanticObjectId,
) -> SchoolGroup | None:
    return next((group for group in school.groups if group.id == group_id), None)


async def list_school_users(
    actor: User,
    school_id: PydanticObjectId,
    *,
    offset: int,
    limit: int,
) -> tuple[list[User], int]:
    await get_school_for_actor(actor, school_id)
    filters = {
        "school_id": school_id,
        "role": UserRole.SCHOOL_USER.value,
    }
    query = User.find(filters)
    total = await query.count()
    users = await query.sort("username").skip(offset).limit(limit).to_list()
    return users, total


async def get_school_user(
    actor: User,
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
) -> User:
    await get_school_for_actor(actor, school_id)
    user = await User.get(user_id)

    if user is None or user.role != UserRole.SCHOOL_USER or user.school_id != school_id:
        raise SchoolUserNotFoundError("School user not found")

    return user


async def create_school_user(
    actor: User,
    school_id: PydanticObjectId,
    data: CreateSchoolUserRequest,
) -> User:
    school = await get_school_for_actor(actor, school_id)

    if not school.is_active:
        raise SchoolInactiveError("Cannot create users for an inactive school")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole.SCHOOL_USER,
        school_id=school.id,
        created_by_admin_id=actor.id,
    )

    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise SchoolUserAlreadyExistsError(
            "A user with this username or email already exists"
        ) from exc

    return user


async def update_school_user(
    actor: User,
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    data: UpdateSchoolUserRequest,
) -> User:
    user = await get_school_user(actor, school_id, user_id)
    was_active = user.is_active

    if "username" in data.model_fields_set:
        user.username = data.username
    if "email" in data.model_fields_set:
        user.email = data.email
    if "is_active" in data.model_fields_set:
        user.is_active = bool(data.is_active)

    if was_active and not user.is_active:
        user.auth_version += 1

    user.updated_at = datetime.now(UTC)

    try:
        await user.save()
    except DuplicateKeyError as exc:
        raise SchoolUserAlreadyExistsError(
            "A user with this username or email already exists"
        ) from exc

    if was_active and not user.is_active:
        await _revoke_user_sessions(
            user.id,
            reason=RefreshRevokeReason.ACCOUNT_DISABLED,
        )

    return user


async def reset_school_user_password(
    actor: User,
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    data: ResetSchoolUserPasswordRequest,
) -> None:
    user = await get_school_user(actor, school_id, user_id)
    now = datetime.now(UTC)
    user.password_hash = hash_password(data.password)
    user.auth_version += 1
    user.updated_at = now
    await user.save()
    await _revoke_user_sessions(
        user.id,
        reason=RefreshRevokeReason.PASSWORD_RESET,
        now=now,
    )


async def delete_school_user(
    actor: User,
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
) -> None:
    await get_school_for_actor(actor, school_id)

    async def purge_user(session: AsyncClientSession) -> None:
        school = await School.get_pymongo_collection().find_one(
            {"_id": school_id},
            {"_id": 1},
            session=session,
        )
        if school is None:
            raise SchoolNotFoundError("School not found")

        user = await User.get_pymongo_collection().find_one(
            {
                "_id": user_id,
                "school_id": school_id,
                "role": UserRole.SCHOOL_USER.value,
            },
            {"_id": 1},
            session=session,
        )
        if user is None:
            raise SchoolUserNotFoundError("School user not found")

        await RefreshSession.get_pymongo_collection().delete_many(
            {"user_id": user_id},
            session=session,
        )
        await User.get_pymongo_collection().delete_one(
            {"_id": user_id},
            session=session,
        )

    async with get_mongo_client().start_session() as session:
        await session.with_transaction(purge_user)


async def list_admin_users(
    *,
    offset: int,
    limit: int,
) -> tuple[list[User], int]:
    query = User.find(
        {
            "role": {
                "$in": [
                    UserRole.ADMIN.value,
                    UserRole.TECHNOLOGIST.value,
                ]
            }
        }
    )
    total = await query.count()
    users = await query.sort("username").skip(offset).limit(limit).to_list()
    return users, total


async def get_admin_user(user_id: PydanticObjectId) -> User:
    user = await User.get(user_id)

    if user is None or user.role not in {UserRole.ADMIN, UserRole.TECHNOLOGIST}:
        raise AdminUserNotFoundError("Administrator not found")

    return user


async def create_admin_user(
    actor: User,
    data: CreateAdminUserRequest,
) -> User:
    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        permissions=(_dedupe_permissions(data.permissions) if data.role == UserRole.ADMIN else []),
        created_by_admin_id=actor.id,
    )

    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise AdminUserAlreadyExistsError(
            "A user with this username or email already exists"
        ) from exc

    return user


async def update_admin_user(
    user_id: PydanticObjectId,
    data: UpdateAdminUserRequest,
) -> User:
    user = await get_admin_user(user_id)
    was_active = user.is_active
    next_role = data.role if "role" in data.model_fields_set else user.role

    if user.role == UserRole.ADMIN and next_role == UserRole.TECHNOLOGIST:
        owned_school = await School.find_one(School.admin_owner_id == user.id)
        if owned_school is not None:
            raise AdminUserOwnsSchoolsError("Administrator owns schools")

    if "username" in data.model_fields_set:
        user.username = data.username
    if "email" in data.model_fields_set:
        user.email = data.email
    if "role" in data.model_fields_set:
        user.role = data.role
    if user.role == UserRole.TECHNOLOGIST:
        user.permissions = []
    elif "permissions" in data.model_fields_set:
        user.permissions = _dedupe_permissions(data.permissions or [])
    if "is_active" in data.model_fields_set:
        user.is_active = bool(data.is_active)

    if was_active and not user.is_active:
        user.auth_version += 1

    user.updated_at = datetime.now(UTC)

    try:
        await user.save()
    except DuplicateKeyError as exc:
        raise AdminUserAlreadyExistsError(
            "A user with this username or email already exists"
        ) from exc

    if was_active and not user.is_active:
        await _revoke_user_sessions(
            user.id,
            reason=RefreshRevokeReason.ACCOUNT_DISABLED,
        )

    return user


async def reset_admin_user_password(
    user_id: PydanticObjectId,
    data: ResetAdminUserPasswordRequest,
) -> None:
    user = await get_admin_user(user_id)
    now = datetime.now(UTC)
    user.password_hash = hash_password(data.password)
    user.auth_version += 1
    user.updated_at = now
    await user.save()
    await _revoke_user_sessions(
        user.id,
        reason=RefreshRevokeReason.PASSWORD_RESET,
        now=now,
    )


async def delete_admin_user(user_id: PydanticObjectId) -> None:
    await get_admin_user(user_id)
    owned_school = await School.find_one(School.admin_owner_id == user_id)

    if owned_school is not None:
        raise AdminUserOwnsSchoolsError("Administrator owns schools")

    async def purge_admin(session: AsyncClientSession) -> None:
        user = await User.get_pymongo_collection().find_one(
            {
                "_id": user_id,
                "role": {
                    "$in": [
                        UserRole.ADMIN.value,
                        UserRole.TECHNOLOGIST.value,
                    ]
                },
            },
            {"_id": 1},
            session=session,
        )
        if user is None:
            raise AdminUserNotFoundError("Administrator not found")

        await RefreshSession.get_pymongo_collection().delete_many(
            {"user_id": user_id},
            session=session,
        )
        await User.get_pymongo_collection().delete_one(
            {"_id": user_id},
            session=session,
        )

    async with get_mongo_client().start_session() as session:
        await session.with_transaction(purge_admin)


def _dedupe_permissions(
    permissions: list[AdminPermission],
) -> list[AdminPermission]:
    return list(dict.fromkeys(permissions))


def _ensure_school_access(actor: User, school: School) -> None:
    if actor.role == UserRole.OWNER:
        return

    if actor.role == UserRole.ADMIN and school.admin_owner_id == actor.id:
        return

    raise AdminAccessDeniedError("School access denied")


async def _resolve_school_owner(
    actor: User,
    requested_owner_id: PydanticObjectId | None,
) -> PydanticObjectId | None:
    if actor.role == UserRole.ADMIN:
        if requested_owner_id is not None and requested_owner_id != actor.id:
            raise AdminAccessDeniedError("Only owner can assign schools to other admins")
        return actor.id

    if requested_owner_id is None:
        return None

    owner = await User.get(requested_owner_id)
    if owner is None or owner.role != UserRole.ADMIN or not owner.is_active:
        raise AdminUserNotFoundError("Administrator not found")

    return owner.id


async def _revoke_user_sessions(
    user_id: PydanticObjectId,
    *,
    reason: RefreshRevokeReason,
    now: datetime | None = None,
) -> None:
    revoked_at = now or datetime.now(UTC)
    await RefreshSession.get_pymongo_collection().update_many(
        {
            "user_id": user_id,
            "revoked_at": None,
        },
        {
            "$set": {
                "revoked_at": revoked_at,
                "revoke_reason": reason.value,
            }
        },
    )


async def _revoke_school_sessions(
    school_id: PydanticObjectId,
    *,
    reason: RefreshRevokeReason,
    now: datetime | None = None,
) -> None:
    users = await User.find(User.school_id == school_id).to_list()
    user_ids = [user.id for user in users if user.id is not None]

    if not user_ids:
        return

    revoked_at = now or datetime.now(UTC)
    await User.get_pymongo_collection().update_many(
        {"_id": {"$in": user_ids}},
        {
            "$inc": {"auth_version": 1},
            "$set": {"updated_at": revoked_at},
        },
    )
    await RefreshSession.get_pymongo_collection().update_many(
        {
            "user_id": {"$in": user_ids},
            "revoked_at": None,
        },
        {
            "$set": {
                "revoked_at": revoked_at,
                "revoke_reason": reason.value,
            }
        },
    )
