from datetime import datetime
from typing import Self

from beanie import PydanticObjectId
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
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


class UpdateSchoolRequest(BaseModel):
    name: TrimmedName | None = None
    code: SchoolCode | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("School name cannot be null")
        if "code" in self.model_fields_set and self.code is None:
            raise ValueError("School code cannot be null")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        return self


class DeleteSchoolRequest(BaseModel):
    password: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        repr=False,
    )

    @field_validator("password")
    @classmethod
    def reject_blank_password(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.strip():
            raise ValueError("Password cannot be blank")
        return value


class SchoolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    name: str
    code: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_school(cls, school: School) -> "SchoolResponse":
        return cls.model_validate(school)


class SchoolListResponse(BaseModel):
    items: list[SchoolResponse]
    total: int
    offset: int
    limit: int


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


class UpdateSchoolUserRequest(BaseModel):
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
    )
    email: EmailStr | None = None
    is_active: bool | None = None

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower()

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower()

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if "username" in self.model_fields_set and self.username is None:
            raise ValueError("Username cannot be null")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        return self


class ResetSchoolUserPasswordRequest(BaseModel):
    password: str = Field(
        min_length=12,
        max_length=128,
        repr=False,
    )

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
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_user(cls, user: User) -> "SchoolUserResponse":
        return cls.model_validate(user)


class SchoolUserListResponse(BaseModel):
    items: list[SchoolUserResponse]
    total: int
    offset: int
    limit: int
