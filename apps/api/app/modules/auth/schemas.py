from beanie import PydanticObjectId
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.modules.identity.models import AdminPermission, User, UserRole


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128, repr=False)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        return value.strip().lower()


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    username: str
    email: EmailStr | None
    role: UserRole
    school_id: PydanticObjectId | None
    permissions: list[AdminPermission]
    is_active: bool

    @classmethod
    def from_user(
        cls,
        user: User,
        *,
        permissions: list[AdminPermission],
    ) -> "UserResponse":
        return cls(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            school_id=user.school_id,
            permissions=permissions,
            is_active=user.is_active,
        )


class FirstAdminInput(BaseModel):
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

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def reject_blank_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be blank")
        return value
