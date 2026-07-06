import asyncio
from collections.abc import Awaitable, Callable
from uuid import uuid4

import anyio
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.client_ip import get_client_ip
from app.core.config import Settings
from app.core.rate_limit import SlidingWindowRateLimiter


class RequestHardeningMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        settings: Settings,
    ) -> None:
        self.app = app
        self.settings = settings
        self._rate_limiter = SlidingWindowRateLimiter()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = self._request_id(scope)

        if self.settings.rate_limit_enabled:
            decision = await self._rate_limiter.allow(
                ("global", get_client_ip(scope)),
                limit=self.settings.rate_limit_requests,
                window_seconds=self.settings.rate_limit_window_seconds,
            )

            if not decision.allowed:
                response = PlainTextResponse(
                    "Too many requests",
                    status_code=429,
                    headers={
                        "Retry-After": str(decision.retry_after_seconds),
                        "X-Request-ID": request_id,
                    },
                )
                await response(scope, receive, send)
                return

        if self._content_length_exceeds_limit(scope):
            response = PlainTextResponse(
                "Request body too large",
                status_code=413,
                headers={"X-Request-ID": request_id},
            )
            await response(scope, receive, send)
            return

        body_reader = _BoundedReceive(
            receive,
            max_body_bytes=self.settings.max_request_body_bytes,
        )
        response_started = False

        async def send_with_headers(message: Message) -> None:
            nonlocal response_started

            if message["type"] == "http.response.start":
                response_started = True
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id

                if self.settings.security_headers_enabled:
                    self._set_security_headers(headers)

            await send(message)

        try:
            with anyio.fail_after(self.settings.request_timeout_seconds):
                await self.app(scope, body_reader.receive, send_with_headers)
        except RequestBodyTooLargeError:
            if not response_started:
                response = PlainTextResponse(
                    "Request body too large",
                    status_code=413,
                    headers={"X-Request-ID": request_id},
                )
                await response(scope, receive, send)
        except TimeoutError:
            if not response_started:
                response = PlainTextResponse(
                    "Request timeout",
                    status_code=504,
                    headers={"X-Request-ID": request_id},
                )
                await response(scope, receive, send)
        except asyncio.CancelledError:
            raise

    def _content_length_exceeds_limit(self, scope: Scope) -> bool:
        headers = Headers(scope=scope)
        content_length = headers.get("content-length")

        if content_length is None:
            return False

        try:
            return int(content_length) > self.settings.max_request_body_bytes
        except ValueError:
            return True

    def _set_security_headers(self, headers: MutableHeaders) -> None:
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "no-referrer")
        headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        )

        if self.settings.auth_cookie_secure and self.settings.hsts_max_age_seconds > 0:
            headers.setdefault(
                "Strict-Transport-Security",
                f"max-age={self.settings.hsts_max_age_seconds}; includeSubDomains",
            )

    def _request_id(self, scope: Scope) -> str:
        headers = Headers(scope=scope)
        incoming = headers.get("x-request-id", "")

        if 8 <= len(incoming) <= 128 and all(char.isprintable() for char in incoming):
            return incoming

        return str(uuid4())


class _BoundedReceive:
    def __init__(
        self,
        receive: Callable[[], Awaitable[Message]],
        *,
        max_body_bytes: int,
    ) -> None:
        self._receive = receive
        self._max_body_bytes = max_body_bytes
        self._bytes_read = 0

    async def receive(self) -> Message:
        message = await self._receive()

        if message["type"] == "http.request":
            self._bytes_read += len(message.get("body", b""))

            if self._bytes_read > self._max_body_bytes:
                raise RequestBodyTooLargeError

        return message


class RequestBodyTooLargeError(ValueError):
    pass
