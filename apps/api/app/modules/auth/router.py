from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.core.config import Settings, get_settings
from app.modules.auth.dependencies import (
    CsrfProtection,
    CurrentUser,
)
from app.modules.auth.schemas import (
    LoginRequest,
    UserResponse,
)
from app.modules.auth.security import generate_csrf_token
from app.modules.auth.service import (
    AuthenticationError,
    TokenPair,
    rotate_refresh_token,
)
from app.modules.auth.service import (
    login as login_user,
)
from app.modules.auth.service import (
    logout as logout_session,
)

router = APIRouter()

AppSettings = Annotated[Settings, Depends(get_settings)]


def authentication_error(exc: AuthenticationError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=str(exc),
    )


def set_auth_cookies(
    response: Response,
    token_pair: TokenPair,
    settings: Settings,
) -> None:
    api_path = settings.api_v1_prefix.rstrip("/") or "/"
    auth_path = f"{api_path}/auth"

    response.set_cookie(
        key=settings.access_cookie_name,
        value=token_pair.access_token,
        max_age=token_pair.expires_in,
        path=api_path,
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token_pair.refresh_token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        path=auth_path,
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=generate_csrf_token(),
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=False,
        samesite=settings.auth_cookie_samesite,
    )


def delete_auth_cookies(response: Response, settings: Settings) -> None:
    api_path = settings.api_v1_prefix.rstrip("/") or "/"
    auth_path = f"{api_path}/auth"

    response.delete_cookie(
        key=settings.access_cookie_name,
        path=api_path,
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=auth_path,
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )
    response.delete_cookie(
        key=settings.csrf_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=False,
        samesite=settings.auth_cookie_samesite,
    )


@router.post(
    "/login",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def login(
    payload: LoginRequest,
    settings: AppSettings,
) -> Response:
    try:
        token_pair = await login_user(
            payload.identifier,
            payload.password,
            settings=settings,
        )
    except AuthenticationError as exc:
        raise authentication_error(exc) from exc

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    set_auth_cookies(response, token_pair, settings)
    return response


@router.post(
    "/refresh",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def refresh(
    request: Request,
    settings: AppSettings,
    _csrf: CsrfProtection,
) -> Response:
    raw_refresh_token = request.cookies.get(settings.refresh_cookie_name)

    if raw_refresh_token is None:
        raise authentication_error(AuthenticationError("Invalid refresh token"))

    try:
        token_pair = await rotate_refresh_token(
            raw_refresh_token,
            settings=settings,
        )
    except AuthenticationError as exc:
        raise authentication_error(exc) from exc

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    set_auth_cookies(response, token_pair, settings)
    return response


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    request: Request,
    settings: AppSettings,
    _csrf: CsrfProtection,
) -> Response:
    raw_refresh_token = request.cookies.get(settings.refresh_cookie_name)

    if raw_refresh_token is not None:
        await logout_session(
            raw_refresh_token,
            settings=settings,
        )

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    delete_auth_cookies(response, settings)
    return response


@router.get(
    "/me",
    response_model=UserResponse,
)
async def me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.from_user(current_user)
