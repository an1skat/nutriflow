from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.config import Settings, get_settings
from app.modules.auth.schemas import FirstAdminInput
from app.modules.auth.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    password_needs_rehash,
    verify_password,
    verify_password_for_missing_user,
)
from app.modules.identity.models import (
    RefreshRevokeReason,
    RefreshSession,
    School,
    User,
    UserRole,
)


class AuthenticationError(ValueError):
    pass


class FirstAdminAlreadyExistsError(ValueError):
    pass


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int


async def authenticate_user(identifier: str, password: str) -> User:
    normalized_identifier = identifier.strip().lower()

    user = await User.find_one(
        {
            "$or": [
                {"username": normalized_identifier},
                {"email": normalized_identifier},
            ]
        }
    )

    if user is None:
        verify_password_for_missing_user(password)
        raise AuthenticationError("Invalid credentials")

    if not verify_password(password, user.password_hash):
        raise AuthenticationError("Invalid credentials")

    if not user.is_active:
        raise AuthenticationError("Invalid credentials")

    if user.role == UserRole.ADMIN:
        if user.school_id is not None:
            raise AuthenticationError("Invalid credentials")
    else:
        if user.school_id is None:
            raise AuthenticationError("Invalid credentials")

        school = await School.get(user.school_id)

        if school is None or not school.is_active:
            raise AuthenticationError("Invalid credentials")

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        user.updated_at = datetime.now(UTC)
        await user.save()

    return user


async def login(
    identifier: str,
    password: str,
    *,
    settings: Settings | None = None,
) -> TokenPair:
    user = await authenticate_user(identifier, password)
    return await issue_token_pair(user, settings=settings)


async def issue_token_pair(
    user: User,
    *,
    settings: Settings | None = None,
    family_id: str | None = None,
) -> TokenPair:
    if user.id is None:
        raise ValueError("Tokens can only be issued for a persisted user")

    settings = settings or get_settings()
    now = datetime.now(UTC)

    session, raw_refresh_token = await _create_refresh_session(
        user=user,
        family_id=family_id or str(uuid4()),
        settings=settings,
        now=now,
    )

    return TokenPair(
        access_token=create_access_token(
            user,
            settings=settings,
            now=now,
        ),
        refresh_token=raw_refresh_token,
        expires_in=settings.access_token_ttl_minutes * 60,
    )


async def rotate_refresh_token(
    raw_refresh_token: str,
    *,
    settings: Settings | None = None,
) -> TokenPair:
    settings = settings or get_settings()
    now = datetime.now(UTC)
    token_hash = hash_refresh_token(raw_refresh_token, settings=settings)

    session = await RefreshSession.find_one(RefreshSession.token_hash == token_hash)

    if session is None:
        raise AuthenticationError("Invalid refresh token")

    if session.revoked_at is not None:
        await _handle_revoked_refresh_session(
            session,
            settings=settings,
            now=now,
        )
        raise AuthenticationError("Invalid refresh token")

    if session.expires_at <= now:
        await _revoke_session(
            session,
            now=now,
            reason=RefreshRevokeReason.EXPIRED,
        )
        raise AuthenticationError("Invalid refresh token")

    user = await User.get(session.user_id)

    if user is None or not user.is_active:
        await _revoke_active_session_family(
            session.family_id,
            now=now,
            reason=RefreshRevokeReason.USER_UNAVAILABLE,
        )
        raise AuthenticationError("Invalid refresh token")

    collection = RefreshSession.get_pymongo_collection()

    claimed_session = await collection.find_one_and_update(
        {
            "_id": session.id,
            "revoked_at": None,
            "expires_at": {"$gt": now},
        },
        {
            "$set": {
                "revoked_at": now,
                "revoke_reason": RefreshRevokeReason.ROTATED.value,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if claimed_session is None:
        latest_session = await RefreshSession.get(session.id)

        if latest_session is not None and latest_session.revoked_at is not None:
            await _handle_revoked_refresh_session(
                latest_session,
                settings=settings,
                now=now,
            )

        raise AuthenticationError("Invalid refresh token")

    replacement_session, replacement_token = await _create_refresh_session(
        user=user,
        family_id=session.family_id,
        settings=settings,
        now=now,
    )

    await collection.update_one(
        {"_id": session.id},
        {
            "$set": {
                "replaced_by_session_id": replacement_session.id,
            }
        },
    )

    family_was_compromised = await collection.find_one(
        {
            "family_id": session.family_id,
            "revoke_reason": RefreshRevokeReason.REUSE_DETECTED.value,
        },
        {"_id": 1},
    )

    if family_was_compromised is not None:
        await _compromise_session_family(
            session.family_id,
            now=now,
        )
        raise AuthenticationError("Invalid refresh token")

    return TokenPair(
        access_token=create_access_token(
            user,
            settings=settings,
            now=now,
        ),
        refresh_token=replacement_token,
        expires_in=settings.access_token_ttl_minutes * 60,
    )


async def logout(
    raw_refresh_token: str,
    *,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    token_hash = hash_refresh_token(raw_refresh_token, settings=settings)

    session = await RefreshSession.find_one(RefreshSession.token_hash == token_hash)

    if session is None:
        return

    await _revoke_active_session_family(
        session.family_id,
        now=datetime.now(UTC),
        reason=RefreshRevokeReason.LOGOUT,
    )


async def create_first_admin(
    username: str,
    email: str,
    password: str,
) -> User:
    data = FirstAdminInput(
        username=username,
        email=email,
        password=password,
    )

    existing_admin = await User.find_one(User.role == UserRole.ADMIN)

    if existing_admin is not None:
        raise FirstAdminAlreadyExistsError("An administrator already exists")

    admin = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole.ADMIN,
        school_id=None,
    )

    try:
        await admin.insert()
    except DuplicateKeyError as exc:
        raise FirstAdminAlreadyExistsError(
            "A user with this username or email already exists"
        ) from exc

    return admin


async def _create_refresh_session(
    *,
    user: User,
    family_id: str,
    settings: Settings,
    now: datetime,
) -> tuple[RefreshSession, str]:
    if user.id is None:
        raise ValueError("Refresh session requires a persisted user")

    raw_refresh_token = generate_refresh_token()

    session = RefreshSession(
        user_id=user.id,
        family_id=family_id,
        token_hash=hash_refresh_token(
            raw_refresh_token,
            settings=settings,
        ),
        expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
    )

    await session.insert()
    return session, raw_refresh_token


async def _revoke_session(
    session: RefreshSession,
    *,
    now: datetime,
    reason: RefreshRevokeReason,
) -> None:
    await RefreshSession.get_pymongo_collection().update_one(
        {
            "_id": session.id,
            "revoked_at": None,
        },
        {
            "$set": {
                "revoked_at": now,
                "revoke_reason": reason.value,
            }
        },
    )


async def _revoke_active_session_family(
    family_id: str,
    *,
    now: datetime,
    reason: RefreshRevokeReason,
) -> None:
    await RefreshSession.get_pymongo_collection().update_many(
        {
            "family_id": family_id,
            "revoked_at": None,
        },
        {
            "$set": {
                "revoked_at": now,
                "revoke_reason": reason.value,
            }
        },
    )


async def _compromise_session_family(
    family_id: str,
    *,
    now: datetime,
) -> None:
    await RefreshSession.get_pymongo_collection().update_many(
        {"family_id": family_id},
        {
            "$set": {
                "revoked_at": now,
                "revoke_reason": RefreshRevokeReason.REUSE_DETECTED.value,
            }
        },
    )


async def _handle_revoked_refresh_session(
    session: RefreshSession,
    *,
    settings: Settings,
    now: datetime,
) -> None:
    if (
        session.revoke_reason == RefreshRevokeReason.ROTATED
        and session.revoked_at is not None
        and now - session.revoked_at <= timedelta(seconds=settings.refresh_reuse_grace_seconds)
    ):
        # A browser may send the same refresh cookie concurrently from
        # multiple requests or tabs. Reject the stale request, but preserve
        # the replacement session created by the winning request.
        return

    if session.revoke_reason in {
        RefreshRevokeReason.ROTATED,
        RefreshRevokeReason.REUSE_DETECTED,
    }:
        await _compromise_session_family(
            session.family_id,
            now=now,
        )
