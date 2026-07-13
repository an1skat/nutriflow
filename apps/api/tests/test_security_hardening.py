import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.middleware import RequestHardeningMiddleware
from app.core.rate_limit import FailureLockout, SlidingWindowRateLimiter

SECRET = "test-secret-value-with-at-least-32-chars"


@pytest.mark.no_clean_database
def test_security_sensitive_defaults_are_closed(monkeypatch: pytest.MonkeyPatch):
    for env_name in (
        "DEBUG",
        "DOCS_ENABLED",
        "REDOC_ENABLED",
        "OPENAPI_ENABLED",
        "DATABASE_HEALTH_ENABLED",
        "AUTH_COOKIE_SECURE",
    ):
        monkeypatch.delenv(env_name, raising=False)

    settings = Settings(
        jwt_secret_key=SECRET,
        refresh_token_pepper=SECRET,
        _env_file=None,
    )

    assert settings.debug is False
    assert settings.auth_cookie_secure is True
    assert settings.docs_enabled is False
    assert settings.redoc_enabled is False
    assert settings.openapi_enabled is False
    assert settings.database_health_enabled is False


@pytest.mark.no_clean_database
def test_production_rejects_insecure_settings():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            jwt_secret_key=SECRET,
            refresh_token_pepper=SECRET,
            auth_cookie_secure=False,
        )


@pytest.mark.no_clean_database
@pytest.mark.asyncio
async def test_sliding_window_limiter_blocks_after_limit():
    limiter = SlidingWindowRateLimiter()

    first = await limiter.allow("client", limit=1, window_seconds=60)
    second = await limiter.allow("client", limit=1, window_seconds=60)

    assert first.allowed is True
    assert second.allowed is False
    assert second.retry_after_seconds > 0


@pytest.mark.no_clean_database
@pytest.mark.asyncio
async def test_failure_lockout_blocks_after_threshold():
    lockout = FailureLockout()

    first = await lockout.record_failure("client", failure_limit=2, lock_seconds=60)
    second = await lockout.record_failure("client", failure_limit=2, lock_seconds=60)
    blocked = await lockout.check("client")

    assert first.allowed is True
    assert second.allowed is False
    assert blocked.allowed is False
    assert blocked.retry_after_seconds > 0


@pytest.mark.no_clean_database
@pytest.mark.asyncio
async def test_hardening_middleware_sets_security_headers():
    settings = Settings(
        jwt_secret_key=SECRET,
        refresh_token_pepper=SECRET,
        auth_cookie_secure=True,
        rate_limit_enabled=False,
        _env_file=None,
    )
    app = RequestHardeningMiddleware(_ok_asgi_app, settings=settings)

    messages = await _call_asgi(app)
    response_start = _response_start(messages)
    headers = _headers_dict(response_start)

    assert response_start["status"] == 200
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["strict-transport-security"].startswith("max-age=")
    assert "x-request-id" in headers


@pytest.mark.no_clean_database
@pytest.mark.asyncio
async def test_hardening_middleware_allows_swagger_assets_on_docs_route():
    settings = Settings(
        jwt_secret_key=SECRET,
        refresh_token_pepper=SECRET,
        auth_cookie_secure=True,
        rate_limit_enabled=False,
        docs_enabled=True,
        openapi_enabled=True,
        _env_file=None,
    )
    app = RequestHardeningMiddleware(_ok_asgi_app, settings=settings)

    messages = await _call_asgi(app, path="/docs")
    headers = _headers_dict(_response_start(messages))

    assert "cdn.jsdelivr.net" in headers["content-security-policy"]
    assert "'unsafe-inline'" in headers["content-security-policy"]
    assert "default-src 'none'" not in headers["content-security-policy"]


@pytest.mark.no_clean_database
@pytest.mark.asyncio
async def test_hardening_middleware_rejects_large_content_length():
    settings = Settings(
        jwt_secret_key=SECRET,
        refresh_token_pepper=SECRET,
        max_request_body_bytes=1024,
        rate_limit_enabled=False,
        _env_file=None,
    )
    app = RequestHardeningMiddleware(_ok_asgi_app, settings=settings)

    messages = await _call_asgi(
        app,
        headers=[(b"content-length", b"1025")],
    )
    response_start = _response_start(messages)

    assert response_start["status"] == 413


async def _ok_asgi_app(scope, receive, send):
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b"ok",
            "more_body": False,
        }
    )


async def _call_asgi(
    app,
    *,
    headers: list[tuple[bytes, bytes]] | None = None,
    path: str = "/",
):
    messages = [
        {
            "type": "http.request",
            "body": b"",
            "more_body": False,
        }
    ]
    sent = []

    async def receive():
        return messages.pop(0)

    async def send(message):
        sent.append(message)

    await app(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "headers": headers or [],
            "client": ("127.0.0.1", 12345),
        },
        receive,
        send,
    )
    return sent


def _headers_dict(message):
    return {
        key.decode("latin1").lower(): value.decode("latin1")
        for key, value in message["headers"]
    }


def _response_start(messages):
    return next(message for message in messages if message["type"] == "http.response.start")
