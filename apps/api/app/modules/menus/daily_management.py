from collections import defaultdict

from beanie import PydanticObjectId

from app.modules.admin.schemas import SchoolGroupResponse
from app.modules.identity.models import School, User, UserRole
from app.modules.menu_requirements.models import MenuRequirement
from app.modules.menu_requirements.service import MenuRequirementRecord, _generate_requirements
from app.modules.menu_requirements.utils import hash_daily_menu, select_eligible_groups
from app.modules.menus import day_closure
from app.modules.menus.day_closure import (
    _ensure_day_reopen_permission,
    _ensure_day_reopen_school_access,
    _known_service_date,
)
from app.modules.menus.errors import MenuNotFoundError, MenuValidationError
from app.modules.menus.models import Weekday, WeeklyMenu, WeeklyMenuStatus
from app.modules.menus.schemas import MonthDailyMenuResponse, MonthDailyMenusResponse


async def list_daily_menu_schools(current_user: User) -> list[School]:
    await _ensure_day_reopen_permission(current_user)
    filters: dict[str, object] = {"is_active": True}
    if current_user.role == UserRole.ADMIN:
        filters["admin_owner_id"] = current_user.id
    return await School.find(filters).sort("+name").to_list()


async def list_month_daily_menus(
    school_id: PydanticObjectId, year: int, month: int, current_user: User
) -> MonthDailyMenusResponse:
    await _ensure_day_reopen_permission(current_user)
    school = await _ensure_day_reopen_school_access(current_user, school_id)
    if not 2000 <= year <= 2100 or not 1 <= month <= 12:
        raise MenuValidationError("Invalid calendar month")
    menus = await WeeklyMenu.find(
        WeeklyMenu.school_id == school_id, WeeklyMenu.status == WeeklyMenuStatus.PUBLISHED
    ).to_list()
    requirements = await MenuRequirement.find(MenuRequirement.school_id == school_id).to_list()
    requirements_by_day: dict[tuple[PydanticObjectId, Weekday], list[MenuRequirement]] = (
        defaultdict(list)
    )
    for requirement in requirements:
        requirements_by_day[(requirement.weekly_menu_id, requirement.weekday)].append(requirement)
    groups = {group.id: group for group in school.groups}
    items: list[MonthDailyMenuResponse] = []
    for menu in menus:
        for day in menu.days:
            service_date = _known_service_date(menu, day)
            if service_date is None or (service_date.year, service_date.month) != (year, month):
                continue
            existing = requirements_by_day[(menu.id, day.weekday)]
            day_hash = hash_daily_menu(day)
            expected_ids = {group.id for group in select_eligible_groups(day, groups)}
            if existing:
                stale = {r.school_group_id for r in existing} != expected_ids or any(
                    r.source_day_hash != day_hash or r.service_date != service_date
                    for r in existing
                )
            else:
                stale = bool(expected_ids) or (
                    day.requirements_generated_hash is not None
                    and day.requirements_generated_hash != day_hash
                )
            items.append(
                MonthDailyMenuResponse(
                    menu_id=menu.id,
                    menu_title=menu.title,
                    meal_type=menu.meal_type,
                    weekday=day.weekday,
                    date=service_date,
                    closed_at=day.closed_at,
                    reopened_at=day.reopened_at,
                    revision=menu.revision,
                    requirement_stale=stale,
                )
            )
    items.sort(key=lambda item: (item.date, item.meal_type, item.menu_title))
    return MonthDailyMenusResponse(
        school_id=school_id,
        year=year,
        month=month,
        today=day_closure._today_in_school_timezone(),
        groups=[
            SchoolGroupResponse.from_group(group, school_id=school_id) for group in school.groups
        ],
        items=items,
    )


async def regenerate_daily_requirements(
    school_id: PydanticObjectId,
    menu_id: PydanticObjectId,
    weekday: Weekday,
    revision: int,
    current_user: User,
) -> list[MenuRequirementRecord]:
    await _ensure_day_reopen_permission(current_user)
    school = await _ensure_day_reopen_school_access(current_user, school_id)
    menu = await WeeklyMenu.get(menu_id)
    if menu is None:
        raise MenuNotFoundError("Weekly menu not found")
    if menu.school_id != school.id or menu.status != WeeklyMenuStatus.PUBLISHED:
        raise MenuValidationError("Published school menu required")
    if menu.revision != revision:
        raise MenuValidationError("Weekly menu was changed by another user")
    days = [day for day in menu.days if day.weekday == weekday]
    if len(days) != 1:
        raise MenuNotFoundError("Daily menu not found")
    day = days[0]
    if day.closed_at is not None:
        raise MenuValidationError("Daily menu is closed")
    service_date = _known_service_date(menu, day)
    today = day_closure._today_in_school_timezone()
    if service_date is None or (service_date.year, service_date.month) != (today.year, today.month):
        raise MenuValidationError("Only current-month daily menus can be edited")
    return await _generate_requirements(
        menu, day, school, service_date, current_user, allow_empty=True
    )
