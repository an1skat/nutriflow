from beanie import PydanticObjectId
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)

from app.modules.identity.models import (
    School,
    SchoolCode,
    TrimmedName,
    User,
    UserRole,
)


class CreateSchoolRequest(BaseModel):
    name: TrimmedName
    code: SchoolCode


class SchoolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    name: str
    code: str
    is_active: bool

    @classmethod
    def from_school(cls, school: School) -> "SchoolResponse":
        return cls.model_validate(school)


class CreateSchoolUserRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
    )
    email: EmailStr | None = None
    password: str = Field(
        min_length=12,
        max_length=128,
        repr=False,
    )

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def reject_blank_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be blank")
        return value


class SchoolUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    username: str
    email: EmailStr | None
    role: UserRole
    school_id: PydanticObjectId
    is_active: bool

    @classmethod
    def from_user(cls, user: User) -> "SchoolUserResponse":
        return cls.model_validate(user)
