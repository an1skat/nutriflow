from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.modules.admin.schemas import (
    CreateSchoolRequest,
    CreateSchoolUserRequest,
)
from app.modules.auth.security import hash_password
from app.modules.identity.models import School, User, UserRole


class SchoolAlreadyExistsError(ValueError):
    """A school with the same unique data already exists."""


class SchoolNotFoundError(ValueError):
    """The requested school does not exist."""


class SchoolInactiveError(ValueError):
    """The requested school is inactive."""


class SchoolUserAlreadyExistsError(ValueError):
    """A user with the same username or email already exists."""


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


async def create_school_user(
    school_id: PydanticObjectId,
    data: CreateSchoolUserRequest,
) -> User:
    school = await School.get(school_id)

    if school is None:
        raise SchoolNotFoundError("School not found")

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
