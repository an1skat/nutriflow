import asyncio
import hashlib
import json
import re
from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from datetime import date as Date
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from typing import Any

from beanie import PydanticObjectId

from app.modules.identity.models import School, SchoolGroup, User, UserRole
from app.modules.menu_requirements.models import (
    MenuRequirement,
    MenuRequirementCell,
    MenuRequirementDish,
    MenuRequirementIngredientRow,
)
from app.modules.menu_requirements.schemas import (
    MenuRequirementAggregateStatus,
    MenuRequirementCalendarDayResponse,
    MenuRequirementCalendarMonthResponse,
    MenuRequirementCalendarResponse,
    MenuRequirementCalendarWeekResponse,
    MenuRequirementDishKeyReliability,
    MenuRequirementReportBreakdownItemResponse,
    MenuRequirementReportCellResponse,
    MenuRequirementReportDishResponse,
    MenuRequirementReportGranularity,
    MenuRequirementReportGroupResponse,
    MenuRequirementReportIngredientRowResponse,
    MenuRequirementReportResponse,
)
from app.modules.menu_requirements.xlsx import (
    build_menu_requirement_report_workbook,
    build_menu_requirement_workbook,
)
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MealType,
    MenuItemKind,
    Weekday,
    WeeklyMenu,
    WeeklyMenuStatus,
)
from app.modules.nutrition.contributions import (
    IngredientLine,
    ingredient_contribution_snapshots,
)
from app.modules.nutrition.domain import (
    NormativeContributionBasis,
    NormativeContributionSnapshot,
    NormativeContributionSource,
)
from app.modules.recipe.models import (
    DishCardVersion,
    DishCardVersionStatus,
    Ingredient,
    IngredientAmount,
    PortionVariant,
    find_portion_variant_by_yield,
    normalize_lookup_text,
)

MAX_REPORT_RANGE_DAYS = 45
CALENDAR_WEEK_SPILLOVER_DAYS = 4


class MenuRequirementNotFoundError(ValueError):
    """The requested menu requirement does not exist."""


class MenuRequirementAccessDeniedError(ValueError):
    """Current user cannot access the requested menu requirement."""


class MenuRequirementValidationError(ValueError):
    """The daily menu cannot be converted into a menu requirement."""


@dataclass(frozen=True)
class IngredientCatalogEntry:
    key: str
    ingredient_id: PydanticObjectId | None
    name: str


@dataclass(frozen=True)
class DishCalculation:
    dish: MenuRequirementDish
    ingredient_lines: list[IngredientLine]


@dataclass(frozen=True)
class MenuRequirementRecord:
    requirement: MenuRequirement
    school_name: str
    school_admin_owner_id: PydanticObjectId | None
    school_admin_owner_username: str | None


@dataclass(frozen=True)
class AggregateDishKey:
    key: str
    reliability: MenuRequirementDishKeyReliability


@dataclass(frozen=True)
class ExpectedMenuDay:
    service_date: Date
    weekly_menu_id: PydanticObjectId
    weekday: Weekday
    meal_type: MealType
    menu_title: str
    day: DailyMenu


async def generate_menu_requirements(
    weekly_menu_id: PydanticObjectId,
    weekday: Weekday,
    service_date: Date,
    current_user: User,
    *,
    allow_closed_day: bool = False,
) -> list[MenuRequirementRecord]:
    _ensure_school_user(current_user)
    menu = await WeeklyMenu.get(weekly_menu_id)
    if menu is None:
        raise MenuRequirementNotFoundError("Weekly menu not found")
    if menu.school_id != current_user.school_id:
        raise MenuRequirementAccessDeniedError("School access denied")
    if menu.status != WeeklyMenuStatus.PUBLISHED:
        raise MenuRequirementValidationError(
            "Menu requirements can only be generated from a published menu"
        )

    day = next((candidate for candidate in menu.days if candidate.weekday == weekday), None)
    if day is None:
        raise MenuRequirementNotFoundError("Daily menu not found")
    if day.closed_at is not None and not allow_closed_day:
        raise MenuRequirementValidationError("Daily menu is closed")

    resolved_service_date = resolve_service_date(menu, day, service_date)
    school = await School.get(menu.school_id)
    if school is None or not school.is_active:
        raise MenuRequirementAccessDeniedError("School is inactive or missing")

    groups_by_id = {group.id: group for group in school.groups}
    eligible_groups = _eligible_groups(day, groups_by_id)
    if not eligible_groups:
        raise MenuRequirementValidationError(
            "At least one dish must have a children count greater than zero"
        )

    catalog = await Ingredient.find({"is_active": True}).sort("+normalized_name").to_list()
    catalog_entries = [
        IngredientCatalogEntry(
            key=ingredient_key(ingredient.id, ingredient.name),
            ingredient_id=ingredient.id,
            name=ingredient.name,
        )
        for ingredient in catalog
    ]
    catalog_by_id = {ingredient.id: ingredient for ingredient in catalog}
    catalog_by_name = _catalog_by_normalized_name(catalog)
    source_day_hash = hash_daily_menu(day)

    prepared: list[
        tuple[SchoolGroup, list[MenuRequirementDish], list[MenuRequirementIngredientRow]]
    ]
    prepared = []
    for group in eligible_groups:
        calculations = await _build_dish_calculations(
            day,
            group,
            catalog_by_id=catalog_by_id,
            catalog_by_name=catalog_by_name,
        )
        prepared.append(
            (
                group,
                [calculation.dish for calculation in calculations],
                build_ingredient_rows(catalog_entries, calculations),
            )
        )

    now = datetime.now(UTC)
    requirements: list[MenuRequirement] = []
    eligible_group_ids = [group.id for group, _, _ in prepared]
    stale_requirements = await MenuRequirement.find(
        MenuRequirement.weekly_menu_id == menu.id,
        MenuRequirement.weekday == weekday,
        {"school_group_id": {"$nin": eligible_group_ids}},
    ).to_list()
    for stale_requirement in stale_requirements:
        await stale_requirement.delete()

    for group, dishes, ingredient_rows in prepared:
        requirement = await MenuRequirement.find_one(
            MenuRequirement.weekly_menu_id == menu.id,
            MenuRequirement.weekday == weekday,
            MenuRequirement.school_group_id == group.id,
        )
        if requirement is None:
            requirement = MenuRequirement(
                school_id=school.id,
                weekly_menu_id=menu.id,
                source_menu_id=menu.source_menu_id,
                menu_title=menu.title,
                meal_type=menu.meal_type,
                weekday=weekday,
                service_date=resolved_service_date,
                school_group_id=group.id,
                school_group_name=group.name,
                age_group=group.age_group,
                dishes=dishes,
                ingredient_rows=ingredient_rows,
                source_day_hash=source_day_hash,
                generated_by=current_user.id,
                generated_at=now,
                created_at=now,
                updated_at=now,
            )
            await requirement.insert()
        else:
            requirement.source_menu_id = menu.source_menu_id
            requirement.menu_title = menu.title
            requirement.meal_type = menu.meal_type
            requirement.service_date = resolved_service_date
            requirement.school_group_name = group.name
            requirement.age_group = group.age_group
            requirement.dishes = dishes
            requirement.ingredient_rows = ingredient_rows
            requirement.source_day_hash = source_day_hash
            requirement.revision += 1
            requirement.generated_by = current_user.id
            requirement.generated_at = now
            requirement.updated_at = now
            await requirement.save()
        requirements.append(requirement)

    records = await _build_requirement_records(requirements)
    return sorted(records, key=lambda item: item.requirement.school_group_name.casefold())


async def list_menu_requirements(
    current_user: User,
    *,
    offset: int,
    limit: int,
    weekly_menu_id: PydanticObjectId | None = None,
    school_group_id: PydanticObjectId | None = None,
    service_date: Date | None = None,
) -> tuple[list[MenuRequirementRecord], int]:
    filters: dict[str, Any] = {}
    allowed_school_ids = await _allowed_school_ids(current_user)
    if allowed_school_ids is not None:
        filters["school_id"] = {"$in": allowed_school_ids}
    if weekly_menu_id is not None:
        filters["weekly_menu_id"] = weekly_menu_id
    if school_group_id is not None:
        filters["school_group_id"] = school_group_id
    if service_date is not None:
        filters["service_date"] = service_date

    query = MenuRequirement.find(filters)
    total = await query.count()
    requirements = await (
        query.sort(
            [
                ("school_id", 1),
                ("service_date", -1),
                ("meal_type", 1),
                ("school_group_name", 1),
            ]
        )
        .skip(offset)
        .limit(limit)
        .to_list()
    )
    records = await _build_requirement_records(requirements)
    return records, total


async def get_menu_requirement(
    requirement_id: PydanticObjectId,
    current_user: User,
) -> MenuRequirementRecord:
    requirement = await MenuRequirement.get(requirement_id)
    if requirement is None:
        raise MenuRequirementNotFoundError("Menu requirement not found")
    if not await _can_access_school(current_user, requirement.school_id):
        raise MenuRequirementAccessDeniedError("School access denied")
    records = await _build_requirement_records([requirement])
    return records[0]


async def update_menu_requirement(
    requirement_id: PydanticObjectId,
    current_user: User,
    ingredient_rows: list[Any],
) -> MenuRequirementRecord:
    _ensure_requirement_editor(current_user)
    requirement = await MenuRequirement.get(requirement_id)
    if requirement is None:
        raise MenuRequirementNotFoundError("Menu requirement not found")

    requirement.ingredient_rows = _build_updated_ingredient_rows(
        requirement,
        ingredient_rows,
    )
    requirement.revision += 1
    requirement.updated_at = datetime.now(UTC)
    await requirement.save()

    records = await _build_requirement_records([requirement])
    return records[0]


async def delete_menu_requirement(
    requirement_id: PydanticObjectId,
    current_user: User,
) -> None:
    _ensure_requirement_editor(current_user)
    requirement = await MenuRequirement.get(requirement_id)
    if requirement is None:
        raise MenuRequirementNotFoundError("Menu requirement not found")
    if not await _can_access_school(current_user, requirement.school_id):
        raise MenuRequirementAccessDeniedError("School access denied")

    await requirement.delete()


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
    expected_days = await _expected_menu_days(
        school_id,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    requirements = await _find_requirements_for_report(
        school_id,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    requirement_statuses = await _requirement_statuses(requirements)

    generated_dates = {requirement.service_date for requirement in requirements}
    stale_dates = {
        requirement.service_date
        for requirement in requirements
        if requirement_statuses.get(requirement.id) == MenuRequirementAggregateStatus.STALE
    }
    expected_dates = set(expected_days)
    day_summaries = _build_calendar_day_summaries(
        expected_days,
        requirements,
        requirement_statuses=requirement_statuses,
        school=school,
        school_group_id=school_group_id,
    )

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
    _validate_report_range(date_from, date_to)
    school = await _get_accessible_school(current_user, school_id)
    _ensure_school_group_exists(school, school_group_id)

    expected_days = await _expected_menu_days(
        school_id,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    requirements = await _find_requirements_for_report(
        school_id,
        date_from=date_from,
        date_to=date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    requirement_statuses = await _requirement_statuses(requirements)
    if (
        current_user.role != UserRole.OWNER
        and granularity != MenuRequirementReportGranularity.DAY
    ):
        day_summaries = _build_calendar_day_summaries(
            expected_days,
            requirements,
            requirement_statuses=requirement_statuses,
            school=school,
            school_group_id=school_group_id,
        )
        _validate_complete_aggregate_report(
            granularity,
            date_from=date_from,
            date_to=date_to,
            day_summaries=day_summaries,
        )
    generated_dates = {requirement.service_date for requirement in requirements}
    expected_dates = set(expected_days)
    missing_dates = sorted(expected_dates - generated_dates)
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
        missing_dates=missing_dates,
        expected_days=expected_days,
        school=school,
    )

    return MenuRequirementReportResponse(
        school_id=school.id,
        school_name=school.name,
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
        meal_type=meal_type,
        school_group_id=school_group_id,
        status=_aggregate_status(missing_dates=missing_dates, stale_dates=stale_dates),
        missing_dates=missing_dates,
        stale_dates=stale_dates,
        groups=groups,
    )


async def export_menu_requirement_workbook(
    requirement_id: PydanticObjectId,
    current_user: User,
) -> tuple[str, bytes]:
    record = await get_menu_requirement(requirement_id, current_user)
    content = await asyncio.to_thread(
        build_menu_requirement_workbook,
        record.requirement,
        school_name=record.school_name,
    )
    requirement = record.requirement
    filename = _xlsx_filename(
        "menu-requirement",
        requirement.service_date.isoformat(),
        requirement.school_group_name,
    )
    return filename, content


async def export_menu_requirement_report_workbook(
    school_id: PydanticObjectId,
    date_from: Date,
    date_to: Date,
    granularity: MenuRequirementReportGranularity,
    current_user: User,
    *,
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> tuple[str, bytes]:
    report = await get_menu_requirement_report(
        school_id,
        date_from,
        date_to,
        granularity,
        current_user,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    content = await asyncio.to_thread(build_menu_requirement_report_workbook, report)
    filename = _xlsx_filename(
        "menu-requirement",
        report.school_name,
        report.date_from.isoformat(),
        report.date_to.isoformat(),
    )
    return filename, content


def build_ingredient_rows(
    catalog: list[IngredientCatalogEntry],
    calculations: list[DishCalculation],
) -> list[MenuRequirementIngredientRow]:
    rows: dict[str, IngredientCatalogEntry] = {entry.key: entry for entry in catalog}
    amounts_by_row: dict[str, dict[PydanticObjectId, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0"))
    )
    children_by_dish = {
        calculation.dish.menu_item_id: calculation.dish.children_count
        for calculation in calculations
    }

    for calculation in calculations:
        for line in calculation.ingredient_lines:
            rows.setdefault(
                line.key,
                IngredientCatalogEntry(
                    key=line.key,
                    ingredient_id=line.ingredient_id,
                    name=line.name,
                ),
            )
            amounts_by_row[line.key][calculation.dish.menu_item_id] += line.net_per_person_g

    result: list[MenuRequirementIngredientRow] = []
    for entry in sorted(rows.values(), key=lambda item: (item.name.casefold(), item.key)):
        cells = [
            MenuRequirementCell(
                menu_item_id=calculation.dish.menu_item_id,
                net_per_person_g=amounts_by_row[entry.key][calculation.dish.menu_item_id],
            )
            for calculation in calculations
            if calculation.dish.menu_item_id in amounts_by_row[entry.key]
        ]
        per_person_total = sum(
            (cell.net_per_person_g for cell in cells),
            start=Decimal("0"),
        )
        issue_total_raw = sum(
            (cell.net_per_person_g * children_by_dish[cell.menu_item_id] for cell in cells),
            start=Decimal("0"),
        )
        result.append(
            MenuRequirementIngredientRow(
                key=entry.key,
                ingredient_id=entry.ingredient_id,
                ingredient_name=entry.name,
                cells=cells,
                per_person_total_g=per_person_total,
                issue_total_raw_g=issue_total_raw,
                issue_total_rounded_g=int(
                    issue_total_raw.to_integral_value(rounding=ROUND_CEILING)
                ),
            )
        )
    return result


def convert_to_grams(value: Decimal, unit: str) -> Decimal:
    normalized = normalize_lookup_text(unit).replace(".", "")
    if normalized in {"g", "gr", "gram", "grams", "г", "гр", "грам", "грами"}:
        return value
    if normalized in {"kg", "кг", "кілограм", "кілограми"}:
        return value * Decimal("1000")
    raise MenuRequirementValidationError(f'Unit "{unit}" cannot be converted to grams')


def resolve_service_date(
    menu: WeeklyMenu,
    day: DailyMenu,
    requested_date: Date,
) -> Date:
    if day.date is not None:
        return day.date
    if menu.starts_on is not None:
        return menu.starts_on + timedelta(days=list(Weekday).index(day.weekday))
    return requested_date


def hash_daily_menu(day: DailyMenu) -> str:
    day_data = day.model_dump(mode="json")
    day_data.pop("closed_at", None)
    day_data.pop("closed_by", None)
    day_data.pop("close_reason", None)
    day_data.pop("dev_reopened_at", None)
    canonical = json.dumps(
        day_data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _validate_report_range(date_from: Date, date_to: Date) -> None:
    if date_from > date_to:
        raise MenuRequirementValidationError("date_from cannot be after date_to")
    if (date_to - date_from).days + 1 > MAX_REPORT_RANGE_DAYS:
        raise MenuRequirementValidationError(
            f"Menu requirement report range cannot exceed {MAX_REPORT_RANGE_DAYS} days"
        )


async def _get_accessible_school(
    current_user: User,
    school_id: PydanticObjectId,
) -> School:
    if not await _can_access_school(current_user, school_id):
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
    school_id: PydanticObjectId,
    *,
    date_from: Date,
    date_to: Date,
    meal_type: MealType | None,
    school_group_id: PydanticObjectId | None,
) -> list[MenuRequirement]:
    filters: dict[str, Any] = {
        "school_id": school_id,
        "service_date": {"$gte": date_from, "$lte": date_to},
    }
    if meal_type is not None:
        filters["meal_type"] = meal_type.value
    if school_group_id is not None:
        filters["school_group_id"] = school_group_id

    return await MenuRequirement.find(filters).to_list()


async def _expected_menu_days(
    school_id: PydanticObjectId,
    *,
    date_from: Date,
    date_to: Date,
    meal_type: MealType | None,
    school_group_id: PydanticObjectId | None,
) -> dict[Date, list[ExpectedMenuDay]]:
    filters: dict[str, Any] = {
        "school_id": school_id,
        "status": WeeklyMenuStatus.PUBLISHED.value,
    }
    if meal_type is not None:
        filters["meal_type"] = meal_type.value

    menus = await WeeklyMenu.find(filters).to_list()
    expected: dict[Date, list[ExpectedMenuDay]] = defaultdict(list)
    for menu in menus:
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
        date_from + timedelta(days=offset)
        for offset in range((date_to - date_from).days + 1)
    }
    expected = expected_dates & month_dates
    generated = generated_dates & month_dates
    missing = expected - generated
    stale = stale_dates & month_dates
    resolved_day_summaries = day_summaries or {}

    weeks = []
    for index, (block_from, block_to) in enumerate(
        _month_workweek_blocks(date_from, date_to),
        start=1,
    ):
        workday_dates = {
            block_from + timedelta(days=offset)
            for offset in range((block_to - block_from).days + 1)
        }
        full_week_dates = {
            block_from + timedelta(days=offset)
            for offset in range(7)
        }
        weekend_activity_dates = (
            (expected_dates | generated_dates | stale_dates) & full_week_dates
        ) - workday_dates
        block_dates = workday_dates | weekend_activity_dates
        resolved_block_to = max(block_dates)
        block_expected = expected_dates & block_dates
        block_generated = generated_dates & block_dates
        block_missing = block_expected - block_generated
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


def _build_calendar_day_summaries(
    expected_days: dict[Date, list[ExpectedMenuDay]],
    requirements: list[MenuRequirement],
    *,
    requirement_statuses: dict[PydanticObjectId, MenuRequirementAggregateStatus],
    school: School,
    school_group_id: PydanticObjectId | None,
) -> dict[Date, MenuRequirementCalendarDayResponse]:
    groups_by_id = {group.id: group for group in school.groups}
    expected_keys_by_date: dict[
        Date,
        set[tuple[PydanticObjectId, Weekday, PydanticObjectId]],
    ] = defaultdict(set)
    generated_keys_by_date: dict[
        Date,
        set[tuple[PydanticObjectId, Weekday, PydanticObjectId]],
    ] = defaultdict(set)
    stale_keys_by_date: dict[
        Date,
        set[tuple[PydanticObjectId, Weekday, PydanticObjectId]],
    ] = defaultdict(set)

    for service_date, menu_days in expected_days.items():
        for menu_day in menu_days:
            for group in _eligible_groups(menu_day.day, groups_by_id):
                if school_group_id is not None and group.id != school_group_id:
                    continue
                expected_keys_by_date[service_date].add(
                    (menu_day.weekly_menu_id, menu_day.weekday, group.id)
                )

    for requirement in requirements:
        key = (
            requirement.weekly_menu_id,
            requirement.weekday,
            requirement.school_group_id,
        )
        generated_keys_by_date[requirement.service_date].add(key)
        if requirement_statuses.get(requirement.id) == MenuRequirementAggregateStatus.STALE:
            stale_keys_by_date[requirement.service_date].add(key)

    summaries: dict[Date, MenuRequirementCalendarDayResponse] = {}
    for service_date in (
        set(expected_keys_by_date) | set(generated_keys_by_date) | set(stale_keys_by_date)
    ):
        expected_keys = expected_keys_by_date[service_date]
        generated_keys = generated_keys_by_date[service_date]
        missing_keys = expected_keys - generated_keys
        stale_keys = stale_keys_by_date[service_date]
        summaries[service_date] = MenuRequirementCalendarDayResponse(
            service_date=service_date,
            expected_requirements=len(expected_keys),
            generated_requirements=len(generated_keys),
            missing_requirements=len(missing_keys),
            stale_requirements=len(stale_keys),
            status=_aggregate_status(
                missing_dates=[service_date] if missing_keys else [],
                stale_dates=[service_date] if stale_keys else [],
            ),
        )
    return summaries


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
        if date_from <= service_date <= date_to
    }

    if granularity == MenuRequirementReportGranularity.WEEK:
        required_dates = [date_from + timedelta(days=offset) for offset in range(5)]
        is_complete = (
            date_to == date_from + timedelta(days=4)
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
            summary
            for summary in period_summaries.values()
            if summary.expected_requirements > 0
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
    requirement_statuses: dict[PydanticObjectId, MenuRequirementAggregateStatus],
    missing_dates: list[Date],
    expected_days: dict[Date, list[ExpectedMenuDay]],
    school: School,
) -> list[MenuRequirementReportGroupResponse]:
    groups_by_id = {group.id: group for group in school.groups}
    group_states: dict[PydanticObjectId, dict[str, Any]] = {}

    for requirement in sorted(
        requirements,
        key=lambda item: (
            item.school_group_name.casefold(),
            item.service_date,
            item.meal_type.value,
        ),
    ):
        group_state = group_states.setdefault(
            requirement.school_group_id,
            {
                "school_group_id": requirement.school_group_id,
                "school_group_name": requirement.school_group_name,
                "age_group": requirement.age_group,
                "dishes": {},
                "rows": {},
            },
        )
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
            if not row.cells:
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
                },
            )
            if row_state["ingredient_id"] is None and row.ingredient_id is not None:
                row_state["ingredient_id"] = row.ingredient_id
            row_state["issue_total_raw_g"] += row.issue_total_raw_g
            row_state["issue_total_rounded_g"] += row.issue_total_rounded_g

            for cell in row.cells:
                dish = dishes_by_item_id.get(cell.menu_item_id)
                dish_key = dish_keys_by_item_id.get(cell.menu_item_id)
                if dish is None or dish_key is None:
                    continue

                issue_total_raw = cell.net_per_person_g * dish.children_count
                issue_total_rounded = _ceil_decimal(issue_total_raw)
                cell_state = row_state["cells"].setdefault(
                    dish_key,
                    {
                        "dish_key": dish_key,
                        "net_per_person_g": Decimal("0"),
                        "issue_total_raw_g": Decimal("0"),
                        "issue_total_rounded_g": 0,
                        "breakdown": [],
                    },
                )
                cell_state["net_per_person_g"] += cell.net_per_person_g
                cell_state["issue_total_raw_g"] += issue_total_raw
                cell_state["issue_total_rounded_g"] += issue_total_rounded
                cell_state["breakdown"].append(
                    MenuRequirementReportBreakdownItemResponse(
                        requirement_id=requirement.id,
                        service_date=requirement.service_date,
                        school_group_id=requirement.school_group_id,
                        school_group_name=requirement.school_group_name,
                        menu_title=requirement.menu_title,
                        net_per_person_g=cell.net_per_person_g,
                        children_count=dish.children_count,
                        issue_total_raw_g=issue_total_raw,
                        issue_total_rounded_g=issue_total_rounded,
                        status=requirement_status,
                    )
                )

    for group_id, group_state in group_states.items():
        school_group = groups_by_id.get(group_id)
        if school_group is None:
            continue
        for row_state in group_state["rows"].values():
            for cell_state in row_state["cells"].values():
                _append_missing_breakdowns(
                    cell_state,
                    missing_dates=missing_dates,
                    expected_days=expected_days,
                    school_group=school_group,
                )

    return [
        _report_group_from_state(group_state)
        for group_state in sorted(
            group_states.values(),
            key=lambda item: item["school_group_name"].casefold(),
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
                issue_total_raw_g=cell_state["issue_total_raw_g"],
                issue_total_rounded_g=cell_state["issue_total_rounded_g"],
                breakdown=sorted(
                    cell_state["breakdown"],
                    key=lambda item: (
                        item.service_date,
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
        rows.append(
            MenuRequirementReportIngredientRowResponse(
                key=row_state["key"],
                ingredient_id=row_state["ingredient_id"],
                ingredient_name=row_state["ingredient_name"],
                cells=cells,
                per_person_total_g=per_person_total,
                issue_total_raw_g=row_state["issue_total_raw_g"],
                issue_total_rounded_g=row_state["issue_total_rounded_g"],
            )
        )

    return MenuRequirementReportGroupResponse(
        school_group_id=group_state["school_group_id"],
        school_group_name=group_state["school_group_name"],
        age_group=group_state["age_group"],
        dishes=dishes,
        ingredient_rows=rows,
    )


def _append_missing_breakdowns(
    cell_state: dict[str, Any],
    *,
    missing_dates: list[Date],
    expected_days: dict[Date, list[ExpectedMenuDay]],
    school_group: SchoolGroup,
) -> None:
    existing_dates = {
        item.service_date
        for item in cell_state["breakdown"]
        if item.status != MenuRequirementAggregateStatus.MISSING
    }
    for missing_date in missing_dates:
        if missing_date in existing_dates:
            continue
        expected_day = next(
            (
                item
                for item in expected_days.get(missing_date, [])
                if _expected_day_contains_dish(
                    item,
                    school_group=school_group,
                    dish_key=cell_state["dish_key"],
                )
            ),
            None,
        )
        if expected_day is None:
            continue
        cell_state["breakdown"].append(
            MenuRequirementReportBreakdownItemResponse(
                requirement_id=None,
                service_date=missing_date,
                school_group_id=school_group.id,
                school_group_name=school_group.name,
                menu_title=expected_day.menu_title,
                net_per_person_g=None,
                children_count=None,
                issue_total_raw_g=None,
                issue_total_rounded_g=None,
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


def ingredient_key(ingredient_id: PydanticObjectId | None, name: str) -> str:
    if ingredient_id is not None:
        return f"ingredient:{ingredient_id}"
    return f"snapshot:{normalize_lookup_text(name)}"


def _xlsx_filename(*parts: str) -> str:
    stem = "-".join(part.strip() for part in parts if part.strip())
    safe_stem = re.sub(r"[^\w.-]+", "-", stem, flags=re.UNICODE).strip("-.")
    return f"{safe_stem or 'menu-requirement'}.xlsx"


def _ensure_school_user(current_user: User) -> None:
    if current_user.role != UserRole.SCHOOL_USER or current_user.school_id is None:
        raise MenuRequirementAccessDeniedError("Only school users can access menu requirements")


def _ensure_requirement_editor(current_user: User) -> None:
    if current_user.role not in {UserRole.OWNER, UserRole.TECHNOLOGIST}:
        raise MenuRequirementAccessDeniedError(
            "Only owner and technologist can edit menu requirements"
        )


def _build_updated_ingredient_rows(
    requirement: MenuRequirement,
    row_updates: list[Any],
) -> list[MenuRequirementIngredientRow]:
    rows_by_key = {row.key: row for row in requirement.ingredient_rows}
    row_keys = set(rows_by_key)
    update_keys = [row.key for row in row_updates]
    if _duplicates(update_keys):
        raise MenuRequirementValidationError("Ingredient rows contain duplicate keys")
    if set(update_keys) != row_keys:
        raise MenuRequirementValidationError("Ingredient rows do not match requirement rows")

    dish_ids = {dish.menu_item_id for dish in requirement.dishes}
    children_by_dish = {dish.menu_item_id: dish.children_count for dish in requirement.dishes}

    updated_rows: list[MenuRequirementIngredientRow] = []
    for row_update in row_updates:
        original = rows_by_key[row_update.key]
        cell_ids = [cell.menu_item_id for cell in row_update.cells]
        if _duplicates(cell_ids):
            raise MenuRequirementValidationError("Ingredient row contains duplicate dish cells")
        if not set(cell_ids).issubset(dish_ids):
            raise MenuRequirementValidationError("Ingredient row references unknown dish")

        cells = [
            MenuRequirementCell(
                menu_item_id=cell.menu_item_id,
                net_per_person_g=cell.net_per_person_g,
            )
            for cell in row_update.cells
            if cell.net_per_person_g != Decimal("0")
        ]
        per_person_total = sum(
            (cell.net_per_person_g for cell in cells),
            start=Decimal("0"),
        )
        issue_total_raw = sum(
            (cell.net_per_person_g * children_by_dish[cell.menu_item_id] for cell in cells),
            start=Decimal("0"),
        )
        updated_rows.append(
            MenuRequirementIngredientRow(
                key=original.key,
                ingredient_id=original.ingredient_id,
                ingredient_name=row_update.ingredient_name,
                cells=cells,
                per_person_total_g=per_person_total,
                issue_total_raw_g=issue_total_raw,
                issue_total_rounded_g=int(
                    issue_total_raw.to_integral_value(rounding=ROUND_CEILING)
                ),
            )
        )

    return updated_rows


def _duplicates(values: list[Any]) -> set[Any]:
    seen: set[Any] = set()
    duplicates: set[Any] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


async def _allowed_school_ids(
    current_user: User,
) -> list[PydanticObjectId] | None:
    if current_user.role == UserRole.SCHOOL_USER:
        if current_user.school_id is None:
            raise MenuRequirementAccessDeniedError("School access denied")
        return [current_user.school_id]
    if current_user.role == UserRole.ADMIN:
        schools = await School.find(School.admin_owner_id == current_user.id).to_list()
        return [school.id for school in schools]
    if current_user.role in {UserRole.OWNER, UserRole.TECHNOLOGIST}:
        return None
    raise MenuRequirementAccessDeniedError("Menu requirement access denied")


async def _can_access_school(
    current_user: User,
    school_id: PydanticObjectId,
) -> bool:
    allowed_school_ids = await _allowed_school_ids(current_user)
    return allowed_school_ids is None or school_id in allowed_school_ids


async def _build_requirement_records(
    requirements: list[MenuRequirement],
) -> list[MenuRequirementRecord]:
    school_ids = {requirement.school_id for requirement in requirements}
    schools = await School.find({"_id": {"$in": list(school_ids)}}).to_list()
    schools_by_id = {school.id: school for school in schools}
    owner_ids = {school.admin_owner_id for school in schools if school.admin_owner_id is not None}
    owners = await User.find({"_id": {"$in": list(owner_ids)}}).to_list()
    owner_names = {owner.id: owner.username for owner in owners}

    records: list[MenuRequirementRecord] = []
    for requirement in requirements:
        school = schools_by_id.get(requirement.school_id)
        if school is None:
            records.append(
                MenuRequirementRecord(
                    requirement=requirement,
                    school_name="Невідома школа",
                    school_admin_owner_id=None,
                    school_admin_owner_username=None,
                )
            )
            continue
        records.append(
            MenuRequirementRecord(
                requirement=requirement,
                school_name=school.name,
                school_admin_owner_id=school.admin_owner_id,
                school_admin_owner_username=owner_names.get(school.admin_owner_id),
            )
        )
    return records


def _eligible_groups(
    day: DailyMenu,
    groups_by_id: dict[PydanticObjectId, SchoolGroup],
) -> list[SchoolGroup]:
    eligible_ids: set[PydanticObjectId] = set()
    for item in day.items:
        for serving in item.servings:
            if serving.children_count <= 0:
                continue
            group = groups_by_id.get(serving.school_group_id)
            if group is None:
                raise MenuRequirementValidationError("School group not found")
            eligible_ids.add(group.id)
    return [group for group in groups_by_id.values() if group.id in eligible_ids]


async def _build_dish_calculations(
    day: DailyMenu,
    group: SchoolGroup,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> list[DishCalculation]:
    calculations: list[DishCalculation] = []

    for item in sorted(day.items, key=lambda candidate: candidate.position):
        serving = next(
            (candidate for candidate in item.servings if candidate.school_group_id == group.id),
            None,
        )
        if serving is None or serving.children_count <= 0:
            continue

        portion = next(
            (candidate for candidate in item.portions if candidate.age_group == group.age_group),
            None,
        )
        if portion is None:
            raise MenuRequirementValidationError(
                f'Portion for group "{group.name}" is missing in dish "{item.name}"'
            )

        resolved_portion_variant_id = portion.dish_card_portion_variant_id

        if item.kind == MenuItemKind.PRODUCT:
            lines, normative_contributions = await _product_ingredient_lines(
                item,
                portion.yield_amount,
                catalog_by_id=catalog_by_id,
                catalog_by_name=catalog_by_name,
            )
        else:
            (
                resolved_portion_variant_id,
                lines,
                normative_contributions,
            ) = await _dish_card_ingredient_lines(
                item,
                portion.dish_card_portion_variant_id,
                portion.yield_amount,
                catalog_by_id=catalog_by_id,
                catalog_by_name=catalog_by_name,
            )

        dish = MenuRequirementDish(
            menu_item_id=item.id,
            position=item.position,
            kind=item.kind,
            name=item.name,
            recipe_card_number=item.recipe_card_number,
            dish_card_id=item.dish_card_id,
            dish_card_version_id=item.dish_card_version_id,
            portion_variant_id=resolved_portion_variant_id,
            product_ingredient_id=item.product_ingredient_id,
            yield_amount=portion.yield_amount,
            children_count=serving.children_count,
            normative_contributions=normative_contributions,
        )

        calculations.append(
            DishCalculation(
                dish=dish,
                ingredient_lines=lines,
            )
        )

    return calculations


async def _dish_card_ingredient_lines(
    item: DailyMenuItem,
    portion_variant_id: PydanticObjectId | None,
    yield_amount: str,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> tuple[
    PydanticObjectId,
    list[IngredientLine],
    list[NormativeContributionSnapshot],
]:
    if item.dish_card_version_id is None:
        raise MenuRequirementValidationError(
            f'Dish "{item.name}" must reference a dish card version'
        )

    version = await DishCardVersion.get(item.dish_card_version_id)
    if version is None:
        raise MenuRequirementValidationError(f'Dish card version for "{item.name}" was not found')

    if version.status not in {
        DishCardVersionStatus.CONFIRMED,
        DishCardVersionStatus.ARCHIVED,
    }:
        raise MenuRequirementValidationError(
            f'Dish card version for "{item.name}" is not confirmed'
        )

    # Даже если в старом меню ID равен null, пытаемся
    # восстановить вариант по выходу блюда.
    variant = find_portion_variant_by_yield(
        version.portion_variants,
        yield_amount,
        preferred_variant_id=portion_variant_id,
    )

    if variant is None:
        raise MenuRequirementValidationError(
            f'Dish "{item.name}" has no portion variant for output {yield_amount} g'
        )

    amounts = [
        amount for amount in version.ingredient_amounts if amount.portion_variant_id == variant.id
    ]

    if not amounts:
        raise MenuRequirementValidationError(
            f'Dish "{item.name}" has no ingredients for the selected portion'
        )

    lines = [
        _ingredient_line(
            amount,
            catalog_by_id=catalog_by_id,
            catalog_by_name=catalog_by_name,
        )
        for amount in amounts
    ]
    explicit = _portion_variant_contribution_snapshots(variant, item.name)
    fallback = ingredient_contribution_snapshots(
        lines,
        catalog_by_id=catalog_by_id,
        catalog_by_name=catalog_by_name,
        excluded_groups={item.group_code for item in explicit},
        source_type=NormativeContributionSource.INGREDIENT,
    )
    return variant.id, lines, [*explicit, *fallback]


async def _product_ingredient_lines(
    item: DailyMenuItem,
    yield_amount: str,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> tuple[list[IngredientLine], list[NormativeContributionSnapshot]]:
    try:
        amount = Decimal(yield_amount.strip().replace(",", "."))
    except InvalidOperation as exc:
        raise MenuRequirementValidationError(
            f'Product "{item.name}" must have a single numeric yield in grams'
        ) from exc
    if amount < 0:
        raise MenuRequirementValidationError(f'Product "{item.name}" cannot have a negative yield')

    ingredient = (
        catalog_by_id.get(item.product_ingredient_id)
        if item.product_ingredient_id is not None
        else None
    )
    if ingredient is None:
        ingredient = catalog_by_name.get(
            normalize_lookup_text(item.product_name_snapshot or item.name)
        )
    ingredient_id = ingredient.id if ingredient is not None else item.product_ingredient_id
    name = ingredient.name if ingredient is not None else (item.product_name_snapshot or item.name)
    lines = [
        IngredientLine(
            key=ingredient_key(ingredient_id, name),
            ingredient_id=ingredient_id,
            name=name,
            net_per_person_g=amount,
        )
    ]
    snapshots = ingredient_contribution_snapshots(
        lines,
        catalog_by_id=catalog_by_id,
        catalog_by_name=catalog_by_name,
        excluded_groups=set(),
        source_type=NormativeContributionSource.PRODUCT,
    )
    return lines, snapshots


def _portion_variant_contribution_snapshots(
    variant: PortionVariant,
    dish_name: str,
) -> list[NormativeContributionSnapshot]:
    return [
        NormativeContributionSnapshot(
            group_code=contribution.group_code,
            amount=contribution.amount,
            unit=contribution.unit,
            portion_equivalent=contribution.portion_equivalent,
            product_variant=contribution.product_variant,
            source_type=NormativeContributionSource.PORTION_VARIANT,
            source_id=str(variant.id),
            source_name=dish_name,
        )
        for contribution in variant.normative_contributions
        if contribution.basis == NormativeContributionBasis.PER_PORTION
    ]


def _ingredient_line(
    amount: IngredientAmount,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> IngredientLine:
    ingredient = (
        catalog_by_id.get(amount.ingredient_id) if amount.ingredient_id is not None else None
    )
    if ingredient is None:
        ingredient = catalog_by_name.get(normalize_lookup_text(amount.ingredient_name_snapshot))
    ingredient_id = ingredient.id if ingredient is not None else amount.ingredient_id
    name = ingredient.name if ingredient is not None else amount.ingredient_name_snapshot
    return IngredientLine(
        key=ingredient_key(ingredient_id, name),
        ingredient_id=ingredient_id,
        name=name,
        net_per_person_g=convert_to_grams(amount.net_amount, amount.unit),
    )


def _catalog_by_normalized_name(catalog: list[Ingredient]) -> dict[str, Ingredient]:
    result: dict[str, Ingredient] = {}
    for ingredient in catalog:
        current = result.get(ingredient.normalized_name)
        if current is None or ingredient.unit in {"g", "г", "гр"}:
            result[ingredient.normalized_name] = ingredient
    return result
