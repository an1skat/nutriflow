from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import Settings
from app.modules.identity.models import User, UserRole

DELETE_CONFIRMATION_COOKIE_NAME = "nutriflow_admin_delete_confirm"
DELETE_CONFIRMATION_TOKEN_TYPE = "admin_delete_confirmation"
DELETE_CONFIRMATION_TTL_SECONDS = 5 * 60


def create_delete_confirmation_token(
    admin: User,
    *,
    settings: Settings,
    now: datetime | None = None,
) -> str:
    if admin.id is None:
        raise ValueError("Delete confirmation token can only be created for a persisted user")

    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(seconds=DELETE_CONFIRMATION_TTL_SECONDS)

    payload = {
        "sub": str(admin.id),
        "role": admin.role.value,
        "ver": admin.auth_version,
        "typ": DELETE_CONFIRMATION_TOKEN_TYPE,
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


def delete_confirmation_token_is_valid(
    token: str | None,
    admin: User,
    *,
    settings: Settings,
) -> bool:
    if token is None or admin.id is None:
        return False

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
                    "role",
                    "ver",
                    "typ",
                    "iat",
                    "exp",
                    "iss",
                    "aud",
                ]
            },
        )

        return (
            payload["typ"] == DELETE_CONFIRMATION_TOKEN_TYPE
            and payload["sub"] == str(admin.id)
            and payload["role"] == admin.role.value
            and admin.role in {UserRole.OWNER, UserRole.ADMIN}
            and int(payload["ver"]) == admin.auth_version
        )
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        return False
