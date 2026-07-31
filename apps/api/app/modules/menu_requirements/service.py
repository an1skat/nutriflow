import asyncio
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from datetime import date as Date
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from typing import Any

from beanie import PydanticObjectId

from app.modules.identity.models import School, SchoolGroup, User, UserRole
from app.modules.menu_requirements.access import (
    allowed_school_ids as _allowed_school_ids,
)
from app.modules.menu_requirements.access import (
    can_access_school as _can_access_school,
)
from app.modules.menu_requirements.errors import (
    MenuRequirementAccessDeniedError,
    MenuRequirementNotFoundError,
    MenuRequirementValidationError,
)
from app.modules.menu_requirements.models import (
    MenuRequirement,
    MenuRequirementCell,
    MenuRequirementDish,
    MenuRequirementIngredientRow,
)
from app.modules.menu_requirements.reporting import (
    _menu_day_service_date as _menu_day_service_date,
)
from app.modules.menu_requirements.reporting import (
    get_menu_requirement_calendar as get_menu_requirement_calendar,
)
from app.modules.menu_requirements.reporting import (
    get_menu_requirement_report as get_menu_requirement_report,
)
from app.modules.menu_requirements.schemas import (
    MenuRequirementAmountBasis,
    MenuRequirementReportGranularity,
)
from app.modules.menu_requirements.utils import (
    hash_daily_menu,
    ingredient_key,
    resolve_service_date,
    select_eligible_groups,
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
    MenuPortion,
    MenuPortionCalculationSource,
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
    NormativeGroupCode,
    NormativeUnit,
)
from app.modules.recipe.models import (
    DishCardVersion,
    DishCardVersionStatus,
    Ingredient,
    IngredientAmount,
    PortionVariant,
    normalize_lookup_text,
    parse_menu_yield_grams,
    resolve_portion_variant_by_yield,
)


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
    eligible_groups = select_eligible_groups(day, groups_by_id)
    if not eligible_groups:
        raise MenuRequirementValidationError(
            "At least one dish must have a children count greater than zero"
        )

    catalog = await Ingredient.find({"is_active": True}).sort("+normalized_name").to_list()
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
            service_date=resolved_service_date,
            catalog_by_id=catalog_by_id,
            catalog_by_name=catalog_by_name,
        )
        prepared.append(
            (
                group,
                [calculation.dish for calculation in calculations],
                build_ingredient_rows(calculations),
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


async def export_menu_requirement_workbook(
    requirement_id: PydanticObjectId,
    current_user: User,
    *,
    amount_basis: MenuRequirementAmountBasis = MenuRequirementAmountBasis.NET,
) -> tuple[str, bytes]:
    record = await get_menu_requirement(requirement_id, current_user)
    content = await asyncio.to_thread(
        build_menu_requirement_workbook,
        record.requirement,
        school_name=record.school_name,
        amount_basis=amount_basis,
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
    amount_basis: MenuRequirementAmountBasis = MenuRequirementAmountBasis.NET,
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
    content = await asyncio.to_thread(
        build_menu_requirement_report_workbook,
        report,
        amount_basis=amount_basis,
    )
    filename = _xlsx_filename(
        "menu-requirement",
        report.school_name,
        report.date_from.isoformat(),
        report.date_to.isoformat(),
    )
    return filename, content


def build_ingredient_rows(
    calculations: list[DishCalculation],
) -> list[MenuRequirementIngredientRow]:
    rows: dict[str, IngredientCatalogEntry] = {}
    net_amounts_by_row: dict[str, dict[PydanticObjectId, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0"))
    )
    gross_amounts_by_row: dict[str, dict[PydanticObjectId, Decimal]] = defaultdict(
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
            net_amounts_by_row[line.key][
                calculation.dish.menu_item_id
            ] += line.net_per_person_g
            if line.gross_per_person_g is not None:
                gross_amounts_by_row[line.key][
                    calculation.dish.menu_item_id
                ] += line.gross_per_person_g

    result: list[MenuRequirementIngredientRow] = []
    for entry in sorted(rows.values(), key=lambda item: (item.name.casefold(), item.key)):
        cells = [
            MenuRequirementCell(
                menu_item_id=calculation.dish.menu_item_id,
                net_per_person_g=net_amounts_by_row[entry.key][calculation.dish.menu_item_id],
                gross_per_person_g=(
                    gross_amounts_by_row[entry.key][calculation.dish.menu_item_id]
                    if calculation.dish.menu_item_id in gross_amounts_by_row[entry.key]
                    else None
                ),
            )
            for calculation in calculations
            if (
                calculation.dish.menu_item_id in net_amounts_by_row[entry.key]
                or calculation.dish.menu_item_id in gross_amounts_by_row[entry.key]
            )
        ]
        row = _build_ingredient_row(
            key=entry.key,
            ingredient_id=entry.ingredient_id,
            ingredient_name=entry.name,
            cells=cells,
            children_by_dish=children_by_dish,
        )
        if row.has_values():
            result.append(row)
    return result


def convert_to_grams(value: Decimal, unit: str) -> Decimal:
    normalized = normalize_lookup_text(unit).replace(".", "")
    if normalized in {"g", "gr", "gram", "grams", "г", "гр", "грам", "грами"}:
        return value
    if normalized in {"kg", "кг", "кілограм", "кілограми"}:
        return value * Decimal("1000")
    raise MenuRequirementValidationError(f'Unit "{unit}" cannot be converted to grams')


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
    rows_by_key = {
        row.key: row for row in requirement.ingredient_rows if row.has_values()
    }
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
        original_cells = {cell.menu_item_id: cell for cell in original.cells}
        cell_ids = [cell.menu_item_id for cell in row_update.cells]
        if _duplicates(cell_ids):
            raise MenuRequirementValidationError("Ingredient row contains duplicate dish cells")
        if not set(cell_ids).issubset(dish_ids):
            raise MenuRequirementValidationError("Ingredient row references unknown dish")

        cells = [
            MenuRequirementCell(
                menu_item_id=cell.menu_item_id,
                net_per_person_g=cell.net_per_person_g,
                gross_per_person_g=(
                    cell.gross_per_person_g
                    if cell.gross_per_person_g is not None
                    else (
                        original_cells[cell.menu_item_id].gross_per_person_g
                        if cell.menu_item_id in original_cells
                        else None
                    )
                ),
            )
            for cell in row_update.cells
        ]
        row = _build_ingredient_row(
            key=original.key,
            ingredient_id=original.ingredient_id,
            ingredient_name=row_update.ingredient_name,
            cells=cells,
            children_by_dish=children_by_dish,
        )
        if row.has_values():
            updated_rows.append(row)

    return updated_rows


def _build_ingredient_row(
    *,
    key: str,
    ingredient_id: PydanticObjectId | None,
    ingredient_name: str,
    cells: list[MenuRequirementCell],
    children_by_dish: dict[PydanticObjectId, int],
) -> MenuRequirementIngredientRow:
    cells = [
        cell
        for cell in cells
        if cell.net_per_person_g != Decimal("0")
        or (
            cell.gross_per_person_g is not None
            and cell.gross_per_person_g != Decimal("0")
        )
    ]
    per_person_total = sum(
        (cell.net_per_person_g for cell in cells),
        start=Decimal("0"),
    )
    issue_total_raw = sum(
        (cell.net_per_person_g * children_by_dish[cell.menu_item_id] for cell in cells),
        start=Decimal("0"),
    )
    gross_available = all(cell.gross_per_person_g is not None for cell in cells)
    gross_per_person_total = (
        sum(
            (cell.gross_per_person_g for cell in cells if cell.gross_per_person_g is not None),
            start=Decimal("0"),
        )
        if gross_available
        else None
    )
    gross_issue_total_raw = (
        sum(
            (
                cell.gross_per_person_g * children_by_dish[cell.menu_item_id]
                for cell in cells
                if cell.gross_per_person_g is not None
            ),
            start=Decimal("0"),
        )
        if gross_available
        else None
    )
    return MenuRequirementIngredientRow(
        key=key,
        ingredient_id=ingredient_id,
        ingredient_name=ingredient_name,
        cells=cells,
        per_person_total_g=per_person_total,
        issue_total_raw_g=issue_total_raw,
        issue_total_rounded_g=int(issue_total_raw.to_integral_value(rounding=ROUND_CEILING)),
        gross_per_person_total_g=gross_per_person_total,
        gross_issue_total_raw_g=gross_issue_total_raw,
        gross_issue_total_rounded_g=(
            int(gross_issue_total_raw.to_integral_value(rounding=ROUND_CEILING))
            if gross_issue_total_raw is not None
            else None
        ),
    )


def _duplicates(values: list[Any]) -> set[Any]:
    seen: set[Any] = set()
    duplicates: set[Any] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


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


async def _build_dish_calculations(
    day: DailyMenu,
    group: SchoolGroup,
    *,
    service_date: Date,
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
                portion,
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
                portion.calculated_from,
                portion.yield_amount,
                service_date=service_date,
                catalog_by_id=catalog_by_id,
                catalog_by_name=catalog_by_name,
            )
            ready_portion = _ready_dish_contribution_snapshot(item, portion)
            if ready_portion is not None:
                normative_contributions = [
                    ready_portion,
                    *[
                        contribution
                        for contribution in normative_contributions
                        if contribution.group_code != ready_portion.group_code
                    ],
                ]

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
    calculated_from: MenuPortionCalculationSource | None,
    yield_amount: str,
    *,
    service_date: Date,
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

    variant, factor = _resolve_requirement_portion_variant(
        version,
        portion_variant_id,
        calculated_from,
        yield_amount,
        item.name,
    )

    amounts = _select_seasonal_amounts(
        [
            amount
            for amount in version.ingredient_amounts
            if amount.portion_variant_id == variant.id
        ],
        service_date,
    )

    if not amounts:
        raise MenuRequirementValidationError(
            f'Dish "{item.name}" has no ingredients for the selected portion'
        )

    lines = [
        _ingredient_line(
            amount,
            factor=factor,
            catalog_by_id=catalog_by_id,
            catalog_by_name=catalog_by_name,
        )
        for amount in amounts
    ]
    explicit = _portion_variant_contribution_snapshots(
        variant,
        item.name,
        factor=factor,
    )
    fallback = ingredient_contribution_snapshots(
        lines,
        catalog_by_id=catalog_by_id,
        catalog_by_name=catalog_by_name,
        excluded_groups={item.group_code for item in explicit},
        source_type=NormativeContributionSource.INGREDIENT,
    )
    return variant.id, lines, [*explicit, *fallback]


def _resolve_requirement_portion_variant(
    version: DishCardVersion,
    portion_variant_id: PydanticObjectId | None,
    calculated_from: MenuPortionCalculationSource | None,
    yield_amount: str,
    dish_name: str,
) -> tuple[PortionVariant, Decimal]:
    if calculated_from is not None:
        variant = next(
            (
                candidate
                for candidate in version.portion_variants
                if candidate.id == calculated_from.portion_variant_id
            ),
            None,
        )
        target = parse_menu_yield_grams(yield_amount)
        source = parse_menu_yield_grams(calculated_from.yield_amount)
        if variant is None:
            raise MenuRequirementValidationError(
                f'Calculation source for dish "{dish_name}" was not found'
            )
        if target is None or source is None or target <= 0 or source <= 0:
            raise MenuRequirementValidationError(
                f'Dish "{dish_name}" has invalid calculated portion data'
            )
        return variant, target / source

    resolution = resolve_portion_variant_by_yield(
        version.portion_variants,
        yield_amount,
        preferred_variant_id=portion_variant_id,
    )
    if resolution is None:
        raise MenuRequirementValidationError(
            f'Dish "{dish_name}" has no portion variant for output {yield_amount} g'
        )
    return resolution.variant, resolution.factor


async def _product_ingredient_lines(
    item: DailyMenuItem,
    portion: MenuPortion,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> tuple[list[IngredientLine], list[NormativeContributionSnapshot]]:
    try:
        amount = Decimal(portion.yield_amount.strip().replace(",", "."))
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
            gross_per_person_g=amount,
        )
    ]
    explicit = _menu_portion_contribution_snapshots(portion, item)
    fallback = ingredient_contribution_snapshots(
        lines,
        catalog_by_id=catalog_by_id,
        catalog_by_name=catalog_by_name,
        excluded_groups={contribution.group_code for contribution in explicit},
        source_type=NormativeContributionSource.PRODUCT,
    )
    return lines, [*explicit, *fallback]


def _menu_portion_contribution_snapshots(
    portion: MenuPortion,
    item: DailyMenuItem,
) -> list[NormativeContributionSnapshot]:
    return [
        NormativeContributionSnapshot(
            group_code=contribution.group_code,
            amount=contribution.amount,
            unit=contribution.unit,
            portion_equivalent=contribution.portion_equivalent,
            product_variant=contribution.product_variant,
            source_type=NormativeContributionSource.PRODUCT,
            source_id=str(item.id),
            source_name=item.name,
        )
        for contribution in portion.normative_contributions
        if contribution.basis == NormativeContributionBasis.PER_PORTION
    ]


def _ready_dish_contribution_snapshot(
    item: DailyMenuItem,
    portion: MenuPortion,
) -> NormativeContributionSnapshot | None:
    name = normalize_lookup_text(item.name)
    group_code = (
        NormativeGroupCode.POTATOES
        if "картопля" in name
        else NormativeGroupCode.CEREALS_GRAINS_LEGUMES
        if any(term in name for term in ("каша", "макарони", "запіканка рисова"))
        else None
    )
    output = parse_menu_yield_grams(portion.yield_amount)
    if group_code is None or output is None or output <= 0:
        return None
    return NormativeContributionSnapshot(
        group_code=group_code,
        amount=output,
        unit=NormativeUnit.GRAM,
        portion_equivalent=Decimal("1"),
        source_type=NormativeContributionSource.PORTION_VARIANT,
        source_id=str(item.id),
        source_name=item.name,
    )


def _select_seasonal_amounts(
    amounts: list[IngredientAmount],
    service_date: Date,
) -> list[IngredientAmount]:
    grouped: dict[str, list[IngredientAmount]] = defaultdict(list)
    for amount in amounts:
        key = re.sub(
            r"\s+(?:до|з)\s+\d{2}\.\d{2}\.?\s*(?:по\s+\d{2}(?:-\d{2})?\.\d{2}\.)?",
            "",
            normalize_lookup_text(amount.ingredient_name_snapshot),
        )
        key = key.replace("грунтові", "").replace("теплично-парникові", "")
        grouped[" ".join(key.split())].append(amount)

    selected: list[IngredientAmount] = []
    for candidates in grouped.values():
        if len(candidates) == 1:
            selected.extend(candidates)
            continue
        matched = next(
            (
                item
                for item in candidates
                if _is_in_ingredient_season(item.ingredient_name_snapshot, service_date)
            ),
            None,
        )
        if matched is not None:
            selected.append(matched)
            continue
        if any("грунтові" in item.ingredient_name_snapshot.casefold() for item in candidates):
            selected.append(
                next(
                    item
                    for item in candidates
                    if ("грунтові" in item.ingredient_name_snapshot.casefold())
                    == (5 <= service_date.month <= 9)
                )
            )
            continue
        selected.append(candidates[0])
    return selected


def _is_in_ingredient_season(name: str, service_date: Date) -> bool:
    normalized = normalize_lookup_text(name)
    range_match = re.search(
        r"з\s+(\d{2})\.(\d{2})\.?\s+по\s+(\d{2})(?:-\d{2})?\.(\d{2})\.?",
        normalized,
    )
    if range_match is not None:
        start = (int(range_match.group(2)), int(range_match.group(1)))
        end = (int(range_match.group(4)), int(range_match.group(3)))
        current = (service_date.month, service_date.day)
        return start <= current <= end if start <= end else current >= start or current <= end
    start_match = re.search(r"з\s+(\d{2})\.(\d{2})", normalized)
    if start_match is not None:
        return (service_date.month, service_date.day) >= (
            int(start_match.group(2)),
            int(start_match.group(1)),
        )
    end_match = re.search(r"до\s+(\d{2})\.(\d{2})", normalized)
    if end_match is not None:
        return (service_date.month, service_date.day) < (
            int(end_match.group(2)),
            int(end_match.group(1)),
        )
    return False


def _portion_variant_contribution_snapshots(
    variant: PortionVariant,
    dish_name: str,
    *,
    factor: Decimal = Decimal("1"),
) -> list[NormativeContributionSnapshot]:
    return [
        NormativeContributionSnapshot(
            group_code=contribution.group_code,
            amount=contribution.amount * factor,
            unit=contribution.unit,
            portion_equivalent=(
                contribution.portion_equivalent * factor
                if contribution.portion_equivalent is not None
                else None
            ),
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
    factor: Decimal = Decimal("1"),
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
        net_per_person_g=convert_to_grams(amount.net_amount, amount.unit) * factor,
        gross_per_person_g=convert_to_grams(amount.gross_amount, amount.unit) * factor,
    )


def _catalog_by_normalized_name(catalog: list[Ingredient]) -> dict[str, Ingredient]:
    result: dict[str, Ingredient] = {}
    for ingredient in catalog:
        current = result.get(ingredient.normalized_name)
        if current is None or ingredient.unit in {"g", "г", "гр"}:
            result[ingredient.normalized_name] = ingredient
    return result
