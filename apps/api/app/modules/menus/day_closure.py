import logging
from datetime import UTC, datetime, timedelta
from datetime import date as Date
from zoneinfo import ZoneInfo

from beanie import PydanticObjectId

from app.modules.auth.service import user_has_permissions
from app.modules.identity.models import AdminPermission, School, User, UserRole
from app.modules.menu_requirements.service import (
    MenuRequirementValidationError,
    generate_menu_requirements,
    resolve_service_date,
)
from app.modules.menus.errors import (
    MenuAccessDeniedError,
    MenuNotFoundError,
    MenuValidationError,
)
from app.modules.menus.models import (
    DailyMenu,
    DayCloseReason,
    Weekday,
    WeeklyMenu,
    WeeklyMenuStatus,
)

DAY_AUTO_CLOSE_HOUR = 18
SCHOOL_TIMEZONE = ZoneInfo("Europe/Kyiv")
logger = logging.getLogger(__name__)


async def close_weekly_menu_day(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: User,
) -> WeeklyMenu:
    menu, _ = await _close_weekly_menu_day(
        menu_id,
        weekday,
        current_user,
        reason=DayCloseReason.MANUAL,
        require_requirement=True,
    )
    return menu


async def close_due_weekly_menu_days(current_user: User) -> int:
    if current_user.role != UserRole.SCHOOL_USER or current_user.school_id is None:
        raise MenuAccessDeniedError("Only schools can close due daily menus")

    menus = await WeeklyMenu.find(
        WeeklyMenu.school_id == current_user.school_id,
        WeeklyMenu.status == WeeklyMenuStatus.PUBLISHED,
    ).to_list()
    return await _auto_close_due_days(current_user, menus)


async def close_all_due_weekly_menu_days() -> tuple[int, int]:
    active_school_ids = {
        school.id
        for school in await School.find({"is_active": True}).to_list()
        if school.id is not None
    }
    school_users = (
        await User.find(
            {
                "role": UserRole.SCHOOL_USER.value,
                "is_active": True,
                "school_id": {"$in": list(active_school_ids)},
            }
        )
        .sort("+created_at")
        .to_list()
    )
    actor_by_school: dict[PydanticObjectId, User] = {}
    for user in school_users:
        if user.school_id is not None and user.id is not None:
            actor_by_school.setdefault(user.school_id, user)
    menus = await WeeklyMenu.find(
        {
            "school_id": {"$in": list(active_school_ids)},
            "status": WeeklyMenuStatus.PUBLISHED.value,
            "days.closed_at": None,
        }
    ).to_list()

    closed_days = 0
    failed_menus = 0
    for menu in menus:
        actor = actor_by_school.get(menu.school_id)
        if actor is None:
            failed_menus += 1
            logger.error("Cannot auto-close weekly menu %s: no active school user", menu.id)
            continue
        try:
            closed_days += await _auto_close_due_days(actor, [menu])
        except Exception:
            failed_menus += 1
            logger.exception("Failed to auto-close due days for weekly menu %s", menu.id)
    return closed_days, failed_menus


async def list_current_week_closed_days(
    school_id: PydanticObjectId,
    current_user: User,
) -> tuple[Date, Date, list[tuple[WeeklyMenu, DailyMenu, Date]]]:
    await _ensure_day_reopen_permission(current_user)
    await _ensure_day_reopen_school_access(current_user, school_id)

    today = _today_in_school_timezone()
    week_starts_on, week_ends_on = _current_school_workweek(today)

    menus = await WeeklyMenu.find(
        WeeklyMenu.school_id == school_id, WeeklyMenu.status == WeeklyMenuStatus.PUBLISHED
    ).to_list()

    closed_days: list[tuple[WeeklyMenu, DailyMenu, Date]] = []

    for menu in menus:
        for day in menu.days:
            if day.closed_at is None:
                continue

            service_date = _known_service_date(menu, day)
            if service_date is None:
                continue
            if not week_starts_on <= service_date <= week_ends_on:
                continue

            closed_days.append((menu, day, service_date))

    closed_days.sort(key=lambda item: (item[2], item[0].meal_type.value, item[0].title.casefold()))

    return week_starts_on, week_ends_on, closed_days


async def reopen_weekly_menu_day(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: User,
) -> WeeklyMenu:
    await _ensure_day_reopen_permission(current_user)

    menu = await WeeklyMenu.get(menu_id)
    if menu is None:
        raise MenuNotFoundError("Weekly menu not found")
    if menu.school_id is None:
        raise MenuValidationError("Only school menu copies can be reopened")
    if menu.status != WeeklyMenuStatus.PUBLISHED:
        raise MenuValidationError("Only published school menus can be reopened")

    await _ensure_day_reopen_school_access(current_user, menu.school_id)

    day = next((candidate for candidate in menu.days if candidate.weekday == weekday), None)
    if day is None:
        raise MenuNotFoundError("Daily menu not found")

    service_date = _known_service_date(menu, day)
    if service_date is None:
        raise MenuValidationError("Daily menu date is required to reopen it")

    today = _today_in_school_timezone()
    week_starts_on, week_end_on = _current_school_workweek(today)

    if not week_starts_on <= service_date <= week_end_on:
        raise MenuValidationError("Only current-week daily menus can be reopened")

    if day.closed_at is None:
        return menu

    now = datetime.now(UTC)
    result = await WeeklyMenu.get_pymongo_collection().update_one(
        {
            "_id": menu.id,
            "school_id": menu.school_id,
            "status": WeeklyMenuStatus.PUBLISHED.value,
            "days": {
                "$elemMatch": {
                    "weekday": weekday.value,
                    "closed_at": {"$ne": None},
                }
            },
        },
        {
            "$set": {
                "days.$.closed_at": None,
                "days.$.closed_by": None,
                "days.$.close_reason": None,
                "days.$.close_notification_pending": False,
                "days.$.close_notification_sent_at": None,
                "days.$.reopened_at": now,
                "days.$.reopened_by": current_user.id,
                "updated_by": current_user.id,
                "updated_at": now,
            },
            "$inc": {"revision": 1},
        },
    )

    updated_menu = await WeeklyMenu.get(menu_id)
    if updated_menu is None:
        raise MenuNotFoundError("Weekly menu not found")

    if result.modified_count == 0:
        updated_day = next(
            (candidate for candidate in updated_menu.days if candidate.weekday == weekday), None
        )

        if updated_day is None:
            raise MenuNotFoundError("Daily menu not found")
        if updated_day.closed_at is not None:
            raise MenuValidationError("Daily menu could not be reopened")

    return updated_menu


async def _close_weekly_menu_day(
    menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: User,
    *,
    reason: DayCloseReason,
    require_requirement: bool,
) -> tuple[WeeklyMenu, bool]:
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
        return menu, False

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
    result = await WeeklyMenu.get_pymongo_collection().update_one(
        {
            "_id": menu.id,
            "school_id": current_user.school_id,
            "status": WeeklyMenuStatus.PUBLISHED.value,
            "days": {
                "$elemMatch": {
                    "weekday": weekday.value,
                    "closed_at": None,
                }
            },
        },
        {
            "$set": {
                "days.$.closed_at": now,
                "days.$.closed_by": current_user.id,
                "days.$.close_reason": reason.value,
                "days.$.close_notification_pending": True,
                "days.$.close_notification_sent_at": None,
                "days.$.reopened_at": None,
                "days.$.reopened_by": None,
                "updated_by": current_user.id,
                "updated_at": now,
            },
            "$inc": {"revision": 1},
        },
    )
    updated_menu = await WeeklyMenu.get(menu_id)
    if updated_menu is None:
        raise MenuNotFoundError("Weekly menu not found")
    return updated_menu, result.modified_count == 1


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
            _, was_closed = await _close_weekly_menu_day(
                menu.id,
                day.weekday,
                current_user,
                reason=DayCloseReason.AUTOMATIC,
                require_requirement=False,
            )
            closed_days += int(was_closed)

    return closed_days


def _resolve_auto_close_service_date(
    menu: WeeklyMenu,
    day: DailyMenu,
    today: Date,
) -> Date | None:
    if day.reopened_at is not None:
        return None

    if day.date is not None or menu.starts_on is not None:
        return resolve_service_date(menu, day, today)

    today_weekday = list(Weekday)[today.weekday()]
    if day.weekday != today_weekday:
        return None
    return today


def _today_in_school_timezone() -> Date:
    return datetime.now(SCHOOL_TIMEZONE).date()


def _current_school_workweek(today: Date) -> tuple[Date, Date]:
    monday = today - timedelta(today.weekday())
    friday = monday + timedelta(days=4)
    return monday, friday


def _known_service_date(menu: WeeklyMenu, day: DailyMenu) -> Date | None:
    if day.date is not None:
        return day.date
    if menu.starts_on is not None:
        return resolve_service_date(menu, day, menu.starts_on)
    return None


async def _ensure_day_reopen_permission(current_user: User) -> None:
    if current_user.role not in {UserRole.OWNER, UserRole.ADMIN}:
        raise MenuAccessDeniedError("Only administrators can reopen daily menus")
    if not await user_has_permissions(current_user, AdminPermission.MENUS_MANAGE):
        raise MenuAccessDeniedError("Insufficient permissions")
    if current_user.id is None:
        raise MenuAccessDeniedError("Current user is not persisted")


async def _ensure_day_reopen_school_access(
    current_user: User, school_id: PydanticObjectId
) -> School:
    school = await School.get(school_id)

    if school is None:
        raise MenuValidationError("School not found")
    if not school.is_active:
        raise MenuValidationError("School is inactive")
    if current_user.role == UserRole.ADMIN and school.admin_owner_id != current_user.id:
        raise MenuAccessDeniedError("School access denied")

    return school
