import asyncio
import time
from collections import defaultdict, deque
from collections.abc import Hashable
from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int


@dataclass
class _FailureRecord:
    count: int
    locked_until: float | None
    last_seen: float


class SlidingWindowRateLimiter:
    def __init__(
        self,
        *,
        max_buckets: int = 10000,
    ) -> None:
        if max_buckets < 1:
            raise ValueError("max_buckets must be positive")
        self._attempts: dict[Hashable, deque[float]] = defaultdict(deque)
        self._last_seen: dict[Hashable, float] = {}
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
            self._last_seen[key] = now
            self._evict_oldest_buckets(protected_key=key)
            return RateLimitDecision(allowed=True, retry_after_seconds=0)

    async def clear(self, key: Hashable) -> None:
        async with self._lock:
            self._attempts.pop(key, None)
            self._last_seen.pop(key, None)

    def _evict_oldest_buckets(self, *, protected_key: Hashable) -> None:
        if len(self._attempts) <= self._max_buckets:
            return

        overflow = len(self._attempts) - self._max_buckets
        oldest_keys = sorted(
            (key for key in self._attempts if key != protected_key),
            key=lambda key: self._last_seen.get(key, float("-inf")),
        )[:overflow]
        for key in oldest_keys:
            self._attempts.pop(key, None)
            self._last_seen.pop(key, None)


class FailureLockout:
    def __init__(
        self,
        *,
        max_buckets: int = 10000,
    ) -> None:
        if max_buckets < 1:
            raise ValueError("max_buckets must be positive")
        self._failures: dict[Hashable, _FailureRecord] = {}
        self._lock = asyncio.Lock()
        self._max_buckets = max_buckets

    async def check(self, key: Hashable) -> RateLimitDecision:
        now = time.monotonic()

        async with self._lock:
            record = self._failures.get(key)

            if record is None:
                return RateLimitDecision(allowed=True, retry_after_seconds=0)

            record.last_seen = now
            locked_until = record.locked_until

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
            record = self._failures.get(key)
            count = record.count if record is not None else 0
            locked_until = record.locked_until if record is not None else None

            if locked_until is not None and locked_until > now:
                return RateLimitDecision(
                    allowed=False,
                    retry_after_seconds=max(1, int(locked_until - now) + 1),
                )

            count += 1
            locked_until = None

            if count >= failure_limit:
                locked_until = now + lock_seconds

            self._failures[key] = _FailureRecord(
                count=count,
                locked_until=locked_until,
                last_seen=now,
            )
            self._evict_oldest_records(now, protected_key=key)

            if locked_until is None:
                return RateLimitDecision(allowed=True, retry_after_seconds=0)

            return RateLimitDecision(
                allowed=False,
                retry_after_seconds=max(1, int(locked_until - now) + 1),
            )

    async def clear(self, key: Hashable) -> None:
        async with self._lock:
            self._failures.pop(key, None)

    def _evict_oldest_records(self, now: float, *, protected_key: Hashable) -> None:
        if len(self._failures) <= self._max_buckets:
            return

        expired_keys = [
            key
            for key, record in self._failures.items()
            if key != protected_key
            and record.locked_until is not None
            and record.locked_until <= now
        ]
        for key in expired_keys:
            self._failures.pop(key, None)

        overflow = len(self._failures) - self._max_buckets
        if overflow <= 0:
            return

        oldest_keys = sorted(
            (key for key in self._failures if key != protected_key),
            key=lambda key: self._failures[key].last_seen,
        )[:overflow]
        for key in oldest_keys:
            self._failures.pop(key, None)
