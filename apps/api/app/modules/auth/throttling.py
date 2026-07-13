import hashlib

from fastapi import HTTPException, Request, status

from app.core.client_ip import get_client_ip, get_client_subnet
from app.core.config import Settings
from app.core.rate_limit import FailureLockout, SlidingWindowRateLimiter

_attempt_limiter = SlidingWindowRateLimiter()
_failure_lockout = FailureLockout()


def _too_many_requests(retry_after_seconds: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many authentication attempts",
        headers={"Retry-After": str(retry_after_seconds)},
    )


def _normalized_identifier(identifier: str) -> str:
    return identifier.strip().lower()


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def check_login_throttle(
    request: Request,
    identifier: str,
    *,
    settings: Settings,
) -> None:
    if not settings.auth_rate_limit_enabled:
        return

    client_ip = get_client_ip(request.scope)
    subnet = get_client_subnet(client_ip)
    normalized_identifier = _normalized_identifier(identifier)

    checks = (
        (
            ("login-window-ip", client_ip),
            settings.auth_login_ip_requests,
            settings.auth_login_window_seconds,
        ),
        (
            ("login-window-subnet", subnet),
            settings.auth_login_subnet_requests,
            settings.auth_login_window_seconds,
        ),
    )

    for key, limit, window_seconds in checks:
        decision = await _attempt_limiter.allow(
            key,
            limit=limit,
            window_seconds=window_seconds,
        )

        if not decision.allowed:
            raise _too_many_requests(decision.retry_after_seconds)

    for key in (
        ("login-fail-ip", client_ip),
        ("login-fail-subnet", subnet),
        ("login-fail-identifier", normalized_identifier),
    ):
        decision = await _failure_lockout.check(key)

        if not decision.allowed:
            raise _too_many_requests(decision.retry_after_seconds)


async def record_login_success(
    request: Request,
    identifier: str,
) -> None:
    client_ip = get_client_ip(request.scope)
    subnet = get_client_subnet(client_ip)
    normalized_identifier = _normalized_identifier(identifier)

    for key in (
        ("login-fail-ip", client_ip),
        ("login-fail-subnet", subnet),
        ("login-fail-identifier", normalized_identifier),
    ):
        await _failure_lockout.clear(key)


async def record_login_failure(
    request: Request,
    identifier: str,
    *,
    settings: Settings,
) -> None:
    if not settings.auth_rate_limit_enabled:
        return

    client_ip = get_client_ip(request.scope)
    subnet = get_client_subnet(client_ip)
    normalized_identifier = _normalized_identifier(identifier)

    retry_after_seconds = 0
    for key in (
        ("login-fail-ip", client_ip),
        ("login-fail-subnet", subnet),
        ("login-fail-identifier", normalized_identifier),
    ):
        decision = await _failure_lockout.record_failure(
            key,
            failure_limit=settings.auth_login_failure_limit,
            lock_seconds=settings.auth_login_failure_lock_seconds,
        )

        if not decision.allowed:
            retry_after_seconds = max(retry_after_seconds, decision.retry_after_seconds)

    if retry_after_seconds:
        raise _too_many_requests(retry_after_seconds)


async def check_refresh_throttle(
    request: Request,
    raw_refresh_token: str | None,
    *,
    settings: Settings,
) -> None:
    if not settings.auth_rate_limit_enabled:
        return

    client_ip = get_client_ip(request.scope)
    subnet = get_client_subnet(client_ip)

    checks = (
        (
            ("refresh-window-ip", client_ip),
            settings.auth_refresh_ip_requests,
            settings.auth_refresh_window_seconds,
        ),
        (
            ("refresh-window-subnet", subnet),
            settings.auth_refresh_subnet_requests,
            settings.auth_refresh_window_seconds,
        ),
    )

    for key, limit, window_seconds in checks:
        decision = await _attempt_limiter.allow(
            key,
            limit=limit,
            window_seconds=window_seconds,
        )

        if not decision.allowed:
            raise _too_many_requests(decision.retry_after_seconds)

    keys: list[tuple[str, str]] = [
        ("refresh-fail-ip", client_ip),
        ("refresh-fail-subnet", subnet),
    ]

    if raw_refresh_token:
        keys.append(("refresh-fail-token", _fingerprint(raw_refresh_token)))

    for key in keys:
        decision = await _failure_lockout.check(key)

        if not decision.allowed:
            raise _too_many_requests(decision.retry_after_seconds)


async def record_refresh_success(
    request: Request,
    raw_refresh_token: str | None,
) -> None:
    client_ip = get_client_ip(request.scope)
    subnet = get_client_subnet(client_ip)

    keys: list[tuple[str, str]] = [
        ("refresh-fail-ip", client_ip),
        ("refresh-fail-subnet", subnet),
    ]

    if raw_refresh_token:
        keys.append(("refresh-fail-token", _fingerprint(raw_refresh_token)))

    for key in keys:
        await _failure_lockout.clear(key)


async def record_refresh_failure(
    request: Request,
    raw_refresh_token: str | None,
    *,
    settings: Settings,
) -> None:
    if not settings.auth_rate_limit_enabled:
        return

    client_ip = get_client_ip(request.scope)
    subnet = get_client_subnet(client_ip)

    keys: list[tuple[str, str]] = [
        ("refresh-fail-ip", client_ip),
        ("refresh-fail-subnet", subnet),
    ]

    if raw_refresh_token:
        keys.append(("refresh-fail-token", _fingerprint(raw_refresh_token)))

    retry_after_seconds = 0
    for key in keys:
        decision = await _failure_lockout.record_failure(
            key,
            failure_limit=settings.auth_refresh_failure_limit,
            lock_seconds=settings.auth_refresh_failure_lock_seconds,
        )

        if not decision.allowed:
            retry_after_seconds = max(retry_after_seconds, decision.retry_after_seconds)

    if retry_after_seconds:
        raise _too_many_requests(retry_after_seconds)
