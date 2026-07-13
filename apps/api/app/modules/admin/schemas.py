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

from app.api.responses import PaginatedResponse
from app.modules.identity.models import (
    AdminPermission,
    AgeGroup,
    School,
    SchoolCode,
    SchoolGroup,
    TrimmedName,
    User,
    UserRole,
)


class CreateSchoolRequest(BaseModel):
    name: TrimmedName
    code: SchoolCode
    admin_owner_id: PydanticObjectId | None = None


class UpdateSchoolRequest(BaseModel):
    name: TrimmedName | None = None
    code: SchoolCode | None = None
    admin_owner_id: PydanticObjectId | None = None
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
    admin_owner_id: PydanticObjectId | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_school(cls, school: School) -> "SchoolResponse":
        return cls.model_validate(school)


class SchoolListResponse(PaginatedResponse[SchoolResponse]):
    pass


class UpdateSchoolGroupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: TrimmedName | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Group name cannot be null")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        return self


class SchoolGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    school_id: PydanticObjectId
    name: str
    age_group: AgeGroup
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_group(
        cls,
        group: SchoolGroup,
        *,
        school_id: PydanticObjectId,
    ) -> "SchoolGroupResponse":
        return cls(
            id=group.id,
            school_id=school_id,
            name=group.name,
            age_group=group.age_group,
            is_active=group.is_active,
            created_at=group.created_at,
            updated_at=group.updated_at,
        )


class SchoolGroupListResponse(PaginatedResponse[SchoolGroupResponse]):
    pass


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


class CreateAdminUserRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
    )
    email: EmailStr
    password: str = Field(
        min_length=12,
        max_length=128,
        repr=False,
    )
    role: UserRole = UserRole.ADMIN
    permissions: list[AdminPermission] = Field(default_factory=list)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def reject_blank_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be blank")
        return value

    @model_validator(mode="after")
    def validate_role(self) -> Self:
        if self.role not in {UserRole.ADMIN, UserRole.TECHNOLOGIST}:
            raise ValueError("Only administrator or technologist can be created here")
        if self.role == UserRole.TECHNOLOGIST and self.permissions:
            raise ValueError("Technologist permissions are fixed by role")
        return self


class UpdateAdminUserRequest(BaseModel):
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
    )
    email: EmailStr | None = None
    role: UserRole | None = None
    permissions: list[AdminPermission] | None = None
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
        if "email" in self.model_fields_set and self.email is None:
            raise ValueError("Email cannot be null")
        if "role" in self.model_fields_set:
            if self.role is None:
                raise ValueError("Role cannot be null")
            if self.role not in {UserRole.ADMIN, UserRole.TECHNOLOGIST}:
                raise ValueError("Only administrator or technologist is supported")
        if "permissions" in self.model_fields_set and self.permissions is None:
            raise ValueError("Permissions cannot be null")
        if self.role == UserRole.TECHNOLOGIST and self.permissions:
            raise ValueError("Technologist permissions are fixed by role")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        return self


class ResetAdminUserPasswordRequest(BaseModel):
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


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    username: str
    email: EmailStr
    role: UserRole
    permissions: list[AdminPermission]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_user(cls, user: User) -> "AdminUserResponse":
        return cls.model_validate(user)


class AdminUserListResponse(PaginatedResponse[AdminUserResponse]):
    pass


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


class SchoolUserListResponse(PaginatedResponse[SchoolUserResponse]):
    pass
