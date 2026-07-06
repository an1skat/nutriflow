from collections.abc import Awaitable, Callable
from typing import Annotated

from beanie import PydanticObjectId
from fastapi import Depends, Header, HTTPException, Request, status

from app.core.config import Settings, get_settings
from app.modules.auth.security import (
    AccessTokenError,
    csrf_tokens_match,
    decode_access_token,
)
from app.modules.auth.service import user_has_permissions
from app.modules.identity.models import AdminPermission, School, User, UserRole


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token",
    )


async def get_current_user(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    access_token = request.cookies.get(settings.access_cookie_name)

    if access_token is None:
        raise unauthorized()

    try:
        identity = decode_access_token(access_token, settings=settings)
    except AccessTokenError as exc:
        raise unauthorized() from exc

    user = await User.get(identity.user_id)

    if user is None or not user.is_active or user.auth_version != identity.auth_version:
        raise unauthorized()

    if user.role in {UserRole.OWNER, UserRole.ADMIN}:
        if user.school_id is not None:
            raise unauthorized()
        return user

    if user.school_id is None:
        raise unauthorized()

    school = await School.get(user.school_id)

    if school is None or not school.is_active:
        raise unauthorized()

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_csrf(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    csrf_header: Annotated[
        str | None,
        Header(alias="X-CSRF-Token"),
    ] = None,
) -> None:
    csrf_cookie = request.cookies.get(settings.csrf_cookie_name)

    if not csrf_tokens_match(csrf_cookie, csrf_header):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed",
        )


CsrfProtection = Annotated[None, Depends(require_csrf)]


def require_roles(
    *allowed_roles: UserRole,
) -> Callable[..., Awaitable[User]]:
    if not allowed_roles:
        raise ValueError("At least one role must be specified")

    allowed = frozenset(allowed_roles)

    async def dependency(current_user: CurrentUser) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return current_user

    return dependency


def require_owner() -> Callable[..., Awaitable[User]]:
    async def dependency(current_user: CurrentUser) -> User:
        if current_user.role != UserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return current_user

    return dependency


def require_permissions(
    *required_permissions: AdminPermission,
) -> Callable[..., Awaitable[User]]:
    if not required_permissions:
        raise ValueError("At least one permission must be specified")

    async def dependency(current_user: CurrentUser) -> User:
        if not await user_has_permissions(current_user, *required_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return current_user

    return dependency


async def authorize_school_access(
    current_user: User,
    school_id: PydanticObjectId,
) -> User:
    if current_user.role == UserRole.OWNER:
        return current_user

    if current_user.role == UserRole.ADMIN:
        school = await School.get(school_id)

        if school is not None and school.admin_owner_id == current_user.id:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School access denied",
        )

    if current_user.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School access denied",
        )

    return current_user


async def require_school_access(
    school_id: PydanticObjectId,
    current_user: CurrentUser,
) -> User:
    return await authorize_school_access(current_user, school_id)
