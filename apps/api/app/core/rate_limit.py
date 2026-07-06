import asyncio
import time
from collections import defaultdict, deque
from collections.abc import Hashable
from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int


class SlidingWindowRateLimiter:
    def __init__(
        self,
        *,
        max_buckets: int = 10000,
    ) -> None:
        self._attempts: dict[Hashable, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()
        self._max_buckets = max_buckets

    async def allow(
        self,
        key: Hashable,
        *,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        now = time.monotonic()
        cutoff = now - window_seconds

        async with self._lock:
            bucket = self._attempts[key]

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(bucket[0] + window_seconds - now) + 1)
                return RateLimitDecision(allowed=False, retry_after_seconds=retry_after)

            bucket.append(now)
            self._evict_empty_buckets()
            return RateLimitDecision(allowed=True, retry_after_seconds=0)

    async def clear(self, key: Hashable) -> None:
        async with self._lock:
            self._attempts.pop(key, None)

    def _evict_empty_buckets(self) -> None:
        if len(self._attempts) <= self._max_buckets:
            return

        empty_keys = [key for key, bucket in self._attempts.items() if not bucket]

        for key in empty_keys:
            self._attempts.pop(key, None)


class FailureLockout:
    def __init__(
        self,
        *,
        max_buckets: int = 10000,
    ) -> None:
        self._failures: dict[Hashable, tuple[int, float | None]] = {}
        self._lock = asyncio.Lock()
        self._max_buckets = max_buckets

    async def check(self, key: Hashable) -> RateLimitDecision:
        now = time.monotonic()

        async with self._lock:
            record = self._failures.get(key)

            if record is None:
                return RateLimitDecision(allowed=True, retry_after_seconds=0)

            _, locked_until = record

            if locked_until is None:
                return RateLimitDecision(allowed=True, retry_after_seconds=0)

            if locked_until <= now:
                self._failures.pop(key, None)
                return RateLimitDecision(allowed=True, retry_after_seconds=0)

            return RateLimitDecision(
                allowed=False,
                retry_after_seconds=max(1, int(locked_until - now) + 1),
            )

    async def record_failure(
        self,
        key: Hashable,
        *,
        failure_limit: int,
        lock_seconds: int,
    ) -> RateLimitDecision:
        now = time.monotonic()

        async with self._lock:
            count, locked_until = self._failures.get(key, (0, None))

            if locked_until is not None and locked_until > now:
                return RateLimitDecision(
                    allowed=False,
                    retry_after_seconds=max(1, int(locked_until - now) + 1),
                )

            count += 1
            locked_until = None

            if count >= failure_limit:
                locked_until = now + lock_seconds

            self._failures[key] = (count, locked_until)
            self._evict_expired(now)

            if locked_until is None:
                return RateLimitDecision(allowed=True, retry_after_seconds=0)

            return RateLimitDecision(
                allowed=False,
                retry_after_seconds=max(1, int(locked_until - now) + 1),
            )

    async def clear(self, key: Hashable) -> None:
        async with self._lock:
            self._failures.pop(key, None)

    def _evict_expired(self, now: float) -> None:
        if len(self._failures) <= self._max_buckets:
            return

        expired_keys = [
            key
            for key, (_, locked_until) in self._failures.items()
            if locked_until is not None and locked_until <= now
        ]

        for key in expired_keys:
            self._failures.pop(key, None)
