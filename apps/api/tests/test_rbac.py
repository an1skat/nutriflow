import asyncio

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.modules.auth.dependencies import (
    authorize_school_access,
    require_permissions,
    require_roles,
)
from app.modules.identity.models import AdminPermission, User, UserRole


def test_owner_has_admin_permissions(identities):
    schools_manage = require_permissions(AdminPermission.SCHOOLS_MANAGE)

    result = asyncio.run(schools_manage(identities.admin))

    assert result == identities.admin


def test_lower_admin_permission_is_allowed(identities):
    schools_manage = require_permissions(AdminPermission.SCHOOLS_MANAGE)

    result = asyncio.run(schools_manage(identities.lower_admin))

    assert result == identities.lower_admin


def test_school_user_cannot_use_admin_role(identities):
    admin_only = require_roles(UserRole.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(admin_only(identities.school_user))

    assert exc_info.value.status_code == 403


def test_owner_can_access_any_school(identities):
    result = asyncio.run(
        authorize_school_access(
            identities.admin,
            identities.other_school.id,
        )
    )

    assert result == identities.admin


def test_school_user_can_access_own_school(identities):
    result = asyncio.run(
        authorize_school_access(
            identities.school_user,
            identities.own_school.id,
        )
    )

    assert result == identities.school_user


def test_school_user_cannot_access_another_school(identities):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            authorize_school_access(
                identities.school_user,
                identities.other_school.id,
            )
        )

    assert exc_info.value.status_code == 403


def test_owner_cannot_have_school_id(identities):
    with pytest.raises(ValidationError):
        User(
            username="invalid-owner",
            email="invalid-owner@example.com",
            password_hash="x" * 20,
            role=UserRole.OWNER,
            school_id=identities.own_school.id,
        )


def test_admin_cannot_have_school_id(identities):
    with pytest.raises(ValidationError):
        User(
            username="invalid-admin",
            email="invalid-admin@example.com",
            password_hash="x" * 20,
            role=UserRole.ADMIN,
            school_id=identities.own_school.id,
        )


def test_school_user_requires_school_id(identities):
    with pytest.raises(ValidationError):
        User(
            username="invalid-school-user",
            email=None,
            password_hash="x" * 20,
            role=UserRole.SCHOOL_USER,
            school_id=None,
        )
