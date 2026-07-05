from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Self

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator, model_validator
from pymongo import ASCENDING, IndexModel

TrimmedName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

SchoolCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


def utc_now() -> datetime:
    return datetime.now(UTC)


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    SCHOOL_USER = "SCHOOL_USER"


class AgeGroup(StrEnum):
    SIX_TO_ELEVEN = "6-11"
    ELEVEN_TO_FOURTEEN = "11-14"
    FOURTEEN_TO_EIGHTEEN = "14-18"


class RefreshRevokeReason(StrEnum):
    ROTATED = "rotated"
    LOGOUT = "logout"
    REUSE_DETECTED = "reuse_detected"
    EXPIRED = "expired"
    USER_UNAVAILABLE = "user_unavailable"
    ACCOUNT_DISABLED = "account_disabled"
    SCHOOL_DISABLED = "school_disabled"
    PASSWORD_RESET = "password_reset"


class SchoolGroup(BaseModel):
    id: PydanticObjectId = Field(default_factory=PydanticObjectId)
    name: TrimmedName
    age_group: AgeGroup
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


def default_school_groups() -> list[SchoolGroup]:
    return [
        SchoolGroup(name=AgeGroup.SIX_TO_ELEVEN.value, age_group=AgeGroup.SIX_TO_ELEVEN),
        SchoolGroup(name=AgeGroup.ELEVEN_TO_FOURTEEN.value, age_group=AgeGroup.ELEVEN_TO_FOURTEEN),
        SchoolGroup(
            name=AgeGroup.FOURTEEN_TO_EIGHTEEN.value,
            age_group=AgeGroup.FOURTEEN_TO_EIGHTEEN,
        ),
    ]


class School(Document):
    name: TrimmedName
    code: SchoolCode
    groups: list[SchoolGroup] = Field(default_factory=default_school_groups, min_length=1)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.upper()

    class Settings:
        name = "schools"
        indexes = [
            IndexModel(
                [("code", ASCENDING)],
                unique=True,
                name="uq_school_code",
            )
        ]


class User(Document):
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
    )
    email: EmailStr | None = None
    password_hash: str = Field(min_length=20)
    role: UserRole
    school_id: PydanticObjectId | None = None
    is_active: bool = True
    auth_version: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

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

    @model_validator(mode="after")
    def validate_school_boundary(self) -> Self:
        if self.role == UserRole.ADMIN:
            if self.school_id is not None:
                raise ValueError("Administrator must not have school_id")
            if self.email is None:
                raise ValueError("Administrator must have email")

        if self.role == UserRole.SCHOOL_USER and self.school_id is None:
            raise ValueError("School user must have school_id")

        return self

    class Settings:
        name = "users"
        indexes = [
            IndexModel(
                [("username", ASCENDING)],
                unique=True,
                name="uq_user_username",
            ),
            IndexModel(
                [("email", ASCENDING)],
                unique=True,
                partialFilterExpression={"email": {"$type": "string"}},
                name="uq_user_email",
            ),
            IndexModel(
                [("school_id", ASCENDING), ("role", ASCENDING)],
                name="ix_user_school_role",
            ),
        ]


class RefreshSession(Document):
    user_id: PydanticObjectId
    family_id: str
    token_hash: str
    expires_at: datetime
    revoked_at: datetime | None = None
    revoke_reason: RefreshRevokeReason | None = None
    replaced_by_session_id: PydanticObjectId | None = None
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "refresh_sessions"
        indexes = [
            IndexModel(
                [("token_hash", ASCENDING)],
                unique=True,
                name="uq_refresh_token_hash",
            ),
            IndexModel(
                [("family_id", ASCENDING)],
                name="ix_refresh_family",
            ),
            IndexModel(
                [("user_id", ASCENDING)],
                name="ix_refresh_user",
            ),
            IndexModel(
                [("expires_at", ASCENDING)],
                expireAfterSeconds=0,
                name="ttl_refresh_expiry",
            ),
        ]
