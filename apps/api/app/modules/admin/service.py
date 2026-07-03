from datetime import UTC, datetime

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.modules.admin.schemas import (
    CreateSchoolRequest,
    CreateSchoolUserRequest,
    ResetSchoolUserPasswordRequest,
    UpdateSchoolRequest,
    UpdateSchoolUserRequest,
)
from app.modules.auth.security import hash_password
from app.modules.identity.models import (
    RefreshRevokeReason,
    RefreshSession,
    School,
    User,
    UserRole,
)


class SchoolAlreadyExistsError(ValueError):
    """A school with the same unique data already exists."""


class SchoolNotFoundError(ValueError):
    """The requested school does not exist."""


class SchoolInactiveError(ValueError):
    """The requested school is inactive."""


class SchoolUserAlreadyExistsError(ValueError):
    """A user with the same username or email already exists."""


class SchoolUserNotFoundError(ValueError):
    """The requested school user does not exist in the school."""


async def list_schools(
    *,
    offset: int,
    limit: int,
    include_deleted: bool,
) -> tuple[list[School], int]:
    filters = {} if include_deleted else {"deleted_at": None}
    query = School.find(filters)
    total = await query.count()
    schools = await query.sort("name").skip(offset).limit(limit).to_list()
    return schools, total


async def get_school(
    school_id: PydanticObjectId,
    *,
    include_deleted: bool = False,
) -> School:
    school = await School.get(school_id)

    if school is None or (school.deleted_at is not None and not include_deleted):
        raise SchoolNotFoundError("School not found")

    return school


async def create_school(data: CreateSchoolRequest) -> School:
    school = School(
        name=data.name,
        code=data.code,
    )

    try:
        await school.insert()
    except DuplicateKeyError as exc:
        raise SchoolAlreadyExistsError("A school with this code already exists") from exc

    return school


async def update_school(
    school_id: PydanticObjectId,
    data: UpdateSchoolRequest,
) -> School:
    school = await get_school(school_id)
    was_active = school.is_active

    if "name" in data.model_fields_set:
        school.name = data.name
    if "code" in data.model_fields_set and data.code is not None:
        school.code = data.code.upper()
    if "is_active" in data.model_fields_set:
        school.is_active = bool(data.is_active)

    school.updated_at = datetime.now(UTC)

    try:
        await school.save()
    except DuplicateKeyError as exc:
        raise SchoolAlreadyExistsError("A school with this code already exists") from exc

    if was_active and not school.is_active:
        await _revoke_school_sessions(
            school.id,
            reason=RefreshRevokeReason.SCHOOL_DISABLED,
        )

    return school


async def delete_school(school_id: PydanticObjectId) -> None:
    school = await get_school(school_id, include_deleted=True)

    if school.deleted_at is not None:
        return

    now = datetime.now(UTC)
    school.is_active = False
    school.deleted_at = now
    school.updated_at = now
    await school.save()
    await _revoke_school_sessions(
        school.id,
        reason=RefreshRevokeReason.SCHOOL_DISABLED,
        now=now,
    )


async def list_school_users(
    school_id: PydanticObjectId,
    *,
    offset: int,
    limit: int,
    include_deleted: bool,
) -> tuple[list[User], int]:
    await get_school(school_id)
    filters: dict = {
        "school_id": school_id,
        "role": UserRole.SCHOOL_USER.value,
    }
    if not include_deleted:
        filters["deleted_at"] = None

    query = User.find(filters)
    total = await query.count()
    users = await query.sort("username").skip(offset).limit(limit).to_list()
    return users, total


async def get_school_user(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    *,
    include_deleted: bool = False,
) -> User:
    await get_school(school_id)
    user = await User.get(user_id)

    if (
        user is None
        or user.role != UserRole.SCHOOL_USER
        or user.school_id != school_id
        or (user.deleted_at is not None and not include_deleted)
    ):
        raise SchoolUserNotFoundError("School user not found")

    return user


async def create_school_user(
    school_id: PydanticObjectId,
    data: CreateSchoolUserRequest,
) -> User:
    school = await get_school(school_id)

    if not school.is_active:
        raise SchoolInactiveError("Cannot create users for an inactive school")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole.SCHOOL_USER,
        school_id=school.id,
    )

    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise SchoolUserAlreadyExistsError(
            "A user with this username or email already exists"
        ) from exc

    return user


async def update_school_user(
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    data: UpdateSchoolUserRequest,
) -> User:
    user = await get_school_user(school_id, user_id)
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
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
    data: ResetSchoolUserPasswordRequest,
) -> None:
    user = await get_school_user(school_id, user_id)
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
    school_id: PydanticObjectId,
    user_id: PydanticObjectId,
) -> None:
    user = await get_school_user(
        school_id,
        user_id,
        include_deleted=True,
    )

    if user.deleted_at is not None:
        return

    now = datetime.now(UTC)
    user.is_active = False
    user.auth_version += 1
    user.deleted_at = now
    user.updated_at = now
    await user.save()
    await _revoke_user_sessions(
        user.id,
        reason=RefreshRevokeReason.ACCOUNT_DISABLED,
        now=now,
    )


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
