import asyncio
import re
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from datetime import date as Date
from typing import Any
from zoneinfo import ZoneInfo

from beanie import BulkWriter, PydanticObjectId
from fastapi import UploadFile
from pymongo import ReturnDocument

from app.core.config import get_settings
from app.db.mongo import get_mongo_client
from app.modules.auth.service import user_has_permissions
from app.modules.identity.models import AdminPermission, School, User, UserRole
from app.modules.menu_requirements.service import (
    MenuRequirementValidationError,
    generate_menu_requirements,
    resolve_service_date,
)
from app.modules.menus.import_references import hydrate_preview_references
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    DayCloseReason,
    MealType,
    MenuChangeRequest,
    MenuChangeRequestStatus,
    MenuFieldChange,
    MenuImportDiagnostic,
    MenuImportDiagnosticLevel,
    MenuImportPreviewSession,
    MenuItemServingCount,
    MenuNutrition,
    MenuPortion,
    Weekday,
    WeeklyMenu,
    WeeklyMenuStatus,
)
from app.modules.menus.reference_resolver import (
    MenuReferenceError,
    resolve_menu_item_references,
)
from app.modules.menus.schemas import (
    CreateWeeklyMenuRequest,
    DailyMenuItemPayload,
    DailyMenuPayload,
    MenuItemServingCountPayload,
    MenuPortionPayload,
    PublishWeeklyMenuRequest,
    PublishWeeklyMenuResponse,
    UpdateWeeklyMenuRequest,
    WeeklyMenuImportCommitResponse,
    WeeklyMenuImportDiagnosticResponse,
    WeeklyMenuImportPreviewItemResponse,
    WeeklyMenuImportPreviewResponse,
    WeeklyMenuResponse,
)
from app.modules.menus.xlsx import (
    ParsedWeeklyMenuPreview,
    XlsxMenuError,
    build_export_workbook,
    build_template_workbook,
)
from app.modules.menus.xlsx import (
    preview_weekly_menu_workbook as preview_xlsx_weekly_menu_workbook,
)


class MenuNotFoundError(ValueError):
    """The requested menu does not exist."""


class MenuAccessDeniedError(ValueError):
    """Current user cannot access the requested menu."""


class MenuValidationError(ValueError):
    """Menu payload violates a domain rule."""


class MenuImportError(ValueError):
    """Menu import file cannot be parsed into a weekly menu."""


DAY_AUTO_CLOSE_HOUR = 18
SCHOOL_TIMEZONE = ZoneInfo("Europe/Kyiv")


async def list_weekly_menus(
    current_user: User,
    *,
    offset: int,
    limit: int,
    school_id: PydanticObjectId | None = None,
    source_menu_id: PydanticObjectId | None = None,
    template_only: bool = False,
    status: WeeklyMenuStatus | None = None,
    meal_type: MealType | None = None,
) -> tuple[list[WeeklyMenu], int]:
    filters: dict[str, Any] = {}

    if current_user.role == UserRole.SCHOOL_USER:
        filters["school_id"] = current_user.school_id
    elif current_user.role == UserRole.ADMIN:
        await _ensure_menu_permission(current_user)

        if template_only:
            filters["school_id"] = None
            filters["created_by"] = current_user.id
        elif school_id is not None:
            await _ensure_admin_school_access(current_user, school_id)
            filters["school_id"] = school_id
        else:
            owned_school_ids = await _get_admin_school_ids(current_user)
            filters["$or"] = [
                {"school_id": {"$in": owned_school_ids}},
                {"school_id": None, "created_by": current_user.id},
            ]
    elif current_user.role == UserRole.TECHNOLOGIST:
        await _ensure_menu_permission(current_user)
        if template_only:
            filters["school_id"] = None
        elif school_id is not None:
            filters["school_id"] = school_id
    elif template_only:
        filters["school_id"] = None
    elif school_id is not None:
        filters["school_id"] = school_id

    if source_menu_id is not None:
        filters["source_menu_id"] = source_menu_id

    if status is not None:
        filters["status"] = status.value
    else:
        filters["status"] = {
            "$nin": [
                WeeklyMenuStatus.ARCHIVED.value,
                WeeklyMenuStatus.REVOKED.value,
            ]
        }
    if current_user.role == UserRole.SCHOOL_USER:
        if status is None:
            filters["status"] = WeeklyMenuStatus.PUBLISHED.value
        elif status not in {WeeklyMenuStatus.PUBLISHED, WeeklyMenuStatus.ARCHIVED}:
            return [], 0
    if meal_type is not None:
        filters["meal_type"] = meal_type.value

    cursor = WeeklyMenu.find(filters)
    total = await cursor.count()
    items = await cursor.sort("-created_at").skip(offset).limit(limit).to_list()
    return items, total


async def get_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: User,
) -> WeeklyMenu:
    menu = await WeeklyMenu.get(menu_id)

    if menu is None:
        raise MenuNotFoundError("Weekly menu not found")

    await _authorize_menu_access(menu, current_user)
    return menu


async def create_weekly_menu(
    data: CreateWeeklyMenuRequest,
    *,
    current_user: User,
) -> WeeklyMenu:
    await _ensure_menu_permission(current_user)

    if data.school_id is not None:
        await _get_active_school_for_user(data.school_id, current_user)

    now = datetime.now(UTC)
    menu = WeeklyMenu(
        title=data.title,
        school_id=data.school_id,
        meal_type=data.meal_type,
        cycle_week=data.cycle_week,
        starts_on=data.starts_on,
        ends_on=data.ends_on,
        days=await _to_daily_menus(data.days),
        notes=data.notes,
        source_file_name=data.source_file_name,
        source_sheet_name=data.source_sheet_name,
        created_by=current_user.id,
        updated_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    await menu.insert()
    return menu


async def update_weekly_menu(
    menu_id: PydanticObjectId,
    data: UpdateWeeklyMenuRequest,
    current_user: User,
) -> WeeklyMenu:
    menu = await get_weekly_menu(menu_id, current_user)
    previous_days = deepcopy(menu.days)
    converted_days: list[DailyMenu] | None = None

    if current_user.role == UserRole.SCHOOL_USER:
        if menu.status != WeeklyMenuStatus.PUBLISHED:
            raise MenuAccessDeniedError("Menu access denied")
        if data.model_fields_set - {"days"}:
            raise MenuAccessDeniedError("School users can only update daily menu data")
        if "days" in data.model_fields_set:
            _ensure_school_menu_shape_is_stable(menu, data.days or [])
            await _ensure_school_servings_belong_to_school(
                menu.school_id,
                data.days or [],
            )
            converted_days = await _to_daily_menus(data.days or [])
            _ensure_closed_days_are_unchanged(previous_days, converted_days)
            _copy_day_close_metadata(previous_days, converted_days)
    elif "days" in data.model_fields_set:
        converted_days = await _to_daily_menus(data.days or [])

    if "title" in data.model_fields_set:
        menu.title = data.title
    if "meal_type" in data.model_fields_set:
        menu.meal_type = data.meal_type
    if "cycle_week" in data.model_fields_set:
        menu.cycle_week = data.cycle_week
    if "starts_on" in data.model_fields_set:
        menu.starts_on = data.starts_on
    if "ends_on" in data.model_fields_set:
        menu.ends_on = data.ends_on
    if "days" in data.model_fields_set:
        menu.days = converted_days or []
    if "notes" in data.model_fields_set:
        menu.notes = data.notes

    menu.updated_by = current_user.id
    menu.updated_at = datetime.now(UTC)

    change_request: MenuChangeRequest | None = None
    if current_user.role == UserRole.SCHOOL_USER and "days" in data.model_fields_set:
        changes = _collect_school_dish_changes(previous_days, menu.days)
        if changes:
            change_request = _build_menu_change_request(menu, current_user, changes)

    if (
        change_request is None
        and current_user.role != UserRole.SCHOOL_USER
        and menu.school_id is None
        and menu.source_menu_id is None
    ):
        await _save_template_and_propagate(menu, current_user)
    elif change_request is None:
        await menu.save()
    else:

        async def save_menu_and_request(session: Any) -> None:
            await menu.save(session=session)
            await change_request.insert(session=session)

        async with get_mongo_client().start_session() as session:
            await session.with_transaction(save_menu_and_request)

    return menu


async def close_weekly_menu_day(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: User,
) -> WeeklyMenu:
    return await _close_weekly_menu_day(
        menu_id,
        weekday,
        current_user,
        reason=DayCloseReason.MANUAL,
        require_requirement=True,
    )


async def close_due_weekly_menu_days(current_user: User) -> int:
    if current_user.role != UserRole.SCHOOL_USER or current_user.school_id is None:
        raise MenuAccessDeniedError("Only schools can close due daily menus")

    menus = await WeeklyMenu.find(
        WeeklyMenu.school_id == current_user.school_id,
        WeeklyMenu.status == WeeklyMenuStatus.PUBLISHED,
    ).to_list()
    return await _auto_close_due_days(current_user, menus)


async def reopen_weekly_menu_day_for_dev(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: User,
) -> WeeklyMenu:
    if current_user.role != UserRole.SCHOOL_USER:
        raise MenuAccessDeniedError("Only schools can reopen their daily menus")

    menu = await WeeklyMenu.get(menu_id)
    if menu is None:
        raise MenuNotFoundError("Weekly menu not found")
    if menu.school_id != current_user.school_id:
        raise MenuAccessDeniedError("School access denied")
    if menu.status != WeeklyMenuStatus.PUBLISHED:
        raise MenuAccessDeniedError("Menu access denied")

    day = next((candidate for candidate in menu.days if candidate.weekday == weekday), None)
    if day is None:
        raise MenuNotFoundError("Daily menu not found")
    if day.closed_at is None:
        return menu

    now = datetime.now(UTC)
    day.closed_at = None
    day.closed_by = None
    day.close_reason = None
    day.dev_reopened_at = now
    menu.updated_by = current_user.id
    menu.updated_at = now
    await menu.save()
    return menu


async def list_menu_change_requests(
    current_user: User,
    *,
    offset: int,
    limit: int,
    status: MenuChangeRequestStatus | None = None,
) -> tuple[list[tuple[MenuChangeRequest, str]], int]:
    _ensure_change_request_access(current_user)
    filters: dict[str, Any] = {}
    if status is not None:
        filters["status"] = status.value

    query = MenuChangeRequest.find(filters)
    total = await query.count()
    requests = await query.sort("-created_at").skip(offset).limit(limit).to_list()

    school_ids = {request.school_id for request in requests}
    schools = await School.find({"_id": {"$in": list(school_ids)}}).to_list()
    school_names = {school.id: school.name for school in schools}
    return [
        (request, school_names.get(request.school_id, "Невідома школа")) for request in requests
    ], total


async def mark_menu_change_request_reviewed(
    request_id: PydanticObjectId,
    current_user: User,
) -> tuple[MenuChangeRequest, str]:
    _ensure_change_request_access(current_user)
    request = await MenuChangeRequest.get(request_id)
    if request is None:
        raise MenuNotFoundError("Menu change request not found")

    if request.status != MenuChangeRequestStatus.REVIEWED:
        now = datetime.now(UTC)
        request.status = MenuChangeRequestStatus.REVIEWED
        request.reviewed_by = current_user.id
        request.reviewed_at = now
        request.updated_at = now
        await request.save()

    school = await School.get(request.school_id)
    return request, school.name if school is not None else "Невідома школа"


async def archive_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: User,
) -> WeeklyMenu:
    await _ensure_menu_permission(current_user)
    menu = await get_weekly_menu(menu_id, current_user)

    if menu.school_id is not None:
        raise MenuValidationError("Only template weekly menus can be archived")

    if menu.status == WeeklyMenuStatus.ARCHIVED:
        return menu

    now = datetime.now(UTC)
    menu.archived_from_status = menu.status
    menu.status = WeeklyMenuStatus.ARCHIVED
    menu.updated_by = current_user.id
    menu.updated_at = now
    await menu.save()

    await WeeklyMenu.find(
        WeeklyMenu.source_menu_id == menu.id,
        WeeklyMenu.school_id != None,  # noqa: E711
        WeeklyMenu.status != WeeklyMenuStatus.REVOKED,
    ).update(
        {
            "$set": {
                "status": WeeklyMenuStatus.REVOKED.value,
                "revoked_at": now,
                "revoked_by": current_user.id,
                "revoke_reason": "source_archived",
                "updated_by": current_user.id,
                "updated_at": now,
            }
        }
    )
    return menu


async def restore_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: User,
) -> WeeklyMenu:
    await _ensure_menu_permission(current_user)
    menu = await get_weekly_menu(menu_id, current_user)

    if menu.status != WeeklyMenuStatus.ARCHIVED:
        return menu

    restored_status = menu.archived_from_status
    if restored_status is None or restored_status == WeeklyMenuStatus.ARCHIVED:
        restored_status = (
            WeeklyMenuStatus.PUBLISHED if menu.published_at is not None else WeeklyMenuStatus.DRAFT
        )

    menu.status = restored_status
    menu.archived_from_status = None
    menu.updated_by = current_user.id
    menu.updated_at = datetime.now(UTC)
    await menu.save()
    return menu


async def delete_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: User,
) -> None:
    await _ensure_menu_permission(current_user)
    menu = await get_weekly_menu(menu_id, current_user)

    if menu.school_id is not None:
        raise MenuValidationError("School archived weekly menus cannot be hard-deleted")
    if menu.status != WeeklyMenuStatus.ARCHIVED:
        raise MenuValidationError("Only archived weekly menus can be deleted")

    await menu.delete()


async def revoke_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: User,
) -> WeeklyMenu:
    await _ensure_menu_permission(current_user)
    menu = await get_weekly_menu(menu_id, current_user)

    if menu.school_id is None:
        raise MenuValidationError("Only school menu copies can be revoked")
    if menu.status == WeeklyMenuStatus.REVOKED:
        return menu

    now = datetime.now(UTC)
    menu.status = WeeklyMenuStatus.REVOKED
    menu.revoked_at = now
    menu.revoked_by = current_user.id
    menu.revoke_reason = "manual"
    menu.updated_by = current_user.id
    menu.updated_at = now
    await menu.save()
    return menu


async def archive_school_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: User,
) -> WeeklyMenu:
    if current_user.role != UserRole.SCHOOL_USER:
        raise MenuAccessDeniedError("Only schools can archive their own menus locally")

    menu = await WeeklyMenu.get(menu_id)
    if menu is None:
        raise MenuNotFoundError("Weekly menu not found")
    if menu.school_id != current_user.school_id:
        raise MenuAccessDeniedError("School access denied")
    if menu.status == WeeklyMenuStatus.REVOKED:
        raise MenuAccessDeniedError("Weekly menu is revoked")
    if menu.status == WeeklyMenuStatus.ARCHIVED:
        return menu

    menu.archived_from_status = menu.status
    menu.status = WeeklyMenuStatus.ARCHIVED
    menu.updated_by = current_user.id
    menu.updated_at = datetime.now(UTC)
    await menu.save()
    return menu


async def restore_school_weekly_menu(
    menu_id: PydanticObjectId,
    current_user: User,
) -> WeeklyMenu:
    if current_user.role != UserRole.SCHOOL_USER:
        raise MenuAccessDeniedError("Only schools can restore their own archived menus")

    menu = await WeeklyMenu.get(menu_id)
    if menu is None:
        raise MenuNotFoundError("Weekly menu not found")
    if menu.school_id != current_user.school_id:
        raise MenuAccessDeniedError("School access denied")
    if menu.status == WeeklyMenuStatus.REVOKED:
        raise MenuAccessDeniedError("Weekly menu is revoked")
    if menu.status != WeeklyMenuStatus.ARCHIVED:
        return menu

    restored_status = menu.archived_from_status
    if restored_status is None or restored_status == WeeklyMenuStatus.ARCHIVED:
        restored_status = WeeklyMenuStatus.PUBLISHED

    menu.status = restored_status
    menu.archived_from_status = None
    menu.updated_by = current_user.id
    menu.updated_at = datetime.now(UTC)
    await menu.save()
    return menu


async def _save_template_and_propagate(source: WeeklyMenu, actor: User) -> None:
    if source.id is None:
        raise RuntimeError("Persisted weekly menu is required")

    copies = await WeeklyMenu.find(
        WeeklyMenu.source_menu_id == source.id,
        {"status": {"$ne": WeeklyMenuStatus.REVOKED.value}},
    ).to_list()
    now = datetime.now(UTC)
    for copy in copies:
        _apply_template_update_to_copy(source, copy, actor=actor, now=now)

    async def save_source_and_copies(session: Any) -> None:
        await source.save(session=session)
        if not copies:
            return
        async with BulkWriter(session=session, ordered=False) as bulk_writer:
            for copy in copies:
                await copy.replace(session=session, bulk_writer=bulk_writer)

    async with get_mongo_client().start_session() as session:
        await session.with_transaction(save_source_and_copies)


def _apply_template_update_to_copy(
    source: WeeklyMenu,
    target: WeeklyMenu,
    *,
    actor: User,
    now: datetime,
) -> None:
    target.title = source.title
    target.meal_type = source.meal_type
    target.cycle_week = source.cycle_week
    target.starts_on = source.starts_on
    target.ends_on = source.ends_on
    target.days = _merge_distributed_days(source.days, target.days)
    target.notes = source.notes
    target.source_file_name = source.source_file_name
    target.source_sheet_name = source.source_sheet_name
    target.updated_by = actor.id
    target.updated_at = now


def _merge_distributed_days(
    source_days: list[DailyMenu],
    current_days: list[DailyMenu],
) -> list[DailyMenu]:
    current_by_weekday = {day.weekday: day for day in current_days}
    merged_days: list[DailyMenu] = []

    for source_day in source_days:
        current_day = current_by_weekday.get(source_day.weekday)
        if current_day is not None and current_day.closed_at is not None:
            merged_days.append(deepcopy(current_day))
            continue

        merged_day = deepcopy(source_day)
        if current_day is not None:
            current_items_by_id = {
                item.id: item for item in current_day.items if item.id is not None
            }
            current_items_by_position = {item.position: item for item in current_day.items}
            for item in merged_day.items:
                current_item = current_items_by_id.get(item.id)
                if current_item is None:
                    current_item = current_items_by_position.get(item.position)
                if current_item is not None:
                    item.servings = deepcopy(current_item.servings)
            merged_day.dev_reopened_at = current_day.dev_reopened_at
        merged_days.append(merged_day)

    source_weekdays = {day.weekday for day in source_days}
    merged_days.extend(
        deepcopy(day)
        for day in current_days
        if day.weekday not in source_weekdays and day.closed_at is not None
    )
    return sorted(merged_days, key=lambda day: list(Weekday).index(day.weekday))


async def publish_weekly_menu(
    menu_id: PydanticObjectId,
    data: PublishWeeklyMenuRequest,
    admin: User,
) -> PublishWeeklyMenuResponse:
    source = await get_weekly_menu(menu_id, admin)

    if source.school_id is not None:
        raise MenuValidationError("Only template weekly menus can be published")
    if source.status == WeeklyMenuStatus.ARCHIVED:
        raise MenuValidationError("Archived weekly menus cannot be published")

    target_schools = await _get_publish_target_schools(data.school_ids, admin)
    target_school_ids = [school.id for school in target_schools if school.id is not None]
    existing_copies = await WeeklyMenu.find(
        WeeklyMenu.source_menu_id == source.id,
        {"school_id": {"$in": target_school_ids}},
    ).to_list()
    existing_school_ids = {
        copy.school_id for copy in existing_copies if copy.school_id is not None
    }
    skipped_existing_school_ids = [
        school_id for school_id in target_school_ids if school_id in existing_school_ids
    ]
    now = datetime.now(UTC)

    source.status = WeeklyMenuStatus.PUBLISHED
    source.published_at = now
    source.updated_by = admin.id
    source.updated_at = now
    new_copies = [
        WeeklyMenu(
            id=PydanticObjectId(),
            title=source.title,
            school_id=school.id,
            source_menu_id=source.id,
            meal_type=source.meal_type,
            cycle_week=source.cycle_week,
            starts_on=source.starts_on,
            ends_on=source.ends_on,
            status=WeeklyMenuStatus.PUBLISHED,
            days=deepcopy(source.days),
            notes=source.notes,
            source_file_name=source.source_file_name,
            source_sheet_name=source.source_sheet_name,
            published_at=now,
            created_by=admin.id,
            updated_by=admin.id,
            created_at=now,
            updated_at=now,
        )
        for school in target_schools
        if school.id not in existing_school_ids
    ]

    async def save_publication(session: Any) -> None:
        await source.save(session=session)
        if new_copies:
            await WeeklyMenu.insert_many(new_copies, session=session)

    async with get_mongo_client().start_session() as session:
        await session.with_transaction(save_publication)

    return PublishWeeklyMenuResponse(
        source_menu_id=source.id,
        target_school_ids=target_school_ids,
        created_menu_ids=[copy.id for copy in new_copies if copy.id is not None],
        replaced_menu_ids=[],
        skipped_existing_school_ids=skipped_existing_school_ids,
    )


async def preview_weekly_menu_import(
    file: UploadFile,
    *,
    meal_type: MealType,
    sheet_name: str | None,
    title: str | None,
    current_user: User,
) -> WeeklyMenuImportPreviewResponse:
    content = await file.read()
    preview = await _preview_weekly_menu_workbook_with_references(
        content,
        filename=file.filename or "",
        meal_type=meal_type,
        sheet_name=sheet_name,
        title=title,
    )
    expires_at = datetime.now(UTC) + timedelta(
        minutes=get_settings().menu_import_preview_ttl_minutes
    )
    preview_session = MenuImportPreviewSession(
        owner_user_id=current_user.id,
        filename=file.filename or "",
        meal_type=meal_type,
        available_sheet_names=preview.available_sheet_names,
        selected_sheet_name=preview.selected_sheet_name,
        parsed_sheet_names=preview.parsed_sheet_names,
        title_override=title,
        diagnostics=preview.diagnostics,
        menu_payload=preview.menu.model_dump(mode="json") if preview.menu is not None else None,
        menu_payloads=[preview_item.menu.model_dump(mode="json") for preview_item in preview.menus],
        expires_at=expires_at,
    )
    await preview_session.insert()

    return _build_import_preview_response(
        preview_id=preview_session.id,
        filename=file.filename or "",
        preview=preview,
        expires_at=expires_at,
    )


async def create_weekly_menu_from_import(
    file: UploadFile,
    *,
    meal_type: MealType,
    sheet_name: str | None,
    title: str | None,
    school_id: PydanticObjectId | None,
    current_user: User,
) -> WeeklyMenu:
    content = await file.read()
    preview = await _preview_weekly_menu_workbook_with_references(
        content,
        filename=file.filename or "",
        meal_type=meal_type,
        sheet_name=sheet_name,
        title=title,
    )

    errors = [
        diagnostic
        for diagnostic in preview.diagnostics
        if diagnostic.level == MenuImportDiagnosticLevel.ERROR
    ]
    if errors:
        raise MenuImportError(_format_diagnostic_messages(errors))
    if not preview.menus:
        raise MenuImportError("Workbook does not contain importable menu sheets")
    if sheet_name is None and len(preview.menus) > 1:
        raise MenuImportError(
            "Workbook contains multiple menu sheets; use import preview + commit "
            "to import them together"
        )

    menu_request = deepcopy(preview.menus[0].menu)
    menu_request.school_id = school_id
    return await create_weekly_menu(menu_request, current_user=current_user)


async def commit_weekly_menu_import(
    preview_id: PydanticObjectId,
    *,
    school_id: PydanticObjectId | None,
    current_user: User,
) -> WeeklyMenuImportCommitResponse:
    preview_session = await MenuImportPreviewSession.get(preview_id)
    if preview_session is None:
        raise MenuImportError("Import preview not found")
    if preview_session.owner_user_id != current_user.id:
        raise MenuAccessDeniedError("Import preview belongs to another administrator")
    if preview_session.expires_at <= datetime.now(UTC):
        raise MenuImportError("Import preview has expired; upload the workbook again")
    if (
        preview_session.status.value == "committed"
        or preview_session.committed_menu_id is not None
        or preview_session.committed_menu_ids
    ):
        raise MenuImportError("Import preview was already committed")
    if preview_session.status.value == "committing":
        raise MenuImportError("Import preview is already being committed")
    if preview_session.status.value == "failed":
        raise MenuImportError("Import preview commit previously failed; upload the workbook again")
    if any(
        diagnostic.level == MenuImportDiagnosticLevel.ERROR
        for diagnostic in preview_session.diagnostics
    ):
        raise MenuImportError("Import preview contains errors and cannot be committed")

    payloads = preview_session.menu_payloads
    if not payloads and preview_session.menu_payload is not None:
        payloads = [preview_session.menu_payload]
    if not payloads:
        raise MenuImportError("Import preview does not contain menu payloads")

    claimed_document = await MenuImportPreviewSession.get_pymongo_collection().find_one_and_update(
        {
            "_id": preview_session.id,
            "owner_user_id": current_user.id,
            "expires_at": {"$gt": datetime.now(UTC)},
            "$and": [
                {
                    "$or": [
                        {"status": "previewed"},
                        {"status": {"$exists": False}},
                    ]
                },
                {
                    "$or": [
                        {"committed_menu_ids": []},
                        {"committed_menu_ids": {"$exists": False}},
                    ]
                },
                {
                    "$or": [
                        {"committed_menu_id": None},
                        {"committed_menu_id": {"$exists": False}},
                    ]
                },
            ],
        },
        {
            "$set": {
                "status": "committing",
                "commit_error": None,
                "updated_at": datetime.now(UTC),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if claimed_document is None:
        raise MenuImportError("Import preview is already being committed or was committed")

    created_menu_ids: list[PydanticObjectId] = []
    menus: list[WeeklyMenu] = []
    try:
        for payload in payloads:
            menu_request = CreateWeeklyMenuRequest.model_validate(payload)
            menu_request.school_id = school_id
            menu = await create_weekly_menu(menu_request, current_user=current_user)
            menus.append(menu)
            created_menu_ids.append(menu.id)
    except Exception as exc:
        if created_menu_ids:
            await WeeklyMenu.get_pymongo_collection().delete_many(
                {"_id": {"$in": created_menu_ids}}
            )
        await MenuImportPreviewSession.get_pymongo_collection().update_one(
            {"_id": preview_session.id, "status": "committing"},
            {
                "$set": {
                    "status": "failed",
                    "commit_error": str(exc)[:500],
                    "updated_at": datetime.now(UTC),
                }
            },
        )
        raise

    await MenuImportPreviewSession.get_pymongo_collection().update_one(
        {"_id": preview_session.id, "status": "committing"},
        {
            "$set": {
                "status": "committed",
                "committed_menu_id": menus[0].id if menus else None,
                "committed_menu_ids": created_menu_ids,
                "updated_at": datetime.now(UTC),
            }
        },
    )

    return WeeklyMenuImportCommitResponse(
        preview_id=preview_session.id,
        school_id=school_id,
        created_menu_ids=created_menu_ids,
        menu=WeeklyMenuResponse.from_menu(menus[0]) if menus else None,
        menus=[WeeklyMenuResponse.from_menu(menu) for menu in menus],
    )


async def export_weekly_menu_workbook(
    menu_id: PydanticObjectId,
    current_user: User,
) -> tuple[str, bytes]:
    menu = await get_weekly_menu(menu_id, current_user)
    try:
        content = await asyncio.to_thread(build_export_workbook, [menu])
    except XlsxMenuError as exc:
        raise MenuImportError(str(exc)) from exc
    return _export_filename(menu), content


async def export_many_weekly_menu_workbooks(
    menu_ids: list[PydanticObjectId],
    current_user: User,
) -> tuple[str, bytes]:
    if len(menu_ids) > 4:
        raise MenuImportError("Can export at most four weekly menus in one workbook")
    menus = [await get_weekly_menu(menu_id, current_user) for menu_id in menu_ids]
    try:
        content = await asyncio.to_thread(build_export_workbook, menus)
    except XlsxMenuError as exc:
        raise MenuImportError(str(exc)) from exc
    return "weekly-menus.xlsx", content


async def generate_weekly_menu_template_workbook() -> tuple[str, bytes]:
    try:
        content = await asyncio.to_thread(build_template_workbook, weeks=4)
    except XlsxMenuError as exc:
        raise MenuImportError(str(exc)) from exc
    return "weekly-menu-template.xlsx", content


def parse_weekly_menu_workbook(
    content: bytes,
    *,
    filename: str,
    meal_type: MealType,
    sheet_name: str | None = None,
    title: str | None = None,
) -> tuple[CreateWeeklyMenuRequest, str]:
    preview = preview_weekly_menu_workbook(
        content,
        filename=filename,
        meal_type=meal_type,
        sheet_name=sheet_name,
        title=title,
    )
    errors = [
        diagnostic
        for diagnostic in preview.diagnostics
        if diagnostic.level == MenuImportDiagnosticLevel.ERROR
    ]
    if errors:
        raise MenuImportError(_format_diagnostic_messages(errors))
    if preview.menu is None:
        raise MenuImportError("Workbook does not contain importable menu sheets")
    return preview.menu, preview.menu.source_sheet_name or preview.selected_sheet_name or ""


def preview_weekly_menu_workbook(
    content: bytes,
    *,
    filename: str,
    meal_type: MealType,
    sheet_name: str | None = None,
    title: str | None = None,
) -> ParsedWeeklyMenuPreview:
    try:
        return preview_xlsx_weekly_menu_workbook(
            content,
            filename=filename,
            meal_type=meal_type,
            sheet_name=sheet_name,
            title=title,
        )
    except XlsxMenuError as exc:
        raise MenuImportError(str(exc)) from exc


async def _preview_weekly_menu_workbook_with_references(
    content: bytes,
    *,
    filename: str,
    meal_type: MealType,
    sheet_name: str | None = None,
    title: str | None = None,
) -> ParsedWeeklyMenuPreview:
    preview = await asyncio.to_thread(
        preview_weekly_menu_workbook,
        content,
        filename=filename,
        meal_type=meal_type,
        sheet_name=sheet_name,
        title=title,
    )
    await hydrate_preview_references(preview)
    return preview


async def _to_daily_menus(data: list[DailyMenuPayload]) -> list[DailyMenu]:
    days = [
        DailyMenu(
            weekday=day.weekday,
            date=day.date,
            items=sorted(
                [_to_daily_menu_item(item) for item in day.items],
                key=lambda item: item.position,
            ),
            notes=day.notes,
        )
        for day in data
    ]
    try:
        await resolve_menu_item_references(
            [item for day in days for item in day.items]
        )
    except MenuReferenceError as exc:
        raise MenuValidationError(str(exc)) from exc

    return sorted(days, key=lambda day: list(Weekday).index(day.weekday))


def _to_daily_menu_item(data: DailyMenuItemPayload) -> DailyMenuItem:
    return DailyMenuItem(
        id=data.id or PydanticObjectId(),
        position=data.position,
        kind=data.kind,
        source_text=data.source_text,
        recipe_card_number=data.recipe_card_number,
        dish_card_id=data.dish_card_id,
        dish_card_version_id=data.dish_card_version_id,
        product_ingredient_id=data.product_ingredient_id,
        product_name_snapshot=data.product_name_snapshot,
        name=data.name,
        allergen_codes=data.allergen_codes,
        portions=[_to_menu_portion(portion) for portion in data.portions],
        servings=[_to_serving_count(serving) for serving in data.servings],
        notes=data.notes,
    )


def _to_menu_portion(data: MenuPortionPayload) -> MenuPortion:
    return MenuPortion(
        age_group=data.age_group,
        yield_amount=data.yield_amount,
        dish_card_portion_variant_id=data.dish_card_portion_variant_id,
        nutrition=MenuNutrition(**data.nutrition.model_dump()),
    )


def _to_serving_count(data: MenuItemServingCountPayload) -> MenuItemServingCount:
    return MenuItemServingCount(
        school_group_id=data.school_group_id,
        age_group=data.age_group,
        children_count=data.children_count,
    )


async def _authorize_menu_access(menu: WeeklyMenu, current_user: User) -> None:
    if current_user.role == UserRole.OWNER:
        return

    if current_user.role == UserRole.TECHNOLOGIST:
        await _ensure_menu_permission(current_user)
        return

    if current_user.role == UserRole.ADMIN:
        await _ensure_menu_permission(current_user)

        if menu.school_id is None:
            if menu.created_by == current_user.id:
                return
            raise MenuAccessDeniedError("Menu access denied")

        await _ensure_admin_school_access(current_user, menu.school_id)
        return

    if menu.school_id != current_user.school_id:
        raise MenuAccessDeniedError("School access denied")
    if menu.status == WeeklyMenuStatus.REVOKED:
        raise MenuAccessDeniedError("Weekly menu is revoked")
    if menu.status == WeeklyMenuStatus.ARCHIVED:
        raise MenuAccessDeniedError("Menu access denied")


async def _get_active_school(school_id: PydanticObjectId) -> School:
    school = await School.get(school_id)
    if school is None:
        raise MenuValidationError("School not found")
    if not school.is_active:
        raise MenuValidationError("School is inactive")
    return school


async def _get_active_school_for_user(
    school_id: PydanticObjectId,
    current_user: User,
) -> School:
    school = await _get_active_school(school_id)

    if current_user.role == UserRole.ADMIN and school.admin_owner_id != current_user.id:
        raise MenuAccessDeniedError("School access denied")

    return school


async def _get_publish_target_schools(
    school_ids: list[PydanticObjectId] | None,
    current_user: User,
) -> list[School]:
    if school_ids is None:
        if current_user.role == UserRole.ADMIN:
            return (
                await School.find(
                    School.is_active == True,  # noqa: E712
                    School.admin_owner_id == current_user.id,
                )
                .sort("name")
                .to_list()
            )

        return await School.find(School.is_active == True).sort("name").to_list()  # noqa: E712

    unique_school_ids = list(dict.fromkeys(school_ids))
    schools = await School.find({"_id": {"$in": unique_school_ids}}).to_list()
    schools_by_id = {school.id: school for school in schools}

    ordered_schools: list[School] = []
    for school_id in unique_school_ids:
        school = schools_by_id.get(school_id)
        if school is None:
            raise MenuValidationError("School not found")
        if not school.is_active:
            raise MenuValidationError("School is inactive")
        if current_user.role == UserRole.ADMIN and school.admin_owner_id != current_user.id:
            raise MenuAccessDeniedError("School access denied")
        ordered_schools.append(school)
    return ordered_schools


async def _ensure_menu_permission(current_user: User) -> None:
    if not await user_has_permissions(current_user, AdminPermission.MENUS_MANAGE):
        raise MenuAccessDeniedError("Insufficient permissions")


async def _ensure_admin_school_access(
    current_user: User,
    school_id: PydanticObjectId,
) -> None:
    school = await School.get(school_id)

    if school is None:
        raise MenuValidationError("School not found")
    if current_user.role == UserRole.ADMIN and school.admin_owner_id != current_user.id:
        raise MenuAccessDeniedError("School access denied")


async def _get_admin_school_ids(current_user: User) -> list[PydanticObjectId]:
    schools = await School.find(School.admin_owner_id == current_user.id).to_list()
    return [school.id for school in schools if school.id is not None]


def _ensure_change_request_access(current_user: User) -> None:
    if current_user.role not in {UserRole.OWNER, UserRole.TECHNOLOGIST}:
        raise MenuAccessDeniedError("Only owner or technologist can review menu changes")


def _build_menu_change_request(
    menu: WeeklyMenu,
    current_user: User,
    changes: list[MenuFieldChange],
) -> MenuChangeRequest:
    if menu.id is None or menu.school_id is None or current_user.id is None:
        raise RuntimeError("Persisted menu and school user are required")

    return MenuChangeRequest(
        menu_id=menu.id,
        source_menu_id=menu.source_menu_id,
        school_id=menu.school_id,
        submitted_by=current_user.id,
        menu_title=menu.title,
        meal_type=menu.meal_type,
        cycle_week=menu.cycle_week,
        starts_on=menu.starts_on,
        ends_on=menu.ends_on,
        days_snapshot=deepcopy(menu.days),
        changes=changes,
    )


def _collect_school_dish_changes(
    previous_days: list[DailyMenu],
    updated_days: list[DailyMenu],
) -> list[MenuFieldChange]:
    previous_items = {(day.weekday, item.id): item for day in previous_days for item in day.items}
    changes: list[MenuFieldChange] = []
    compared_fields = (
        "kind",
        "source_text",
        "recipe_card_number",
        "dish_card_id",
        "dish_card_version_id",
        "product_ingredient_id",
        "product_name_snapshot",
        "name",
        "allergen_codes",
        "portions",
        "notes",
    )

    for day in updated_days:
        for item in day.items:
            previous_item = previous_items.get((day.weekday, item.id))
            if previous_item is None:
                continue

            previous_data = previous_item.model_dump(mode="json")
            updated_data = item.model_dump(mode="json")
            for field in compared_fields:
                before_value = previous_data.get(field)
                after_value = updated_data.get(field)
                if before_value == after_value:
                    continue
                changes.append(
                    MenuFieldChange(
                        weekday=day.weekday,
                        item_id=item.id,
                        position=item.position,
                        field=field,
                        before_value=before_value,
                        after_value=after_value,
                    )
                )

    return changes


def _ensure_school_menu_shape_is_stable(
    current_menu: WeeklyMenu,
    new_days: list[DailyMenuPayload],
) -> None:
    current_days = {day.weekday: day for day in current_menu.days}
    submitted_days = {day.weekday: day for day in new_days}

    if current_days.keys() != submitted_days.keys():
        raise MenuValidationError("School users cannot add or remove menu days")

    for weekday, current_day in current_days.items():
        submitted_day = submitted_days[weekday]
        if submitted_day.date != current_day.date or submitted_day.notes != current_day.notes:
            raise MenuValidationError("School users cannot change day metadata")

        current_shape = sorted((item.id, item.position) for item in current_day.items)
        submitted_shape = sorted(
            (item.id, item.position) for item in submitted_day.items if item.id is not None
        )
        if len(submitted_day.items) != len(current_day.items):
            raise MenuValidationError(
                "School users cannot change the number of dishes in a day",
            )
        if len(submitted_shape) != len(submitted_day.items) or current_shape != submitted_shape:
            raise MenuValidationError(
                "School users cannot add, remove, or reorder dishes",
            )


def _ensure_closed_days_are_unchanged(
    current_days: list[DailyMenu],
    submitted_days: list[DailyMenu],
) -> None:
    submitted_by_weekday = {day.weekday: day for day in submitted_days}
    for current_day in current_days:
        if current_day.closed_at is None:
            continue

        submitted_day = submitted_by_weekday.get(current_day.weekday)
        if submitted_day is None:
            raise MenuValidationError("Closed daily menus cannot be changed")
        if _day_content_dump(current_day) != _day_content_dump(submitted_day):
            raise MenuValidationError("Closed daily menus cannot be changed")


def _copy_day_close_metadata(
    current_days: list[DailyMenu],
    submitted_days: list[DailyMenu],
) -> None:
    current_by_weekday = {day.weekday: day for day in current_days}
    for submitted_day in submitted_days:
        current_day = current_by_weekday.get(submitted_day.weekday)
        if current_day is None:
            continue
        submitted_day.closed_at = current_day.closed_at
        submitted_day.closed_by = current_day.closed_by
        submitted_day.close_reason = current_day.close_reason
        submitted_day.dev_reopened_at = current_day.dev_reopened_at


def _day_content_dump(day: DailyMenu) -> dict[str, Any]:
    data = day.model_dump(mode="json")
    data.pop("closed_at", None)
    data.pop("closed_by", None)
    data.pop("close_reason", None)
    data.pop("dev_reopened_at", None)
    return data


async def _ensure_school_servings_belong_to_school(
    school_id: PydanticObjectId | None,
    days: list[DailyMenuPayload],
) -> None:
    if school_id is None:
        raise MenuValidationError("School menu must belong to a school")

    school = await School.get(school_id)
    if school is None:
        raise MenuValidationError("School not found")
    groups_by_id = {group.id: group for group in school.groups}

    for day in days:
        for item in day.items:
            for serving in item.servings:
                group = groups_by_id.get(serving.school_group_id)
                if group is None:
                    raise MenuValidationError("School group not found")
                if serving.age_group != group.age_group:
                    raise MenuValidationError("School group age group does not match")


async def _close_weekly_menu_day(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: User,
    *,
    reason: DayCloseReason,
    require_requirement: bool,
) -> WeeklyMenu:
    if current_user.role != UserRole.SCHOOL_USER:
        raise MenuAccessDeniedError("Only schools can close their daily menus")
    if current_user.id is None:
        raise MenuAccessDeniedError("Current user is not persisted")

    menu = await WeeklyMenu.get(menu_id)
    if menu is None:
        raise MenuNotFoundError("Weekly menu not found")
    if menu.school_id != current_user.school_id:
        raise MenuAccessDeniedError("School access denied")
    if menu.status != WeeklyMenuStatus.PUBLISHED:
        raise MenuAccessDeniedError("Menu access denied")

    day = next((candidate for candidate in menu.days if candidate.weekday == weekday), None)
    if day is None:
        raise MenuNotFoundError("Daily menu not found")
    if day.closed_at is not None:
        return menu

    service_date = resolve_service_date(menu, day, _today_in_school_timezone())
    try:
        await generate_menu_requirements(
            menu.id,
            weekday,
            service_date,
            current_user,
            allow_closed_day=True,
        )
    except MenuRequirementValidationError as exc:
        if require_requirement:
            raise MenuValidationError(str(exc)) from exc

    now = datetime.now(UTC)
    day.closed_at = now
    day.closed_by = current_user.id
    day.close_reason = reason
    day.dev_reopened_at = None
    menu.updated_by = current_user.id
    menu.updated_at = now
    await menu.save()
    return menu


async def _auto_close_due_days(
    current_user: User,
    menus: list[WeeklyMenu],
) -> int:
    if current_user.role != UserRole.SCHOOL_USER:
        return 0

    now = datetime.now(SCHOOL_TIMEZONE)
    today = now.date()
    is_after_close_time = now.hour >= DAY_AUTO_CLOSE_HOUR
    closed_days = 0

    for menu in menus:
        if menu.id is None or menu.status != WeeklyMenuStatus.PUBLISHED:
            continue
        for day in menu.days:
            if day.closed_at is not None:
                continue
            service_date = _resolve_auto_close_service_date(menu, day, today)
            if service_date is None:
                continue
            if service_date > today:
                continue
            if service_date == today and not is_after_close_time:
                continue
            await _close_weekly_menu_day(
                menu.id,
                day.weekday,
                current_user,
                reason=DayCloseReason.AUTOMATIC,
                require_requirement=False,
            )
            closed_days += 1

    return closed_days


def _resolve_auto_close_service_date(
    menu: WeeklyMenu,
    day: DailyMenu,
    today: Date,
) -> Date | None:
    if day.dev_reopened_at is not None:
        return None

    if day.date is not None or menu.starts_on is not None:
        return resolve_service_date(menu, day, today)

    today_weekday = list(Weekday)[today.weekday()]
    if day.weekday != today_weekday:
        return None
    return today


def _today_in_school_timezone() -> Date:
    return datetime.now(SCHOOL_TIMEZONE).date()


def _build_import_preview_response(
    *,
    preview_id: PydanticObjectId,
    filename: str,
    preview: ParsedWeeklyMenuPreview,
    expires_at: datetime,
) -> WeeklyMenuImportPreviewResponse:
    return WeeklyMenuImportPreviewResponse(
        preview_id=preview_id,
        filename=filename,
        available_sheet_names=preview.available_sheet_names,
        selected_sheet_name=preview.selected_sheet_name,
        parsed_sheet_names=preview.parsed_sheet_names,
        diagnostics=[
            WeeklyMenuImportDiagnosticResponse.from_diagnostic(diagnostic)
            for diagnostic in preview.diagnostics
        ],
        commit_ready=preview.commit_ready,
        expires_at=expires_at,
        menu=preview.menu,
        menus=[
            WeeklyMenuImportPreviewItemResponse(
                sheet_name=preview_item.sheet_name,
                menu=preview_item.menu,
            )
            for preview_item in preview.menus
        ],
    )


def _format_diagnostic_messages(diagnostics: list[MenuImportDiagnostic]) -> str:
    formatted: list[str] = []
    for diagnostic in diagnostics:
        location = ""
        if diagnostic.sheet_name and diagnostic.cell:
            location = f" ({diagnostic.sheet_name}!{diagnostic.cell})"
        elif diagnostic.row_number is not None:
            location = f" (row {diagnostic.row_number})"
        formatted.append(f"{diagnostic.message}{location}")
    return "; ".join(formatted)


def _export_filename(menu: WeeklyMenu) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", menu.title.strip()).strip("-")
    if not slug:
        slug = f"weekly-menu-{menu.id}"
    return f"{slug}.xlsx"
