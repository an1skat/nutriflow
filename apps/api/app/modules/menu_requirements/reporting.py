from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import date as Date
from datetime import timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from beanie import PydanticObjectId

from app.modules.identity.models import (
    COMMUNITY_LABELS,
    AgeGroup,
    Community,
    School,
    SchoolGroup,
    User,
    UserRole,
)
from app.modules.menu_requirements.access import (
    can_access_school,
    get_accessible_community_schools,
    list_accessible_communities,
)
from app.modules.menu_requirements.errors import (
    MenuRequirementAccessDeniedError,
    MenuRequirementNotFoundError,
    MenuRequirementRangeIncompleteError,
    MenuRequirementValidationError,
)
from app.modules.menu_requirements.models import MenuRequirement, MenuRequirementDish
from app.modules.menu_requirements.schemas import (
    CommunityMenuRequirementCalendarResponse,
    CommunityMenuRequirementReportResponse,
    MenuRequirementAggregateStatus,
    MenuRequirementCalendarDayResponse,
    MenuRequirementCalendarMonthResponse,
    MenuRequirementCalendarResponse,
    MenuRequirementCalendarWeekResponse,
    MenuRequirementCommunityResponse,
    MenuRequirementDishKeyReliability,
    MenuRequirementReportBreakdownItemResponse,
    MenuRequirementReportCellResponse,
    MenuRequirementReportDishResponse,
    MenuRequirementReportGranularity,
    MenuRequirementReportGroupResponse,
    MenuRequirementReportIngredientRowResponse,
    MenuRequirementReportResponse,
)
from app.modules.menu_requirements.utils import hash_daily_menu, select_eligible_groups
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MealType,
    MenuItemKind,
    Weekday,
    WeeklyMenu,
    WeeklyMenuStatus,
)
from app.modules.recipe.models import normalize_lookup_text

MAX_REPORT_RANGE_DAYS = 45
CALENDAR_WEEK_SPILLOVER_DAYS = 4
AGGREGATE_REPORT_GRANULARITIES = frozenset(
    {
        MenuRequirementReportGranularity.WEEK,
        MenuRequirementReportGranularity.MONTH,
        MenuRequirementReportGranularity.RANGE,
    }
)


@dataclass(frozen=True)
class AggregateDishKey:
    key: str
    reliability: MenuRequirementDishKeyReliability


@dataclass(frozen=True)
class ExpectedMenuDay:
    school_id: PydanticObjectId
    service_date: Date
    weekly_menu_id: PydanticObjectId
    weekday: Weekday
    meal_type: MealType
    menu_title: str
    day: DailyMenu


@dataclass(frozen=True)
class RequirementKey:
    service_date: Date
    school_id: PydanticObjectId
    weekly_menu_id: PydanticObjectId
    weekday: Weekday
    school_group_id: PydanticObjectId


async def get_menu_requirement_calendar(
    school_id: PydanticObjectId,
    year: int,
    current_user: User,
    *,
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> MenuRequirementCalendarResponse:
    school = await _get_accessible_school(current_user, school_id)
    _ensure_school_group_exists(school, school_group_id)

    year_date_from = Date(year, 1, 1)
    year_date_to = Date(year, 12, 31)
    date_from = year_date_from - timedelta(days=CALENDAR_WEEK_SPILLOVER_DAYS)
    date_to = year_date_to + timedelta(days=CALENDAR_WEEK_SPILLOVER_DAYS)
    school_ids = [school_id]
    expected_days = await _expected_menu_days(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    requirements = await _find_requirements_for_report(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    requirement_statuses = await _requirement_statuses(requirements)

    groups_by_school_id = {school.id: {group.id: group for group in school.groups}}
    day_summaries, _missing_requirement_keys = _build_scope_day_summaries(
        expected_days,
        requirements,
        requirement_statuses=requirement_statuses,
        groups_by_school_id=groups_by_school_id,
        school_group_id=school_group_id,
    )

    expected_dates = set(expected_days)
    generated_dates = {requirement.service_date for requirement in requirements}
    stale_dates = {
        requirement.service_date
        for requirement in requirements
        if requirement_statuses.get(requirement.id) == MenuRequirementAggregateStatus.STALE
    }

    months = [
        _build_calendar_month(
            year,
            month,
            expected_dates=expected_dates,
            generated_dates=generated_dates,
            stale_dates=stale_dates,
            day_summaries=day_summaries,
        )
        for month in range(1, 13)
    ]
    return MenuRequirementCalendarResponse(
        school_id=school.id,
        school_name=school.name,
        year=year,
        months=months,
    )


async def get_community_menu_requirement_calendar(
    community: Community,
    year: int,
    current_user: User,
    *,
    meal_type: MealType | None = None,
) -> CommunityMenuRequirementCalendarResponse:
    schools = await get_accessible_community_schools(current_user, community)
    school_ids = [school.id for school in schools]
    groups_by_school_id = {
        school.id: {group.id: group for group in school.groups}
        for school in schools
    }

    year_date_from = Date(year, 1, 1)
    year_date_to = Date(year, 12, 31)
    date_from = year_date_from - timedelta(days=CALENDAR_WEEK_SPILLOVER_DAYS)
    date_to = year_date_to + timedelta(days=CALENDAR_WEEK_SPILLOVER_DAYS)

    expected_days = await _expected_menu_days(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
    )
    requirements = await _find_requirements_for_report(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
    )
    requirement_statuses = await _requirement_statuses(requirements)

    day_summaries, _missing_requirement_keys = _build_scope_day_summaries(
        expected_days,
        requirements,
        requirement_statuses=requirement_statuses,
        groups_by_school_id=groups_by_school_id,
    )

    expected_dates = set(expected_days)
    generated_dates = {
        requirement.service_date
        for requirement in requirements
    }
    stale_dates = {
        requirement.service_date
        for requirement in requirements
        if (
            requirement_statuses.get(requirement.id)
            == MenuRequirementAggregateStatus.STALE
        )
    }

    months = [
        _build_calendar_month(
            year,
            month,
            expected_dates=expected_dates,
            generated_dates=generated_dates,
            stale_dates=stale_dates,
            day_summaries=day_summaries,
        )
        for month in range(1, 13)
    ]

    return CommunityMenuRequirementCalendarResponse(
        community=community,
        community_name=COMMUNITY_LABELS[community],
        school_count=len(schools),
        year=year,
        months=months,
    )


async def get_menu_requirement_report(
    school_id: PydanticObjectId,
    date_from: Date,
    date_to: Date,
    granularity: MenuRequirementReportGranularity,
    current_user: User,
    *,
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> MenuRequirementReportResponse:
    _validate_report_range(date_from, date_to, granularity)

    school = await _get_accessible_school(current_user, school_id)
    _ensure_school_group_exists(school, school_group_id)

    school_ids = [school.id]
    schools_by_id = {school.id: school}
    groups_by_id = {group.id: group for group in school.groups}
    groups_by_school_id = {school.id: groups_by_id}

    expected_days = await _expected_menu_days(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    requirements = await _find_requirements_for_report(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )

    if granularity in AGGREGATE_REPORT_GRANULARITIES:
        expected_days = {
            service_date: menu_days
            for service_date, menu_days in expected_days.items()
            if _is_weekday(service_date)
        }
        requirements = [
            requirement for requirement in requirements if _is_weekday(requirement.service_date)
        ]

    requirement_statuses = await _requirement_statuses(requirements)

    day_summaries, missing_requirement_keys = _build_scope_day_summaries(
        expected_days,
        requirements,
        requirement_statuses=requirement_statuses,
        groups_by_school_id=groups_by_school_id,
        school_group_id=school_group_id,
    )

    should_validate_completion = granularity == MenuRequirementReportGranularity.RANGE or (
        current_user.role != UserRole.OWNER
        and granularity
        in {
            MenuRequirementReportGranularity.WEEK,
            MenuRequirementReportGranularity.MONTH,
        }
    )

    if should_validate_completion:
        _validate_complete_aggregate_report(
            granularity,
            date_from=date_from,
            date_to=date_to,
            day_summaries=day_summaries,
        )

    missing_dates = sorted({key.service_date for key in missing_requirement_keys})
    stale_dates = sorted(
        {
            requirement.service_date
            for requirement in requirements
            if requirement_statuses.get(requirement.id) == MenuRequirementAggregateStatus.STALE
        }
    )

    groups = _build_report_groups(
        requirements,
        requirement_statuses=requirement_statuses,
        missing_requirement_keys=missing_requirement_keys,
        expected_days=expected_days,
        groups_by_id=groups_by_id,
        schools_by_id=schools_by_id,
    )

    return MenuRequirementReportResponse(
        school_id=school.id,
        school_name=school.name,
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
        meal_type=meal_type,
        school_group_id=school_group_id,
        status=_aggregate_status(
            missing_dates=missing_dates,
            stale_dates=stale_dates,
        ),
        missing_dates=missing_dates,
        stale_dates=stale_dates,
        groups=groups,
    )


async def list_menu_requirement_communities(
    current_user: User,
) -> list[MenuRequirementCommunityResponse]:
    communities = await list_accessible_communities(current_user)

    return [
        MenuRequirementCommunityResponse(
            community=community,
            community_name=COMMUNITY_LABELS[community],
            school_count=len(schools),
        )
        for community, schools in communities
    ]


async def get_community_menu_requirement_report(
    community: Community,
    date_from: Date,
    date_to: Date,
    granularity: MenuRequirementReportGranularity,
    current_user: User,
    *,
    meal_type: MealType | None = None,
) -> CommunityMenuRequirementReportResponse:
    _validate_report_range(date_from, date_to, granularity)

    schools = await get_accessible_community_schools(current_user, community)
    school_ids = [school.id for school in schools]
    schools_by_id = {school.id: school for school in schools}
    groups_by_id = {group.id: group for school in schools for group in school.groups}
    groups_by_school_id = {
        school.id: {group.id: group for group in school.groups} for school in schools
    }

    expected_days = await _expected_menu_days(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
    )
    requirements = await _find_requirements_for_report(
        school_ids,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
    )

    if granularity in AGGREGATE_REPORT_GRANULARITIES:
        expected_days = {
            service_date: items
            for service_date, items in expected_days.items()
            if _is_weekday(service_date)
        }
        requirements = [
            requirement for requirement in requirements if _is_weekday(requirement.service_date)
        ]

    statuses = await _requirement_statuses(requirements)
    day_summaries, missing_requirement_keys = _build_scope_day_summaries(
        expected_days,
        requirements,
        requirement_statuses=statuses,
        groups_by_school_id=groups_by_school_id,
    )

    should_validate = granularity == MenuRequirementReportGranularity.RANGE or (
        current_user.role != UserRole.OWNER
        and granularity
        in {
            MenuRequirementReportGranularity.WEEK,
            MenuRequirementReportGranularity.MONTH,
        }
    )
    if should_validate:
        _validate_complete_aggregate_report(
            granularity,
            date_from=date_from,
            date_to=date_to,
            day_summaries=day_summaries,
        )

    missing_dates = sorted({key.service_date for key in missing_requirement_keys})
    stale_dates = sorted(
        {
            requirement.service_date
            for requirement in requirements
            if (statuses.get(requirement.id) == MenuRequirementAggregateStatus.STALE)
        }
    )

    return CommunityMenuRequirementReportResponse(
        community=community,
        community_name=COMMUNITY_LABELS[community],
        school_count=len(schools),
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
        meal_type=meal_type,
        status=_aggregate_status(
            missing_dates=missing_dates,
            stale_dates=stale_dates,
        ),
        missing_dates=missing_dates,
        stale_dates=stale_dates,
        groups=_build_report_groups(
            requirements,
            requirement_statuses=statuses,
            missing_requirement_keys=missing_requirement_keys,
            expected_days=expected_days,
            groups_by_id=groups_by_id,
            schools_by_id=schools_by_id,
            aggregate_by_age_group=True,
        ),
    )


def _validate_report_range(
    date_from: Date,
    date_to: Date,
    granularity: MenuRequirementReportGranularity,
) -> None:
    if date_from > date_to:
        raise MenuRequirementValidationError("date_from cannot be after date_to")

    range_days = (date_to - date_from).days + 1
    if range_days > MAX_REPORT_RANGE_DAYS:
        raise MenuRequirementValidationError(
            f"Menu requirement report range cannot exceed {MAX_REPORT_RANGE_DAYS} days"
        )

    if granularity == MenuRequirementReportGranularity.RANGE and (
        date_from.year,
        date_from.month,
    ) != (date_to.year, date_to.month):
        raise MenuRequirementValidationError(
            "Custom menu requirement report range must stay within one calendar month"
        )


async def _get_accessible_school(
    current_user: User,
    school_id: PydanticObjectId,
) -> School:
    if not await can_access_school(current_user, school_id):
        raise MenuRequirementAccessDeniedError("School access denied")
    school = await School.get(school_id)
    if school is None:
        raise MenuRequirementNotFoundError("School not found")
    return school


def _ensure_school_group_exists(
    school: School,
    school_group_id: PydanticObjectId | None,
) -> None:
    if school_group_id is None:
        return
    if not any(group.id == school_group_id for group in school.groups):
        raise MenuRequirementNotFoundError("School group not found")


async def _find_requirements_for_report(
    school_ids: list[PydanticObjectId],
    *,
    date_from: Date,
    date_to: Date,
    meal_type: MealType | None,
    school_group_id: PydanticObjectId | None = None,
) -> list[MenuRequirement]:
    filters: dict[str, Any] = {
        "school_id": {"$in": school_ids},
        "service_date": {"$gte": date_from, "$lte": date_to},
    }
    if meal_type is not None:
        filters["meal_type"] = meal_type.value
    if school_group_id is not None:
        filters["school_group_id"] = school_group_id

    return await MenuRequirement.find(filters).to_list()


async def _expected_menu_days(
    school_ids: list[PydanticObjectId],
    *,
    date_from: Date,
    date_to: Date,
    meal_type: MealType | None,
    school_group_id: PydanticObjectId | None = None,
) -> dict[Date, list[ExpectedMenuDay]]:
    filters: dict[str, Any] = {
        "school_id": {"$in": school_ids},
        "status": WeeklyMenuStatus.PUBLISHED.value,
    }
    if meal_type is not None:
        filters["meal_type"] = meal_type.value

    menus = await WeeklyMenu.find(filters).to_list()
    expected: dict[Date, list[ExpectedMenuDay]] = defaultdict(list)

    for menu in menus:
        if menu.school_id is None:
            continue

        for day in menu.days:
            service_date = _menu_day_service_date(menu, day)
            if service_date is None or service_date < date_from or service_date > date_to:
                continue

            if school_group_id is not None and not _day_has_group_serving(
                day,
                school_group_id,
            ):
                continue

            expected[service_date].append(
                ExpectedMenuDay(
                    school_id=menu.school_id,
                    service_date=service_date,
                    weekly_menu_id=menu.id,
                    weekday=day.weekday,
                    meal_type=menu.meal_type,
                    menu_title=menu.title,
                    day=day,
                )
            )

    return dict(expected)


def _menu_day_service_date(menu: WeeklyMenu, day: DailyMenu) -> Date | None:
    if day.date is not None:
        return day.date
    if menu.starts_on is not None:
        return menu.starts_on + timedelta(days=list(Weekday).index(day.weekday))
    return None


def _day_has_group_serving(day: DailyMenu, school_group_id: PydanticObjectId) -> bool:
    return any(
        serving.school_group_id == school_group_id and serving.children_count > 0
        for item in day.items
        for serving in item.servings
    )


async def _requirement_statuses(
    requirements: list[MenuRequirement],
) -> dict[PydanticObjectId, MenuRequirementAggregateStatus]:
    if not requirements:
        return {}

    menu_ids = list({requirement.weekly_menu_id for requirement in requirements})
    menus = await WeeklyMenu.find({"_id": {"$in": menu_ids}}).to_list()
    menus_by_id = {menu.id: menu for menu in menus}

    statuses: dict[PydanticObjectId, MenuRequirementAggregateStatus] = {}
    for requirement in requirements:
        menu = menus_by_id.get(requirement.weekly_menu_id)
        day = (
            next(
                (candidate for candidate in menu.days if candidate.weekday == requirement.weekday),
                None,
            )
            if menu is not None
            else None
        )
        statuses[requirement.id] = (
            MenuRequirementAggregateStatus.STALE
            if day is None or hash_daily_menu(day) != requirement.source_day_hash
            else MenuRequirementAggregateStatus.COMPLETE
        )
    return statuses


def _build_calendar_month(
    year: int,
    month: int,
    *,
    expected_dates: set[Date],
    generated_dates: set[Date],
    stale_dates: set[Date],
    day_summaries: dict[Date, MenuRequirementCalendarDayResponse] | None = None,
) -> MenuRequirementCalendarMonthResponse:
    last_day = monthrange(year, month)[1]
    date_from = Date(year, month, 1)
    date_to = Date(year, month, last_day)
    month_dates = {
        date_from + timedelta(days=offset) for offset in range((date_to - date_from).days + 1)
    }
    expected = expected_dates & month_dates
    generated = generated_dates & month_dates
    stale = stale_dates & month_dates
    resolved_day_summaries = day_summaries or {}

    summary_missing_dates = {
        service_date
        for service_date, summary in resolved_day_summaries.items()
        if summary.missing_requirements > 0
    }

    missing = (
        (expected - generated) | (summary_missing_dates & month_dates)
        if generated
        else set()
    )

    weeks = []
    for index, (block_from, block_to) in enumerate(
        _month_workweek_blocks(date_from, date_to),
        start=1,
    ):
        workday_dates = {
            block_from + timedelta(days=offset)
            for offset in range((block_to - block_from).days + 1)
        }
        full_week_dates = {block_from + timedelta(days=offset) for offset in range(7)}
        weekend_activity_dates = (
            (expected_dates | generated_dates | stale_dates) & full_week_dates
        ) - workday_dates
        block_dates = workday_dates | weekend_activity_dates
        resolved_block_to = max(block_dates)
        block_expected = expected_dates & block_dates
        block_generated = generated_dates & block_dates
        block_missing = (
            (block_expected - block_generated) | (summary_missing_dates & block_dates)
            if block_generated
            else set()
        )
        block_stale = stale_dates & block_dates
        weeks.append(
            MenuRequirementCalendarWeekResponse(
                week_index=index,
                date_from=block_from,
                date_to=resolved_block_to,
                generated_days=len(block_generated),
                missing_days=len(block_missing),
                stale_days=len(block_stale),
                status=_aggregate_status(
                    missing_dates=sorted(block_missing),
                    stale_dates=sorted(block_stale),
                ),
                days=[
                    resolved_day_summaries.get(
                        service_date,
                        _empty_calendar_day(service_date),
                    )
                    for service_date in sorted(block_dates)
                ],
            )
        )

    return MenuRequirementCalendarMonthResponse(
        month=month,
        date_from=date_from,
        date_to=date_to,
        total_days=last_day,
        working_days=len(expected),
        generated_days=len(generated),
        missing_days=len(missing),
        stale_days=len(stale),
        status=_aggregate_status(
            missing_dates=sorted(missing),
            stale_dates=sorted(stale),
        ),
        weeks=weeks,
    )


def _build_scope_day_summaries(
    expected_days: dict[Date, list[ExpectedMenuDay]],
    requirements: list[MenuRequirement],
    *,
    requirement_statuses: dict[
        PydanticObjectId,
        MenuRequirementAggregateStatus,
    ],
    groups_by_school_id: dict[
        PydanticObjectId,
        dict[PydanticObjectId, SchoolGroup],
    ],
    school_group_id: PydanticObjectId | None = None,
) -> tuple[
    dict[Date, MenuRequirementCalendarDayResponse],
    set[RequirementKey],
]:
    expected_keys_by_date: dict[
        Date,
        set[RequirementKey],
    ] = defaultdict(set)
    generated_keys_by_date: dict[
        Date,
        set[RequirementKey],
    ] = defaultdict(set)
    stale_keys_by_date: dict[
        Date,
        set[RequirementKey],
    ] = defaultdict(set)

    for service_date, menu_days in expected_days.items():
        for menu_day in menu_days:
            groups_by_id = groups_by_school_id.get(
                menu_day.school_id,
                {},
            )

            for group in select_eligible_groups(
                menu_day.day,
                groups_by_id,
            ):
                if school_group_id is not None and group.id != school_group_id:
                    continue

                expected_keys_by_date[service_date].add(
                    RequirementKey(
                        service_date=service_date,
                        school_id=menu_day.school_id,
                        weekly_menu_id=menu_day.weekly_menu_id,
                        weekday=menu_day.weekday,
                        school_group_id=group.id,
                    )
                )

    for requirement in requirements:
        key = RequirementKey(
            service_date=requirement.service_date,
            school_id=requirement.school_id,
            weekly_menu_id=requirement.weekly_menu_id,
            weekday=requirement.weekday,
            school_group_id=requirement.school_group_id,
        )
        generated_keys_by_date[requirement.service_date].add(key)

        if requirement_statuses.get(requirement.id) == MenuRequirementAggregateStatus.STALE:
            stale_keys_by_date[requirement.service_date].add(key)

    summaries: dict[
        Date,
        MenuRequirementCalendarDayResponse,
    ] = {}
    missing_requirement_keys: set[RequirementKey] = set()

    all_dates = set(expected_keys_by_date) | set(generated_keys_by_date) | set(stale_keys_by_date)

    for service_date in all_dates:
        expected_keys = expected_keys_by_date[service_date]
        generated_keys = generated_keys_by_date[service_date]
        missing_keys = expected_keys - generated_keys
        stale_keys = stale_keys_by_date[service_date]

        missing_requirement_keys.update(missing_keys)

        summaries[service_date] = MenuRequirementCalendarDayResponse(
            service_date=service_date,
            expected_requirements=len(expected_keys),
            generated_requirements=len(generated_keys),
            missing_requirements=len(missing_keys),
            stale_requirements=len(stale_keys),
            status=_aggregate_status(
                missing_dates=([service_date] if missing_keys else []),
                stale_dates=([service_date] if stale_keys else []),
            ),
        )

    return summaries, missing_requirement_keys


def _is_weekday(service_date: Date) -> bool:
    return service_date.weekday() < 5


def _workdays_in_range(date_from: Date, date_to: Date) -> list[Date]:
    period_days = (date_to - date_from).days + 1
    dates = [date_from + timedelta(days=offset) for offset in range(period_days)]
    return [service_date for service_date in dates if _is_weekday(service_date)]


def _validate_complete_aggregate_report(
    granularity: MenuRequirementReportGranularity,
    *,
    date_from: Date,
    date_to: Date,
    day_summaries: dict[Date, MenuRequirementCalendarDayResponse],
) -> None:
    period_summaries = {
        service_date: summary
        for service_date, summary in day_summaries.items()
        if date_from <= service_date <= date_to and _is_weekday(service_date)
    }

    if granularity == MenuRequirementReportGranularity.RANGE:
        required_dates = _workdays_in_range(date_from, date_to)
        if not required_dates:
            raise MenuRequirementValidationError(
                "Custom menu requirement report range must include at least one weekday"
            )

        missing_dates: list[Date] = []
        stale_dates: list[Date] = []

        for service_date in required_dates:
            summary = period_summaries.get(service_date)
            if summary is None:
                missing_dates.append(service_date)
                continue

            is_missing = (
                summary.expected_requirements <= 0
                or summary.generated_requirements < summary.expected_requirements
                or summary.missing_requirements > 0
            )
            if is_missing:
                missing_dates.append(service_date)

            if summary.stale_requirements > 0:
                stale_dates.append(service_date)

        if missing_dates or stale_dates:
            raise MenuRequirementRangeIncompleteError(
                missing_dates=missing_dates,
                stale_dates=stale_dates,
            )
        return

    if granularity == MenuRequirementReportGranularity.WEEK:
        required_dates = [date_from + timedelta(days=offset) for offset in range(5)]
        is_complete = (
            date_from.weekday() == 0
            and date_from + timedelta(days=4) <= date_to <= date_from + timedelta(days=6)
            and all(
                (summary := period_summaries.get(service_date)) is not None
                and _is_complete_calendar_day(summary)
                for service_date in required_dates
            )
        )
        if not is_complete:
            raise MenuRequirementValidationError(
                "Weekly menu requirement report requires complete menu requirements "
                "for all five weekdays"
            )
        return

    if granularity == MenuRequirementReportGranularity.MONTH:
        participating_days = [
            summary for summary in period_summaries.values() if summary.expected_requirements > 0
        ]
        is_complete = (
            bool(participating_days)
            and all(_is_complete_calendar_day(summary) for summary in participating_days)
            and all(summary.stale_requirements == 0 for summary in period_summaries.values())
        )
        if not is_complete:
            raise MenuRequirementValidationError(
                "Monthly menu requirement report requires complete menu requirements "
                "for every participating day"
            )


def _is_complete_calendar_day(summary: MenuRequirementCalendarDayResponse) -> bool:
    return (
        summary.expected_requirements > 0
        and summary.generated_requirements >= summary.expected_requirements
        and summary.missing_requirements == 0
        and summary.stale_requirements == 0
    )


def _empty_calendar_day(service_date: Date) -> MenuRequirementCalendarDayResponse:
    return MenuRequirementCalendarDayResponse(
        service_date=service_date,
        expected_requirements=0,
        generated_requirements=0,
        missing_requirements=0,
        stale_requirements=0,
        status=MenuRequirementAggregateStatus.COMPLETE,
    )


def _month_workweek_blocks(date_from: Date, date_to: Date) -> list[tuple[Date, Date]]:
    blocks: list[tuple[Date, Date]] = []
    current = date_from - timedelta(days=date_from.weekday())
    if current + timedelta(days=4) < date_from:
        current += timedelta(days=7)

    while current <= date_to:
        blocks.append((current, current + timedelta(days=4)))
        current += timedelta(days=7)
    return blocks


def _aggregate_status(
    *,
    missing_dates: list[Date],
    stale_dates: list[Date],
) -> MenuRequirementAggregateStatus:
    if missing_dates and stale_dates:
        return MenuRequirementAggregateStatus.MIXED
    if missing_dates:
        return MenuRequirementAggregateStatus.MISSING
    if stale_dates:
        return MenuRequirementAggregateStatus.STALE
    return MenuRequirementAggregateStatus.COMPLETE


def _build_report_groups(
    requirements: list[MenuRequirement],
    *,
    requirement_statuses: dict[
        PydanticObjectId,
        MenuRequirementAggregateStatus,
    ],
    missing_requirement_keys: set[RequirementKey],
    expected_days: dict[Date, list[ExpectedMenuDay]],
    groups_by_id: dict[PydanticObjectId, SchoolGroup],
    schools_by_id: dict[PydanticObjectId, School],
    aggregate_by_age_group: bool = False,
) -> list[MenuRequirementReportGroupResponse]:
    group_states: dict[str, dict[str, Any]] = {}

    def get_group_state(
        school_group_id: PydanticObjectId,
        school_group_name: str,
        age_group: AgeGroup,
    ) -> dict[str, Any]:
        group_key = (
            f"age-group:{age_group.value}"
            if aggregate_by_age_group
            else f"school-group:{school_group_id}"
        )

        return group_states.setdefault(
            group_key,
            {
                "group_key": group_key,
                "school_group_id": (None if aggregate_by_age_group else school_group_id),
                "school_group_name": (
                    age_group.value if aggregate_by_age_group else school_group_name
                ),
                "age_group": age_group,
                "dishes": {},
                "rows": {},
            },
        )

    for requirement in sorted(
        requirements,
        key=lambda item: (
            item.school_group_name.casefold(),
            item.service_date,
            item.meal_type.value,
        ),
    ):
        group_state = get_group_state(
            requirement.school_group_id,
            requirement.school_group_name,
            requirement.age_group,
        )
        school = schools_by_id[requirement.school_id]
        dish_keys_by_item_id: dict[PydanticObjectId, str] = {}

        for dish in sorted(requirement.dishes, key=lambda item: item.position):
            aggregate_key = _requirement_dish_aggregate_key(dish)
            dish_state = group_state["dishes"].setdefault(
                aggregate_key.key,
                {
                    "aggregate_key": aggregate_key.key,
                    "name": dish.name,
                    "kind": dish.kind,
                    "recipe_card_number": dish.recipe_card_number,
                    "yield_amount": dish.yield_amount,
                    "key_reliability": aggregate_key.reliability,
                    "children_count_total": 0,
                    "sort": (requirement.service_date, dish.position, dish.name.casefold()),
                },
            )
            dish_state["children_count_total"] += dish.children_count
            dish_keys_by_item_id[dish.menu_item_id] = aggregate_key.key

        dishes_by_item_id = {dish.menu_item_id: dish for dish in requirement.dishes}
        requirement_status = requirement_statuses.get(
            requirement.id,
            MenuRequirementAggregateStatus.COMPLETE,
        )
        for row in requirement.ingredient_rows:
            if not row.has_values():
                continue
            row_state = group_state["rows"].setdefault(
                row.key,
                {
                    "key": row.key,
                    "ingredient_id": row.ingredient_id,
                    "ingredient_name": row.ingredient_name,
                    "cells": {},
                    "issue_total_raw_g": Decimal("0"),
                    "issue_total_rounded_g": 0,
                    "gross_issue_total_raw_g": Decimal("0"),
                    "gross_issue_total_rounded_g": 0,
                    "gross_available": True,
                },
            )
            if row_state["ingredient_id"] is None and row.ingredient_id is not None:
                row_state["ingredient_id"] = row.ingredient_id
            row_state["issue_total_raw_g"] += row.issue_total_raw_g
            row_state["issue_total_rounded_g"] += row.issue_total_rounded_g
            if row.gross_issue_total_raw_g is None or row.gross_issue_total_rounded_g is None:
                row_state["gross_available"] = False
            else:
                row_state["gross_issue_total_raw_g"] += row.gross_issue_total_raw_g
                row_state["gross_issue_total_rounded_g"] += row.gross_issue_total_rounded_g

            for cell in row.cells:
                dish = dishes_by_item_id.get(cell.menu_item_id)
                dish_key = dish_keys_by_item_id.get(cell.menu_item_id)
                if dish is None or dish_key is None:
                    continue

                issue_total_raw = cell.net_per_person_g * dish.children_count
                issue_total_rounded = _ceil_decimal(issue_total_raw)
                gross_issue_total_raw = (
                    cell.gross_per_person_g * dish.children_count
                    if cell.gross_per_person_g is not None
                    else None
                )
                gross_issue_total_rounded = (
                    _ceil_decimal(gross_issue_total_raw)
                    if gross_issue_total_raw is not None
                    else None
                )
                cell_state = row_state["cells"].setdefault(
                    dish_key,
                    {
                        "dish_key": dish_key,
                        "net_per_person_g": Decimal("0"),
                        "gross_per_person_g": Decimal("0"),
                        "issue_total_raw_g": Decimal("0"),
                        "issue_total_rounded_g": 0,
                        "gross_issue_total_raw_g": Decimal("0"),
                        "gross_issue_total_rounded_g": 0,
                        "gross_available": True,
                        "breakdown": [],
                    },
                )
                cell_state["net_per_person_g"] += cell.net_per_person_g
                cell_state["issue_total_raw_g"] += issue_total_raw
                cell_state["issue_total_rounded_g"] += issue_total_rounded
                if (
                    cell.gross_per_person_g is None
                    or gross_issue_total_raw is None
                    or gross_issue_total_rounded is None
                ):
                    cell_state["gross_available"] = False
                else:
                    cell_state["gross_per_person_g"] += cell.gross_per_person_g
                    cell_state["gross_issue_total_raw_g"] += gross_issue_total_raw
                    cell_state["gross_issue_total_rounded_g"] += gross_issue_total_rounded
                cell_state["breakdown"].append(
                    MenuRequirementReportBreakdownItemResponse(
                        requirement_id=requirement.id,
                        service_date=requirement.service_date,
                        school_id=requirement.school_id,
                        school_name=school.name,
                        school_group_id=requirement.school_group_id,
                        school_group_name=requirement.school_group_name,
                        menu_title=requirement.menu_title,
                        net_per_person_g=cell.net_per_person_g,
                        gross_per_person_g=cell.gross_per_person_g,
                        children_count=dish.children_count,
                        issue_total_raw_g=issue_total_raw,
                        issue_total_rounded_g=issue_total_rounded,
                        gross_issue_total_raw_g=gross_issue_total_raw,
                        gross_issue_total_rounded_g=gross_issue_total_rounded,
                        status=requirement_status,
                    )
                )

    missing_keys_by_group: dict[
        str,
        set[RequirementKey],
    ] = defaultdict(set)

    for missing_key in missing_requirement_keys:
        school_group = groups_by_id.get(missing_key.school_group_id)
        if school_group is None:
            continue

        group_state = get_group_state(
            school_group.id,
            school_group.name,
            school_group.age_group,
        )
        missing_keys_by_group[group_state["group_key"]].add(missing_key)

    for group_key, group_state in group_states.items():
        group_missing_keys = missing_keys_by_group.get(
            group_key,
            set(),
        )

        for row_state in group_state["rows"].values():
            for cell_state in row_state["cells"].values():
                _append_missing_breakdowns(
                    cell_state,
                    missing_requirement_keys=group_missing_keys,
                    expected_days=expected_days,
                    groups_by_id=groups_by_id,
                    schools_by_id=schools_by_id,
                )

    age_group_order = {age_group: index for index, age_group in enumerate(AgeGroup)}

    return [
        _report_group_from_state(group_state)
        for group_state in sorted(
            group_states.values(),
            key=lambda item: (
                age_group_order[item["age_group"]],
                item["school_group_name"].casefold(),
            ),
        )
    ]


def _report_group_from_state(group_state: dict[str, Any]) -> MenuRequirementReportGroupResponse:
    dishes = [
        MenuRequirementReportDishResponse(
            aggregate_key=dish_state["aggregate_key"],
            name=dish_state["name"],
            kind=dish_state["kind"],
            recipe_card_number=dish_state["recipe_card_number"],
            yield_amount=dish_state["yield_amount"],
            key_reliability=dish_state["key_reliability"],
            children_count_total=dish_state["children_count_total"],
        )
        for dish_state in sorted(
            group_state["dishes"].values(),
            key=lambda item: item["sort"],
        )
    ]
    dish_order = {dish.aggregate_key: index for index, dish in enumerate(dishes)}
    rows = []
    for row_state in sorted(
        group_state["rows"].values(),
        key=lambda item: (item["ingredient_name"].casefold(), item["key"]),
    ):
        cells = [
            MenuRequirementReportCellResponse(
                dish_key=cell_state["dish_key"],
                net_per_person_g=cell_state["net_per_person_g"],
                gross_per_person_g=(
                    cell_state["gross_per_person_g"] if cell_state["gross_available"] else None
                ),
                issue_total_raw_g=cell_state["issue_total_raw_g"],
                issue_total_rounded_g=cell_state["issue_total_rounded_g"],
                gross_issue_total_raw_g=(
                    cell_state["gross_issue_total_raw_g"] if cell_state["gross_available"] else None
                ),
                gross_issue_total_rounded_g=(
                    cell_state["gross_issue_total_rounded_g"]
                    if cell_state["gross_available"]
                    else None
                ),
                breakdown=sorted(
                    cell_state["breakdown"],
                    key=lambda item: (
                        item.service_date,
                        item.school_name.casefold(),
                        item.school_group_name.casefold(),
                        item.menu_title or "",
                    ),
                ),
            )
            for cell_state in sorted(
                row_state["cells"].values(),
                key=lambda item: dish_order.get(item["dish_key"], 10_000),
            )
        ]
        per_person_total = sum(
            (cell.net_per_person_g for cell in cells),
            start=Decimal("0"),
        )
        gross_per_person_total = (
            sum(
                (cell.gross_per_person_g for cell in cells if cell.gross_per_person_g is not None),
                start=Decimal("0"),
            )
            if all(cell.gross_per_person_g is not None for cell in cells)
            else None
        )
        rows.append(
            MenuRequirementReportIngredientRowResponse(
                key=row_state["key"],
                ingredient_id=row_state["ingredient_id"],
                ingredient_name=row_state["ingredient_name"],
                cells=cells,
                per_person_total_g=per_person_total,
                issue_total_raw_g=row_state["issue_total_raw_g"],
                issue_total_rounded_g=row_state["issue_total_rounded_g"],
                gross_per_person_total_g=gross_per_person_total,
                gross_issue_total_raw_g=(
                    row_state["gross_issue_total_raw_g"] if row_state["gross_available"] else None
                ),
                gross_issue_total_rounded_g=(
                    row_state["gross_issue_total_rounded_g"]
                    if row_state["gross_available"]
                    else None
                ),
            )
        )

    return MenuRequirementReportGroupResponse(
        group_key=group_state["group_key"],
        school_group_id=group_state["school_group_id"],
        school_group_name=group_state["school_group_name"],
        age_group=group_state["age_group"],
        dishes=dishes,
        ingredient_rows=rows,
    )


def _append_missing_breakdowns(
    cell_state: dict[str, Any],
    *,
    missing_requirement_keys: set[RequirementKey],
    expected_days: dict[Date, list[ExpectedMenuDay]],
    groups_by_id: dict[PydanticObjectId, SchoolGroup],
    schools_by_id: dict[PydanticObjectId, School],
) -> None:
    sorted_missing_keys = sorted(
        missing_requirement_keys,
        key=lambda item: (
            item.service_date,
            str(item.school_id),
            str(item.school_group_id),
            str(item.weekly_menu_id),
        ),
    )

    for missing_key in sorted_missing_keys:
        school = schools_by_id.get(missing_key.school_id)
        school_group = groups_by_id.get(missing_key.school_group_id)
        if school is None or school_group is None:
            continue

        expected_day = next(
            (
                item
                for item in expected_days.get(
                    missing_key.service_date,
                    [],
                )
                if (
                    item.school_id == missing_key.school_id
                    and item.weekly_menu_id == missing_key.weekly_menu_id
                    and item.weekday == missing_key.weekday
                )
            ),
            None,
        )
        if expected_day is None:
            continue

        if not _expected_day_contains_dish(
            expected_day,
            school_group=school_group,
            dish_key=cell_state["dish_key"],
        ):
            continue

        cell_state["breakdown"].append(
            MenuRequirementReportBreakdownItemResponse(
                requirement_id=None,
                service_date=missing_key.service_date,
                school_id=school.id,
                school_name=school.name,
                school_group_id=school_group.id,
                school_group_name=school_group.name,
                menu_title=expected_day.menu_title,
                net_per_person_g=None,
                gross_per_person_g=None,
                children_count=None,
                issue_total_raw_g=None,
                issue_total_rounded_g=None,
                gross_issue_total_raw_g=None,
                gross_issue_total_rounded_g=None,
                status=MenuRequirementAggregateStatus.MISSING,
            )
        )


def _expected_day_contains_dish(
    expected_day: ExpectedMenuDay,
    *,
    school_group: SchoolGroup,
    dish_key: str,
) -> bool:
    for item in expected_day.day.items:
        serving = next(
            (
                candidate
                for candidate in item.servings
                if candidate.school_group_id == school_group.id and candidate.children_count > 0
            ),
            None,
        )
        if serving is None:
            continue
        key = _daily_item_aggregate_key(item, school_group)
        if key is not None and key.key == dish_key:
            return True
    return False


def _requirement_dish_aggregate_key(dish: MenuRequirementDish) -> AggregateDishKey:
    if dish.kind == MenuItemKind.PRODUCT:
        return _aggregate_key(
            kind=dish.kind,
            yield_amount=dish.yield_amount,
            identity_parts=[
                _id_or_name_part(
                    "product_ingredient",
                    dish.product_ingredient_id,
                    dish.name,
                )
            ],
        )

    return _aggregate_key(
        kind=dish.kind,
        yield_amount=dish.yield_amount,
        identity_parts=[
            _id_or_name_part("dish_card", dish.dish_card_id, dish.name),
            _id_or_name_part(
                "dish_card_version",
                dish.dish_card_version_id,
                dish.name,
            ),
            _id_or_name_part("portion_variant", dish.portion_variant_id, dish.yield_amount),
        ],
    )


def _daily_item_aggregate_key(
    item: DailyMenuItem,
    school_group: SchoolGroup,
) -> AggregateDishKey | None:
    portion = next(
        (candidate for candidate in item.portions if candidate.age_group == school_group.age_group),
        None,
    )
    if portion is None:
        return None

    if item.kind == MenuItemKind.PRODUCT:
        return _aggregate_key(
            kind=item.kind,
            yield_amount=portion.yield_amount,
            identity_parts=[
                _id_or_name_part(
                    "product_ingredient",
                    item.product_ingredient_id,
                    item.product_name_snapshot or item.name,
                )
            ],
        )

    return _aggregate_key(
        kind=item.kind,
        yield_amount=portion.yield_amount,
        identity_parts=[
            _id_or_name_part("dish_card", item.dish_card_id, item.name),
            _id_or_name_part("dish_card_version", item.dish_card_version_id, item.name),
            _id_or_name_part(
                "portion_variant",
                portion.dish_card_portion_variant_id,
                portion.yield_amount,
            ),
        ],
    )


def _aggregate_key(
    *,
    kind: MenuItemKind,
    yield_amount: str,
    identity_parts: list[tuple[str, bool]],
) -> AggregateDishKey:
    parts = [kind.value, *[part for part, _reliable in identity_parts]]
    parts.append(f"yield={_normalize_key_text(yield_amount)}")
    return AggregateDishKey(
        key="|".join(parts),
        reliability=(
            MenuRequirementDishKeyReliability.STABLE
            if all(reliable for _part, reliable in identity_parts)
            else MenuRequirementDishKeyReliability.NAME_FALLBACK
        ),
    )


def _id_or_name_part(
    label: str,
    value: PydanticObjectId | None,
    fallback: str,
) -> tuple[str, bool]:
    if value is not None:
        return f"{label}_id={value}", True
    return f"{label}_name={_normalize_key_text(fallback)}", False


def _normalize_key_text(value: str) -> str:
    return normalize_lookup_text(value.strip().replace(",", "."))


def _ceil_decimal(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_CEILING))
