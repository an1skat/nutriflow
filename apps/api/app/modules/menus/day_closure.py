import logging
from datetime import UTC, datetime
from datetime import date as Date
from zoneinfo import ZoneInfo

from beanie import PydanticObjectId

from app.modules.identity.models import School, User, UserRole
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
    school_users = await User.find(
        {
            "role": UserRole.SCHOOL_USER.value,
            "is_active": True,
            "school_id": {"$in": list(active_school_ids)},
        }
    ).sort("+created_at").to_list()
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
    day.close_notification_pending = False
    day.close_notification_sent_at = None
    day.dev_reopened_at = now
    menu.updated_by = current_user.id
    menu.updated_at = now
    menu.revision += 1
    await menu.save()
    return menu


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
                "days.$.dev_reopened_at": None,
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
