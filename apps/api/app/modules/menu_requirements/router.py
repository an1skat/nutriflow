from datetime import date as Date
from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse

from app.api.errors import bad_request, forbidden, not_found
from app.api.responses import xlsx_response
from app.modules.auth.dependencies import CsrfProtection, CurrentUser, require_roles
from app.modules.identity.models import User, UserRole
from app.modules.menu_requirements.schemas import (
    GenerateMenuRequirementsRequest,
    GenerateMenuRequirementsResponse,
    MenuRequirementCalendarResponse,
    MenuRequirementListResponse,
    MenuRequirementReportGranularity,
    MenuRequirementReportResponse,
    MenuRequirementResponse,
    UpdateMenuRequirementRequest,
)
from app.modules.menu_requirements.service import (
    MenuRequirementAccessDeniedError,
    MenuRequirementNotFoundError,
    MenuRequirementValidationError,
    delete_menu_requirement,
    export_menu_requirement_report_workbook,
    export_menu_requirement_workbook,
    generate_menu_requirements,
    get_menu_requirement,
    get_menu_requirement_calendar,
    get_menu_requirement_report,
    list_menu_requirements,
    update_menu_requirement,
)
from app.modules.menus.models import MealType

router = APIRouter()

SchoolUser = Annotated[User, Depends(require_roles(UserRole.SCHOOL_USER))]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]
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
            payload.service_date,
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
            MenuRequirementResponse.from_requirement(
                record.requirement,
                school_name=record.school_name,
                school_admin_owner_id=record.school_admin_owner_id,
                school_admin_owner_username=record.school_admin_owner_username,
            )
            for record in requirements
        ]
    )


@router.get("", response_model=MenuRequirementListResponse)
async def list_requirements(
    current_user: CurrentUser,
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
            MenuRequirementResponse.from_requirement(
                record.requirement,
                school_name=record.school_name,
                school_admin_owner_id=record.school_admin_owner_id,
                school_admin_owner_username=record.school_admin_owner_username,
            )
            for record in requirements
        ],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/calendar", response_model=MenuRequirementCalendarResponse)
async def get_calendar(
    current_user: CurrentUser,
    school_id: PydanticObjectId,
    year: int = Query(ge=2000, le=2100),
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> MenuRequirementCalendarResponse:
    try:
        return await get_menu_requirement_calendar(
            school_id,
            year,
            current_user,
            meal_type=meal_type,
            school_group_id=school_group_id,
        )
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc


@router.get("/report", response_model=MenuRequirementReportResponse)
async def get_report(
    current_user: CurrentUser,
    school_id: PydanticObjectId,
    date_from: Date,
    date_to: Date,
    granularity: MenuRequirementReportGranularity,
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> MenuRequirementReportResponse:
    try:
        return await get_menu_requirement_report(
            school_id,
            date_from,
            date_to,
            granularity,
            current_user,
            meal_type=meal_type,
            school_group_id=school_group_id,
        )
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuRequirementValidationError as exc:
        raise bad_request(exc) from exc


@router.get("/report/export.xlsx")
async def export_report(
    current_user: CurrentUser,
    school_id: PydanticObjectId,
    date_from: Date,
    date_to: Date,
    granularity: MenuRequirementReportGranularity,
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> StreamingResponse:
    try:
        filename, content = await export_menu_requirement_report_workbook(
            school_id,
            date_from,
            date_to,
            granularity,
            current_user,
            meal_type=meal_type,
            school_group_id=school_group_id,
        )
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuRequirementValidationError as exc:
        raise bad_request(exc) from exc
    return xlsx_response(filename, content)


@router.get("/{requirement_id}", response_model=MenuRequirementResponse)
async def get_requirement(
    requirement_id: PydanticObjectId,
    current_user: CurrentUser,
) -> MenuRequirementResponse:
    try:
        record = await get_menu_requirement(requirement_id, current_user)
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
    return MenuRequirementResponse.from_requirement(
        record.requirement,
        school_name=record.school_name,
        school_admin_owner_id=record.school_admin_owner_id,
        school_admin_owner_username=record.school_admin_owner_username,
    )


@router.get("/{requirement_id}/export.xlsx")
async def export_requirement(
    requirement_id: PydanticObjectId,
    current_user: CurrentUser,
) -> StreamingResponse:
    try:
        filename, content = await export_menu_requirement_workbook(
            requirement_id,
            current_user,
        )
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
    return xlsx_response(filename, content)


@router.patch("/{requirement_id}", response_model=MenuRequirementResponse)
async def update_requirement(
    requirement_id: PydanticObjectId,
    payload: UpdateMenuRequirementRequest,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> MenuRequirementResponse:
    try:
        record = await update_menu_requirement(
            requirement_id,
            current_user,
            payload.ingredient_rows,
        )
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuRequirementValidationError as exc:
        raise bad_request(exc) from exc

    return MenuRequirementResponse.from_requirement(
        record.requirement,
        school_name=record.school_name,
        school_admin_owner_id=record.school_admin_owner_id,
        school_admin_owner_username=record.school_admin_owner_username,
    )


@router.delete("/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_requirement(
    requirement_id: PydanticObjectId,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> None:
    try:
        await delete_menu_requirement(requirement_id, current_user)
    except MenuRequirementNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuRequirementAccessDeniedError as exc:
        raise forbidden(exc) from exc
