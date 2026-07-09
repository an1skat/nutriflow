from datetime import date as Date
from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.modules.auth.dependencies import CsrfProtection, require_roles
from app.modules.identity.models import User, UserRole
from app.modules.menu_requirements.schemas import (
    GenerateMenuRequirementsRequest,
    GenerateMenuRequirementsResponse,
    MenuRequirementListResponse,
    MenuRequirementResponse,
)
from app.modules.menu_requirements.service import (
    MenuRequirementAccessDeniedError,
    MenuRequirementNotFoundError,
    MenuRequirementValidationError,
    generate_menu_requirements,
    get_menu_requirement,
    list_menu_requirements,
)

router = APIRouter()

SchoolUser = Annotated[User, Depends(require_roles(UserRole.SCHOOL_USER))]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


def not_found(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


def forbidden(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


def bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/generate",
    response_model=GenerateMenuRequirementsResponse,
)
async def generate(
    payload: GenerateMenuRequirementsRequest,
    current_user: SchoolUser,
    _csrf: CsrfProtection,
) -> GenerateMenuRequirementsResponse:
    try:
        requirements = await generate_menu_requirements(
            payload.weekly_menu_id,
            payload.weekday,
            current_user,
        )
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuRequirementValidationError as exc:
        raise bad_request(exc) from exc

    return GenerateMenuRequirementsResponse(
        items=[
            MenuRequirementResponse.from_requirement(requirement)
            for requirement in requirements
        ]
    )


@router.get("", response_model=MenuRequirementListResponse)
async def list_requirements(
    current_user: SchoolUser,
    offset: Offset = 0,
    limit: Limit = 50,
    weekly_menu_id: PydanticObjectId | None = None,
    school_group_id: PydanticObjectId | None = None,
    service_date: Date | None = None,
) -> MenuRequirementListResponse:
    try:
        requirements, total = await list_menu_requirements(
            current_user,
            offset=offset,
            limit=limit,
            weekly_menu_id=weekly_menu_id,
            school_group_id=school_group_id,
            service_date=service_date,
        )
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return MenuRequirementListResponse(
        items=[
            MenuRequirementResponse.from_requirement(requirement)
            for requirement in requirements
        ],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/{requirement_id}", response_model=MenuRequirementResponse)
async def get_requirement(
    requirement_id: PydanticObjectId,
    current_user: SchoolUser,
) -> MenuRequirementResponse:
    try:
        requirement = await get_menu_requirement(requirement_id, current_user)
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
    return MenuRequirementResponse.from_requirement(requirement)
