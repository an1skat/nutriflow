from collections import defaultdict
from dataclasses import dataclass
from datetime import date as Date
from datetime import timedelta
from decimal import ROUND_FLOOR, Decimal

from beanie import PydanticObjectId

from app.modules.identity.models import AgeGroup, School, SchoolGroup, User, UserRole
from app.modules.menu_requirements.models import MenuRequirement
from app.modules.menu_requirements.service import hash_daily_menu
from app.modules.menus.models import (
    DailyMenu,
    MealType,
    MenuItemKind,
    Weekday,
    WeeklyMenu,
    WeeklyMenuStatus,
)
from app.modules.norm_compliance.registry import NutritionNorm, get_norms
from app.modules.norm_compliance.schemas import (
    ComplianceBreakdownResponse,
    ComplianceGroupResponse,
    ComplianceMealSectionResponse,
    ComplianceRowResponse,
    ComplianceStatus,
    NormComplianceReportResponse,
    ToleranceInfoResponse,
    UnmappedItemResponse,
)
from app.modules.nutrition.contributions import (
    IngredientLine,
    ingredient_contribution_snapshots,
)
from app.modules.nutrition.domain import (
    NormativeContributionSnapshot,
    NormativeContributionSource,
)
from app.modules.nutrition.ingredient_registry import (
    INGREDIENTS_NOT_COUNTED_SEPARATELY,
    get_ingredient_norm_rule,
)
from app.modules.recipe.models import Ingredient, normalize_lookup_text


class NormComplianceNotFoundError(ValueError):
    pass


class NormComplianceAccessDeniedError(ValueError):
    pass


class NormComplianceValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ExpectedRequirement:
    weekly_menu_id: PydanticObjectId
    weekday: Weekday
    service_date: Date
    meal_type: MealType
    school_group: SchoolGroup
    day: DailyMenu


def calculate_numeric_status(
    actual: Decimal,
    required: Decimal,
    *,
    minimum_percent: Decimal,
    maximum_percent: Decimal,
) -> tuple[ComplianceStatus, Decimal | None]:
    if required <= 0:
        return ComplianceStatus.COMPLETE, None
    percent = actual * Decimal("100") / required
    if percent < minimum_percent:
        return ComplianceStatus.UNDER, percent
    if percent > maximum_percent:
        return ComplianceStatus.OVER, percent
    return ComplianceStatus.COMPLETE, percent


def contribution_value(
    contribution: NormativeContributionSnapshot,
    norm: NutritionNorm,
) -> tuple[Decimal, Decimal] | None:
    """Return comparison amount and portion equivalents for one snapshot."""
    if norm.uses_portion_equivalents:
        if contribution.portion_equivalent is not None:
            value = contribution.portion_equivalent
            return value, value
        option = next(
            (
                candidate
                for candidate in norm.portion_options
                if candidate.product_variant == contribution.product_variant
                and candidate.unit == contribution.unit
            ),
            None,
        )
        if option is None:
            return None
        value = contribution.amount / option.amount
        return value, value

    option = norm.portion_options[0]
    if contribution.unit != option.unit:
        return None
    return contribution.amount, contribution.amount / option.amount


async def get_norm_compliance_report(
    school_id: PydanticObjectId,
    date_from: Date,
    date_to: Date,
    current_user: User,
    *,
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> NormComplianceReportResponse:
    _validate_range(date_from, date_to)
    school = await _get_accessible_school(current_user, school_id)
    groups = [
        group
        for group in school.groups
        if group.is_active and (school_group_id is None or group.id == school_group_id)
    ]
    if school_group_id is not None and not groups:
        raise NormComplianceNotFoundError("School group not found")

    requirements = await _find_requirements(
        school_id,
        date_from,
        date_to,
        meal_type=meal_type,
        school_group_id=school_group_id,
    )
    expected = await _find_expected_requirements(
        school_id,
        groups,
        date_from,
        date_to,
        meal_type=meal_type,
    )
    if current_user.role != UserRole.OWNER:
        _validate_complete_requirement_week(requirements, expected, date_from, date_to)
    await _apply_manual_ingredient_rules(requirements)
    sections_by_group = _build_sections(groups, requirements, expected, meal_type=meal_type)
    group_responses = [
        ComplianceGroupResponse(
            school_group_id=group.id,
            school_group_name=group.name,
            age_group=group.age_group,
            status=_aggregate_status([section.status for section in sections_by_group[group.id]]),
            sections=sections_by_group[group.id],
        )
        for group in groups
        if sections_by_group[group.id]
    ]
    return NormComplianceReportResponse(
        school_id=school.id,
        school_name=school.name,
        date_from=date_from,
        date_to=date_to,
        status=_aggregate_status([group.status for group in group_responses]),
        groups=group_responses,
    )


async def _apply_manual_ingredient_rules(requirements: list[MenuRequirement]) -> None:
    if not any(
        not dish.normative_contributions
        for requirement in requirements
        for dish in requirement.dishes
    ):
        return

    catalog = await Ingredient.find({"is_active": True}).to_list()
    _apply_manual_ingredient_rules_from_catalog(requirements, catalog)


def _apply_manual_ingredient_rules_from_catalog(
    requirements: list[MenuRequirement],
    catalog: list[Ingredient],
) -> None:
    catalog_by_id = {ingredient.id: ingredient for ingredient in catalog}
    catalog_by_name = {
        normalize_lookup_text(ingredient.name): ingredient for ingredient in catalog
    }

    for requirement in requirements:
        for dish in requirement.dishes:
            if dish.normative_contributions:
                continue
            lines = [
                IngredientLine(
                    key=row.key,
                    ingredient_id=row.ingredient_id,
                    name=row.ingredient_name,
                    net_per_person_g=cell.net_per_person_g,
                )
                for row in requirement.ingredient_rows
                for cell in row.cells
                if cell.menu_item_id == dish.menu_item_id
            ]
            dish.normative_contributions = ingredient_contribution_snapshots(
                lines,
                catalog_by_id=catalog_by_id,
                catalog_by_name=catalog_by_name,
                excluded_groups=set(),
                source_type=(
                    NormativeContributionSource.PRODUCT
                    if dish.kind == MenuItemKind.PRODUCT
                    else NormativeContributionSource.INGREDIENT
                ),
            )


def _build_sections(
    groups: list[SchoolGroup],
    requirements: list[MenuRequirement],
    expected: list[ExpectedRequirement],
    *,
    meal_type: MealType | None,
) -> dict[PydanticObjectId, list[ComplianceMealSectionResponse]]:
    result: dict[PydanticObjectId, list[ComplianceMealSectionResponse]] = defaultdict(list)
    requested_meals = [meal_type] if meal_type is not None else list(MealType)
    for group in groups:
        for current_meal in requested_meals:
            group_requirements = [
                item
                for item in requirements
                if item.school_group_id == group.id and item.meal_type == current_meal
            ]
            group_expected = [
                item
                for item in expected
                if item.school_group.id == group.id and item.meal_type == current_meal
            ]
            if not group_requirements and not group_expected:
                continue
            result[group.id].append(
                _build_section(group.age_group, current_meal, group_requirements, group_expected)
            )
    return result


def _validate_complete_requirement_week(
    requirements: list[MenuRequirement],
    expected: list[ExpectedRequirement],
    date_from: Date,
    date_to: Date,
) -> None:
    week_dates = {
        date_from + timedelta(days=offset)
        for offset in range((date_to - date_from).days + 1)
    }
    expected_dates = {item.service_date for item in expected}
    missing_dates = week_dates - expected_dates
    requirement_keys = {
        (item.weekly_menu_id, item.weekday, item.school_group_id)
        for item in requirements
    }
    for item in expected:
        key = (item.weekly_menu_id, item.weekday, item.school_group.id)
        if key not in requirement_keys:
            missing_dates.add(item.service_date)

    if missing_dates:
        raise NormComplianceValidationError(
            "Norm compliance requires menu requirements for all five weekdays"
        )


def _build_section(
    age_group: AgeGroup,
    meal_type: MealType,
    requirements: list[MenuRequirement],
    expected: list[ExpectedRequirement],
) -> ComplianceMealSectionResponse:
    requirement_by_key = {
        (item.weekly_menu_id, item.weekday, item.school_group_id): item for item in requirements
    }
    expected_dates = sorted({item.service_date for item in expected})
    missing_dates: set[Date] = set()
    stale_dates: set[Date] = set()
    for item in expected:
        requirement = requirement_by_key.get(
            (item.weekly_menu_id, item.weekday, item.school_group.id)
        )
        if requirement is None:
            missing_dates.add(item.service_date)
        elif hash_daily_menu(item.day) != requirement.source_day_hash:
            stale_dates.add(item.service_date)

    effective_dates = expected_dates or sorted({item.service_date for item in requirements})
    unmapped_items = _unmapped_dishes(requirements)
    rows = [
        _build_row(
            norm,
            requirements,
            missing_dates=missing_dates,
            stale_dates=stale_dates,
            unmapped_items=unmapped_items,
        )
        for norm in get_norms(meal_type, age_group)
    ]
    statuses = [row.status for row in rows]
    if missing_dates:
        statuses.append(ComplianceStatus.MISSING)
    if stale_dates:
        statuses.append(ComplianceStatus.STALE)
    if unmapped_items:
        statuses.append(ComplianceStatus.UNMAPPED)
    return ComplianceMealSectionResponse(
        meal_type=meal_type,
        status=_aggregate_status(statuses),
        expected_dates=effective_dates,
        missing_dates=sorted(missing_dates),
        stale_dates=sorted(stale_dates),
        rows=rows,
        unmapped_items=unmapped_items,
    )


def _build_row(
    norm: NutritionNorm,
    requirements: list[MenuRequirement],
    *,
    missing_dates: set[Date],
    stale_dates: set[Date],
    unmapped_items: list[UnmappedItemResponse],
) -> ComplianceRowResponse:
    actual_amount = Decimal("0")
    actual_portions = Decimal("0")
    breakdown: list[ComplianceBreakdownResponse] = []
    incompatible = False
    for requirement in requirements:
        for dish in requirement.dishes:
            for contribution in dish.normative_contributions:
                if contribution.group_code != norm.group_code:
                    continue
                if not _is_countable_contribution(contribution):
                    continue
                value = contribution_value(contribution, norm)
                if value is None:
                    incompatible = True
                    continue
                comparison_amount, portions = value
                actual_amount += comparison_amount
                actual_portions += portions
                breakdown.append(
                    ComplianceBreakdownResponse(
                        requirement_id=requirement.id,
                        service_date=requirement.service_date,
                        menu_item_id=dish.menu_item_id,
                        dish_name=dish.name,
                        source_type=contribution.source_type,
                        source_id=contribution.source_id,
                        source_name=contribution.source_name,
                        amount=contribution.amount,
                        unit=contribution.unit,
                        portion_equivalent=contribution.portion_equivalent,
                    )
                )

    required_amount = norm.required_amount_per_week
    required_portions = norm.weekly_portions
    numeric_status, percent = calculate_numeric_status(
        actual_amount,
        required_amount,
        minimum_percent=norm.tolerance.minimum_percent,
        maximum_percent=norm.tolerance.maximum_percent,
    )
    issue_statuses: list[ComplianceStatus] = []
    if missing_dates:
        issue_statuses.append(ComplianceStatus.MISSING)
    if stale_dates:
        issue_statuses.append(ComplianceStatus.STALE)
    if incompatible or (unmapped_items and not breakdown):
        issue_statuses.append(ComplianceStatus.UNMAPPED)
    status = _row_status(numeric_status, issue_statuses)
    return ComplianceRowResponse(
        normative_group_code=norm.group_code,
        normative_group_name=norm.group_name,
        characteristic=norm.characteristic,
        frequency=norm.frequency,
        source_appendix=norm.source_appendix,
        required_portions=required_portions,
        actual_portions=actual_portions,
        required_amount=required_amount,
        actual_amount=actual_amount,
        unit=norm.comparison_unit,
        percent=percent,
        deviation=actual_amount - required_amount,
        status=status,
        tolerance=ToleranceInfoResponse(
            minimum_percent=norm.tolerance.minimum_percent,
            maximum_percent=norm.tolerance.maximum_percent,
            description=norm.tolerance.description,
        ),
        breakdown=breakdown,
        unmapped_items=unmapped_items
        if status in {ComplianceStatus.UNMAPPED, ComplianceStatus.MIXED}
        else [],
    )


def _unmapped_dishes(requirements: list[MenuRequirement]) -> list[UnmappedItemResponse]:
    return [
        UnmappedItemResponse(
            requirement_id=requirement.id,
            service_date=requirement.service_date,
            menu_item_id=dish.menu_item_id,
            item_name=dish.name,
            reason="No normative contribution snapshot is available",
        )
        for requirement in requirements
        for dish in requirement.dishes
        if not dish.normative_contributions
    ]


def _is_countable_contribution(contribution: NormativeContributionSnapshot) -> bool:
    if contribution.source_type not in {
        NormativeContributionSource.INGREDIENT,
        NormativeContributionSource.PRODUCT,
    }:
        return True

    normalized_source_name = normalize_lookup_text(contribution.source_name)
    if (
        contribution.source_type == NormativeContributionSource.INGREDIENT
        and normalized_source_name in INGREDIENTS_NOT_COUNTED_SEPARATELY
    ):
        return False

    rule = get_ingredient_norm_rule(normalized_source_name)
    if rule is None or not rule.whole_items:
        return True

    whole_amount = contribution.amount.to_integral_value(rounding=ROUND_FLOOR)
    return contribution.amount == whole_amount and contribution.amount > 0


async def _find_requirements(
    school_id: PydanticObjectId,
    date_from: Date,
    date_to: Date,
    *,
    meal_type: MealType | None,
    school_group_id: PydanticObjectId | None,
) -> list[MenuRequirement]:
    filters: dict = {
        "school_id": school_id,
        "service_date": {"$gte": date_from, "$lte": date_to},
    }
    if meal_type is not None:
        filters["meal_type"] = meal_type.value
    if school_group_id is not None:
        filters["school_group_id"] = school_group_id
    return await MenuRequirement.find(filters).sort("+service_date").to_list()


async def _find_expected_requirements(
    school_id: PydanticObjectId,
    groups: list[SchoolGroup],
    date_from: Date,
    date_to: Date,
    *,
    meal_type: MealType | None,
) -> list[ExpectedRequirement]:
    filters: dict = {"school_id": school_id, "status": WeeklyMenuStatus.PUBLISHED.value}
    if meal_type is not None:
        filters["meal_type"] = meal_type.value
    menus = await WeeklyMenu.find(filters).to_list()
    groups_by_id = {group.id: group for group in groups}
    result: list[ExpectedRequirement] = []
    for menu in menus:
        for day in menu.days:
            service_date = _service_date(menu, day)
            if service_date is None or not date_from <= service_date <= date_to:
                continue
            served_group_ids = {
                serving.school_group_id
                for item in day.items
                for serving in item.servings
                if serving.children_count > 0 and serving.school_group_id in groups_by_id
            }
            for group_id in served_group_ids:
                result.append(
                    ExpectedRequirement(
                        weekly_menu_id=menu.id,
                        weekday=day.weekday,
                        service_date=service_date,
                        meal_type=menu.meal_type,
                        school_group=groups_by_id[group_id],
                        day=day,
                    )
                )
    return result


def _service_date(menu: WeeklyMenu, day: DailyMenu) -> Date | None:
    if day.date is not None:
        return day.date
    if menu.starts_on is not None:
        return menu.starts_on + timedelta(days=list(Weekday).index(day.weekday))
    return None


def _validate_range(date_from: Date, date_to: Date) -> None:
    if date_to < date_from:
        raise NormComplianceValidationError("date_to cannot be before date_from")
    if date_from.weekday() != 0 or date_to != date_from + timedelta(days=4):
        raise NormComplianceValidationError(
            "Norm compliance report must cover one Monday-to-Friday week"
        )


async def _get_accessible_school(current_user: User, school_id: PydanticObjectId) -> School:
    if current_user.role not in {UserRole.OWNER, UserRole.ADMIN, UserRole.TECHNOLOGIST}:
        raise NormComplianceAccessDeniedError("Norm compliance access denied")
    school = await School.get(school_id)
    if school is None:
        raise NormComplianceNotFoundError("School not found")
    if current_user.role == UserRole.ADMIN:
        if school.admin_owner_id != current_user.id:
            raise NormComplianceAccessDeniedError("School access denied")
    return school


def _aggregate_status(statuses: list[ComplianceStatus]) -> ComplianceStatus:
    unique = set(statuses)
    if not unique:
        return ComplianceStatus.COMPLETE
    if len(unique) == 1:
        return next(iter(unique))
    return ComplianceStatus.MIXED


def _row_status(
    numeric_status: ComplianceStatus,
    issue_statuses: list[ComplianceStatus],
) -> ComplianceStatus:
    unique_issues = set(issue_statuses)
    if len(unique_issues) > 1:
        return ComplianceStatus.MIXED
    if unique_issues:
        return next(iter(unique_issues))
    return numeric_status
