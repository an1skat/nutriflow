import asyncio
import os
from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.core.config import get_settings
from app.db.beanie import init_odm
from app.db.mongo import close_mongo, connect_mongo
from app.modules.auth.security import hash_password
from app.modules.auth.service import create_first_admin
from app.modules.identity.models import School, User, UserRole

TEST_DATABASE_NAME = "nutriflow_test"


@dataclass(frozen=True)
class SeededIdentities:
    admin: User
    admin_password: str
    school_user: User
    school_user_password: str
    inactive_school_user: User
    inactive_school_user_password: str
    own_school: School
    other_school: School


def pytest_configure() -> None:
    os.environ["ENVIRONMENT"] = "test"
    os.environ["MONGO_DB"] = TEST_DATABASE_NAME
    os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-test-jwt-secret-key"
    os.environ["REFRESH_TOKEN_PEPPER"] = "test-refresh-pepper-test-refresh-pepper"
    os.environ["AUTH_COOKIE_SECURE"] = "false"

    get_settings.cache_clear()


def clean_collections() -> None:
    settings = get_settings()

    if settings.mongo_db != TEST_DATABASE_NAME:
        raise RuntimeError("Tests must only use nutriflow_test")

    client = MongoClient(settings.mongo_uri, tz_aware=True)

    try:
        database = client[settings.mongo_db]

        for collection_name in (
            "refresh_sessions",
            "users",
            "schools",
        ):
            database[collection_name].delete_many({})
    finally:
        client.close()


@pytest.fixture(autouse=True)
def clean_database() -> Iterator[None]:
    clean_collections()

    try:
        yield
    finally:
        clean_collections()


async def seed_identities() -> SeededIdentities:
    admin_password = "admin-password-123"
    school_user_password = "school-password-123"
    inactive_user_password = "inactive-password-123"

    await connect_mongo()

    try:
        await init_odm()

        admin = await create_first_admin(
            username="admin",
            email="admin@example.com",
            password=admin_password,
        )

        own_school = School(
            name="Own School",
            code="OWN",
        )
        await own_school.insert()

        other_school = School(
            name="Other School",
            code="OTHER",
        )
        await other_school.insert()

        inactive_school = School(
            name="Inactive School",
            code="INACTIVE",
            is_active=False,
        )
        await inactive_school.insert()

        school_user = User(
            username="school.user",
            email="school.user@example.com",
            password_hash=hash_password(school_user_password),
            role=UserRole.SCHOOL_USER,
            school_id=own_school.id,
        )
        await school_user.insert()

        inactive_school_user = User(
            username="inactive.user",
            email=None,
            password_hash=hash_password(inactive_user_password),
            role=UserRole.SCHOOL_USER,
            school_id=inactive_school.id,
        )
        await inactive_school_user.insert()

        return SeededIdentities(
            admin=admin,
            admin_password=admin_password,
            school_user=school_user,
            school_user_password=school_user_password,
            inactive_school_user=inactive_school_user,
            inactive_school_user_password=inactive_user_password,
            own_school=own_school,
            other_school=other_school,
        )
    finally:
        await close_mongo()


@pytest.fixture
def identities(
    clean_database: None,
) -> SeededIdentities:
    return asyncio.run(seed_identities())


@pytest.fixture
def seeded_client(
    identities: SeededIdentities,
) -> Iterator[tuple[TestClient, SeededIdentities]]:
    from app.main import app

    with TestClient(app) as client:
        yield client, identities
