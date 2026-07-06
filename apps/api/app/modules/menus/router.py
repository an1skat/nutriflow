from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.modules.auth.dependencies import CsrfProtection, CurrentUser, require_permissions
from app.modules.identity.models import AdminPermission, User
from app.modules.menus.models import MealType, WeeklyMenuStatus
from app.modules.menus.schemas import (
    CreateWeeklyMenuRequest,
    PublishWeeklyMenuRequest,
    PublishWeeklyMenuResponse,
    UpdateWeeklyMenuRequest,
    WeeklyMenuImportPreviewResponse,
    WeeklyMenuListResponse,
    WeeklyMenuResponse,
)
from app.modules.menus.service import (
    MenuAccessDeniedError,
    MenuImportError,
    MenuNotFoundError,
    MenuValidationError,
)
from app.modules.menus.service import (
    create_weekly_menu as create_weekly_menu_record,
)
from app.modules.menus.service import (
    create_weekly_menu_from_import as create_weekly_menu_from_import_record,
)
from app.modules.menus.service import (
    get_weekly_menu as get_weekly_menu_record,
)
from app.modules.menus.service import (
    list_weekly_menus as list_weekly_menu_records,
)
from app.modules.menus.service import (
    preview_weekly_menu_import as preview_weekly_menu_import_record,
)
from app.modules.menus.service import (
    publish_weekly_menu as publish_weekly_menu_record,
)
from app.modules.menus.service import (
    update_weekly_menu as update_weekly_menu_record,
)

router = APIRouter()

AdminUser = Annotated[
    User,
    Depends(require_permissions(AdminPermission.MENUS_MANAGE)),
]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


def not_found(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=str(exc),
    )


def forbidden(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=str(exc),
    )


def bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=str(exc),
    )


def validate_xlsx_file(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File name is required",
        )

    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .xlsx files are supported",
        )


@router.get("/weekly", response_model=WeeklyMenuListResponse)
async def list_weekly_menus(
    current_user: CurrentUser,
    offset: Offset = 0,
    limit: Limit = 50,
    school_id: PydanticObjectId | None = None,
    template_only: bool = False,
    status_filter: Annotated[
        WeeklyMenuStatus | None,
        Query(alias="status"),
    ] = None,
    meal_type: MealType | None = None,
) -> WeeklyMenuListResponse:
    try:
        menus, total = await list_weekly_menu_records(
            current_user,
            offset=offset,
            limit=limit,
            school_id=school_id,
            template_only=template_only,
            status=status_filter,
            meal_type=meal_type,
        )
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return WeeklyMenuListResponse(
        items=[WeeklyMenuResponse.from_menu(menu) for menu in menus],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/weekly",
    response_model=WeeklyMenuResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_weekly_menu(
    payload: CreateWeeklyMenuRequest,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await create_weekly_menu_record(payload, current_user=admin)
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.post(
    "/weekly/import-preview",
    response_model=WeeklyMenuImportPreviewResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def preview_weekly_menu_import(
    file: Annotated[UploadFile, File(description="XLSX file with weekly menu")],
    _admin: AdminUser,
    _csrf: CsrfProtection,
    meal_type: MealType = MealType.LUNCH,
    sheet_name: str | None = None,
    title: str | None = None,
) -> WeeklyMenuImportPreviewResponse:
    validate_xlsx_file(file)

    try:
        return await preview_weekly_menu_import_record(
            file,
            meal_type=meal_type,
            sheet_name=sheet_name,
            title=title,
        )
    except MenuImportError as exc:
        raise bad_request(exc) from exc


@router.post(
    "/weekly/import",
    response_model=WeeklyMenuResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_weekly_menu_from_import(
    file: Annotated[UploadFile, File(description="XLSX file with weekly menu")],
    admin: AdminUser,
    _csrf: CsrfProtection,
    meal_type: MealType = MealType.LUNCH,
    sheet_name: str | None = None,
    title: str | None = None,
    school_id: PydanticObjectId | None = None,
) -> WeeklyMenuResponse:
    validate_xlsx_file(file)

    try:
        menu = await create_weekly_menu_from_import_record(
            file,
            meal_type=meal_type,
            sheet_name=sheet_name,
            title=title,
            school_id=school_id,
            current_user=admin,
        )
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except (MenuImportError, MenuValidationError) as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.get(
    "/weekly/{menu_id}",
    response_model=WeeklyMenuResponse,
)
async def get_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: CurrentUser,
) -> WeeklyMenuResponse:
    try:
        menu = await get_weekly_menu_record(menu_id, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.patch(
    "/weekly/{menu_id}",
    response_model=WeeklyMenuResponse,
)
async def update_weekly_menu(
    menu_id: PydanticObjectId,
    payload: UpdateWeeklyMenuRequest,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await update_weekly_menu_record(menu_id, payload, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.post(
    "/weekly/{menu_id}/publish",
    response_model=PublishWeeklyMenuResponse,
)
async def publish_weekly_menu(
    menu_id: PydanticObjectId,
    payload: PublishWeeklyMenuRequest,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> PublishWeeklyMenuResponse:
    try:
        return await publish_weekly_menu_record(menu_id, payload, admin)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc
