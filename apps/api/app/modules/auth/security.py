import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from beanie import PydanticObjectId

from app.core.config import Settings, get_settings
from app.modules.identity.models import User

_password_hasher = PasswordHasher(
    time_cost=2, memory_cost=19_456, parallelism=1, hash_len=32, salt_len=16, type=Type.ID
)

_dummy_password_hash = _password_hasher.hash("this-password-is-only-used-for-timing-protection")


class AccessTokenError(ValueError):
    pass


@dataclass(frozen=True)
class AccessTokenIdentity:
    user_id: PydanticObjectId


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


def verify_password_for_missing_user(password: str) -> None:
    verify_password(password, _dummy_password_hash)


def create_access_token(
    user: User, *, settings: Settings | None = None, now: datetime | None = None
) -> str:
    if user.id is None:
        raise ValueError("Access token can only be created for a persisted user")

    settings = settings or get_settings()
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=settings.access_token_ttl_minutes)

    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "school_id": str(user.school_id) if user.school_id else None,
        "typ": "access",
        "jti": str(uuid4()),
        "iat": issued_at,
        "exp": expires_at,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }

    return jwt.encode(
        payload,
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str, *, settings: Settings | None = None) -> AccessTokenIdentity:
    settings = settings or get_settings()

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={
                "require": [
                    "sub",
                    "typ",
                    "jti",
                    "iat",
                    "exp",
                    "iss",
                    "aud",
                ]
            },
        )

        if payload["typ"] != "access":
            raise AccessTokenError("Unexpected token type")

        user_id = PydanticObjectId(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise AccessTokenError("Invalid or expired access token") from exc

    return AccessTokenIdentity(user_id=user_id)


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(
    token: str,
    *,
    settings: Settings | None = None,
) -> str:
    if not token:
        raise ValueError("Refresh token cannot be empty")

    settings = settings or get_settings()
    pepper = settings.refresh_token_pepper.get_secret_value().encode()

    return hmac.new(
        pepper,
        token.encode(),
        hashlib.sha256,
    ).hexdigest()


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_tokens_match(
    cookie_token: str | None,
    header_token: str | None,
) -> bool:
    if cookie_token is None or header_token is None:
        return False

    return hmac.compare_digest(cookie_token, header_token)
