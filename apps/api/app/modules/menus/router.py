from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_app_settings
from app.api.errors import bad_request, forbidden, not_found
from app.api.responses import xlsx_response
from app.core.config import Settings
from app.modules.auth.dependencies import CsrfProtection, CurrentUser, require_permissions
from app.modules.identity.models import AdminPermission, User
from app.modules.menus.models import MealType, MenuChangeRequestStatus, Weekday, WeeklyMenuStatus
from app.modules.menus.schemas import (
    CloseDueWeeklyMenuDaysResponse,
    CommitWeeklyMenuImportRequest,
    CreateWeeklyMenuRequest,
    MenuChangeRequestListResponse,
    MenuChangeRequestResponse,
    PublishWeeklyMenuRequest,
    PublishWeeklyMenuResponse,
    UpdateWeeklyMenuRequest,
    WeeklyMenuImportCommitResponse,
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
    archive_school_weekly_menu as archive_school_weekly_menu_record,
)
from app.modules.menus.service import (
    archive_weekly_menu as archive_weekly_menu_record,
)
from app.modules.menus.service import (
    close_due_weekly_menu_days as close_due_weekly_menu_days_record,
)
from app.modules.menus.service import (
    close_weekly_menu_day as close_weekly_menu_day_record,
)
from app.modules.menus.service import (
    commit_weekly_menu_import as commit_weekly_menu_import_record,
)
from app.modules.menus.service import (
    create_weekly_menu as create_weekly_menu_record,
)
from app.modules.menus.service import (
    create_weekly_menu_from_import as create_weekly_menu_from_import_record,
)
from app.modules.menus.service import (
    delete_weekly_menu as delete_weekly_menu_record,
)
from app.modules.menus.service import (
    export_many_weekly_menu_workbooks as export_many_weekly_menu_workbooks_record,
)
from app.modules.menus.service import (
    export_weekly_menu_workbook as export_weekly_menu_workbook_record,
)
from app.modules.menus.service import (
    generate_weekly_menu_template_workbook as generate_weekly_menu_template_workbook_record,
)
from app.modules.menus.service import (
    get_weekly_menu as get_weekly_menu_record,
)
from app.modules.menus.service import (
    list_menu_change_requests as list_menu_change_request_records,
)
from app.modules.menus.service import (
    list_weekly_menus as list_weekly_menu_records,
)
from app.modules.menus.service import (
    mark_menu_change_request_reviewed as mark_menu_change_request_reviewed_record,
)
from app.modules.menus.service import (
    preview_weekly_menu_import as preview_weekly_menu_import_record,
)
from app.modules.menus.service import (
    publish_weekly_menu as publish_weekly_menu_record,
)
from app.modules.menus.service import (
    reopen_weekly_menu_day_for_dev as reopen_weekly_menu_day_for_dev_record,
)
from app.modules.menus.service import (
    restore_school_weekly_menu as restore_school_weekly_menu_record,
)
from app.modules.menus.service import (
    restore_weekly_menu as restore_weekly_menu_record,
)
from app.modules.menus.service import (
    revoke_weekly_menu as revoke_weekly_menu_record,
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


@router.get(
    "/change-requests",
    response_model=MenuChangeRequestListResponse,
)
async def list_menu_change_requests(
    current_user: CurrentUser,
    offset: Offset = 0,
    limit: Limit = 50,
    status_filter: Annotated[
        MenuChangeRequestStatus | None,
        Query(alias="status"),
    ] = None,
) -> MenuChangeRequestListResponse:
    try:
        requests, total = await list_menu_change_request_records(
            current_user,
            offset=offset,
            limit=limit,
            status=status_filter,
        )
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return MenuChangeRequestListResponse(
        items=[
            MenuChangeRequestResponse.from_request(request, school_name=school_name)
            for request, school_name in requests
        ],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/change-requests/{request_id}/reviewed",
    response_model=MenuChangeRequestResponse,
)
async def mark_menu_change_request_reviewed(
    request_id: PydanticObjectId,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> MenuChangeRequestResponse:
    try:
        request, school_name = await mark_menu_change_request_reviewed_record(
            request_id,
            current_user,
        )
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc

    return MenuChangeRequestResponse.from_request(request, school_name=school_name)


@router.get("/weekly", response_model=WeeklyMenuListResponse)
async def list_weekly_menus(
    current_user: CurrentUser,
    offset: Offset = 0,
    limit: Limit = 50,
    school_id: PydanticObjectId | None = None,
    source_menu_id: PydanticObjectId | None = None,
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
            source_menu_id=source_menu_id,
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
    admin: AdminUser,
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
            current_user=admin,
        )
    except MenuImportError as exc:
        raise bad_request(exc) from exc


@router.post(
    "/weekly/import-commit",
    response_model=WeeklyMenuImportCommitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def commit_weekly_menu_import(
    payload: CommitWeeklyMenuImportRequest,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuImportCommitResponse:
    try:
        return await commit_weekly_menu_import_record(
            payload.preview_id,
            school_id=payload.school_id,
            current_user=admin,
        )
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except (MenuImportError, MenuValidationError) as exc:
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


@router.get("/weekly/template.xlsx")
async def download_weekly_menu_template(
    admin: AdminUser,
) -> StreamingResponse:
    try:
        filename, content = await generate_weekly_menu_template_workbook_record()
    except MenuImportError as exc:
        raise bad_request(exc) from exc

    return xlsx_response(filename, content)


@router.get("/weekly/export.xlsx")
async def export_many_weekly_menu_workbooks(
    menu_id: Annotated[list[PydanticObjectId], Query(min_length=1)],
    current_user: CurrentUser,
) -> StreamingResponse:
    try:
        filename, content = await export_many_weekly_menu_workbooks_record(menu_id, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuImportError as exc:
        raise bad_request(exc) from exc

    return xlsx_response(filename, content)


@router.get("/weekly/{menu_id}/export.xlsx")
async def export_weekly_menu_workbook(
    menu_id: PydanticObjectId,
    current_user: CurrentUser,
) -> StreamingResponse:
    try:
        filename, content = await export_weekly_menu_workbook_record(menu_id, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuImportError as exc:
        raise bad_request(exc) from exc

    return xlsx_response(filename, content)


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
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.post(
    "/weekly/{menu_id}/school-archive",
    response_model=WeeklyMenuResponse,
)
async def archive_school_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await archive_school_weekly_menu_record(menu_id, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.post(
    "/weekly/{menu_id}/school-restore",
    response_model=WeeklyMenuResponse,
)
async def restore_school_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await restore_school_weekly_menu_record(menu_id, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.post(
    "/weekly/close-due-days",
    response_model=CloseDueWeeklyMenuDaysResponse,
)
async def close_due_weekly_menu_days(
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> CloseDueWeeklyMenuDaysResponse:
    try:
        closed_days = await close_due_weekly_menu_days_record(current_user)
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    return CloseDueWeeklyMenuDaysResponse(closed_days=closed_days)


@router.post(
    "/weekly/{menu_id}/days/{weekday}/close",
    response_model=WeeklyMenuResponse,
)
async def close_weekly_menu_day(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await close_weekly_menu_day_record(menu_id, weekday, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.post(
    "/weekly/{menu_id}/days/{weekday}/dev-reopen",
    response_model=WeeklyMenuResponse,
)
async def dev_reopen_weekly_menu_day(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: CurrentUser,
    _csrf: CsrfProtection,
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> WeeklyMenuResponse:
    if settings.environment.lower() in {"prod", "production"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev-only endpoint is disabled",
        )

    try:
        menu = await reopen_weekly_menu_day_for_dev_record(menu_id, weekday, current_user)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.post(
    "/weekly/{menu_id}/revoke",
    response_model=WeeklyMenuResponse,
)
async def revoke_weekly_menu(
    menu_id: PydanticObjectId,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await revoke_weekly_menu_record(menu_id, admin)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

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
    "/weekly/{menu_id}/archive",
    response_model=WeeklyMenuResponse,
)
async def archive_weekly_menu(
    menu_id: PydanticObjectId,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await archive_weekly_menu_record(menu_id, admin)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc

    return WeeklyMenuResponse.from_menu(menu)


@router.delete(
    "/weekly/{menu_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_weekly_menu(
    menu_id: PydanticObjectId,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> None:
    try:
        await delete_weekly_menu_record(menu_id, admin)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc
    except MenuValidationError as exc:
        raise bad_request(exc) from exc


@router.post(
    "/weekly/{menu_id}/restore",
    response_model=WeeklyMenuResponse,
)
async def restore_weekly_menu(
    menu_id: PydanticObjectId,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> WeeklyMenuResponse:
    try:
        menu = await restore_weekly_menu_record(menu_id, admin)
    except MenuNotFoundError as exc:
        raise not_found(exc) from exc
    except MenuAccessDeniedError as exc:
        raise forbidden(exc) from exc

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
