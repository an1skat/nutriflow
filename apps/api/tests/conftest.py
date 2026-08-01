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
from app.modules.identity.models import AdminPermission, School, User, UserRole

TEST_DATABASE_NAME = "nutriflow_test"


@dataclass(frozen=True)
class SeededIdentities:
    admin: User
    admin_password: str
    lower_admin: User
    lower_admin_password: str
    school_user: User
    school_user_password: str
    inactive_school_user: User
    inactive_school_user_password: str
    own_school: School
    other_school: School


def pytest_configure(config: pytest.Config) -> None:
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DEBUG"] = "false"
    os.environ["DOCS_ENABLED"] = "false"
    os.environ["REDOC_ENABLED"] = "false"
    os.environ["OPENAPI_ENABLED"] = "false"
    os.environ["DATABASE_HEALTH_ENABLED"] = "false"
    os.environ["MONGO_URI"] = os.getenv(
        "TEST_MONGO_URI",
        "mongodb://nutriflow:nutriflow_dev_password@localhost:27017/?authSource=admin",
    )
    os.environ["MONGO_DB"] = TEST_DATABASE_NAME
    os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-test-jwt-secret-key"
    os.environ["REFRESH_TOKEN_PEPPER"] = "test-refresh-pepper-test-refresh-pepper"
    os.environ["AUTH_COOKIE_SECURE"] = "false"
    os.environ["RATE_LIMIT_REQUESTS"] = "10000"
    os.environ["AUTH_LOGIN_IP_REQUESTS"] = "10000"
    os.environ["AUTH_LOGIN_SUBNET_REQUESTS"] = "10000"
    os.environ["AUTH_REFRESH_IP_REQUESTS"] = "10000"
    os.environ["AUTH_REFRESH_SUBNET_REQUESTS"] = "10000"
    config.addinivalue_line(
        "markers",
        "no_clean_database: skip MongoDB cleanup for pure unit tests",
    )

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
            "menu_import_preview_sessions",
            "menu_change_requests",
            "menu_requirements",
            "dish_card_versions",
            "dish_cards",
            "weekly_menus",
            "allergens",
            "ingredients",
        ):
            database[collection_name].delete_many({})
    finally:
        client.close()


@pytest.fixture(autouse=True)
def clean_database(request: pytest.FixtureRequest) -> Iterator[None]:
    if request.node.get_closest_marker("no_clean_database"):
        yield
        return

    clean_collections()

    try:
        yield
    finally:
        clean_collections()


async def seed_identities() -> SeededIdentities:
    admin_password = "admin-password-123"
    lower_admin_password = "lower-admin-password-123"
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

        lower_admin = User(
            username="lower.admin",
            email="lower.admin@example.com",
            password_hash=hash_password(lower_admin_password),
            role=UserRole.ADMIN,
            permissions=[
                AdminPermission.SCHOOLS_MANAGE,
                AdminPermission.SCHOOL_USERS_MANAGE,
                AdminPermission.SCHOOL_GROUPS_MANAGE,
                AdminPermission.MENUS_MANAGE,
            ],
            created_by_admin_id=admin.id,
        )
        await lower_admin.insert()

        own_school = School(
            name="Own School",
            admin_owner_id=lower_admin.id,
        )
        await own_school.insert()

        other_school = School(
            name="Other School",
        )
        await other_school.insert()

        inactive_school = School(
            name="Inactive School",
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
            lower_admin=lower_admin,
            lower_admin_password=lower_admin_password,
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
