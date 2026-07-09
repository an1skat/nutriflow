import hashlib
import json
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
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MenuItemKind,
    Weekday,
    WeeklyMenu,
    WeeklyMenuStatus,
)
from app.modules.recipe.models import (
    DishCardVersion,
    DishCardVersionStatus,
    Ingredient,
    IngredientAmount,
    normalize_lookup_text,
)


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
class IngredientLine:
    key: str
    ingredient_id: PydanticObjectId | None
    name: str
    net_per_person_g: Decimal


@dataclass(frozen=True)
class DishCalculation:
    dish: MenuRequirementDish
    ingredient_lines: list[IngredientLine]


async def generate_menu_requirements(
    weekly_menu_id: PydanticObjectId,
    weekday: Weekday,
    current_user: User,
) -> list[MenuRequirement]:
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

    service_date = resolve_service_date(menu, day)
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
                service_date=service_date,
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
            requirement.service_date = service_date
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

    return sorted(requirements, key=lambda item: item.school_group_name.casefold())


async def list_menu_requirements(
    current_user: User,
    *,
    offset: int,
    limit: int,
    weekly_menu_id: PydanticObjectId | None = None,
    school_group_id: PydanticObjectId | None = None,
    service_date: Date | None = None,
) -> tuple[list[MenuRequirement], int]:
    _ensure_school_user(current_user)
    filters: dict[str, Any] = {"school_id": current_user.school_id}
    if weekly_menu_id is not None:
        filters["weekly_menu_id"] = weekly_menu_id
    if school_group_id is not None:
        filters["school_group_id"] = school_group_id
    if service_date is not None:
        filters["service_date"] = service_date

    cursor = MenuRequirement.find(filters)
    total = await cursor.count()
    items = (
        await cursor.sort("-service_date", "+school_group_name")
        .skip(offset)
        .limit(limit)
        .to_list()
    )
    return items, total


async def get_menu_requirement(
    requirement_id: PydanticObjectId,
    current_user: User,
) -> MenuRequirement:
    _ensure_school_user(current_user)
    requirement = await MenuRequirement.get(requirement_id)
    if requirement is None:
        raise MenuRequirementNotFoundError("Menu requirement not found")
    if requirement.school_id != current_user.school_id:
        raise MenuRequirementAccessDeniedError("School access denied")
    return requirement


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
            (
                cell.net_per_person_g * children_by_dish[cell.menu_item_id]
                for cell in cells
            ),
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


def resolve_service_date(menu: WeeklyMenu, day: DailyMenu) -> Date:
    if day.date is not None:
        return day.date
    if menu.starts_on is not None:
        return menu.starts_on + timedelta(days=list(Weekday).index(day.weekday))
    raise MenuRequirementValidationError(
        "Daily menu date is required to generate a menu requirement"
    )


def hash_daily_menu(day: DailyMenu) -> str:
    canonical = json.dumps(
        day.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def ingredient_key(ingredient_id: PydanticObjectId | None, name: str) -> str:
    if ingredient_id is not None:
        return f"ingredient:{ingredient_id}"
    return f"snapshot:{normalize_lookup_text(name)}"


def _ensure_school_user(current_user: User) -> None:
    if current_user.role != UserRole.SCHOOL_USER or current_user.school_id is None:
        raise MenuRequirementAccessDeniedError("Only school users can access menu requirements")


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
            (
                candidate
                for candidate in item.servings
                if candidate.school_group_id == group.id
            ),
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

        dish = MenuRequirementDish(
            menu_item_id=item.id,
            position=item.position,
            kind=item.kind,
            name=item.name,
            recipe_card_number=item.recipe_card_number,
            dish_card_id=item.dish_card_id,
            dish_card_version_id=item.dish_card_version_id,
            portion_variant_id=portion.dish_card_portion_variant_id,
            product_ingredient_id=item.product_ingredient_id,
            yield_amount=portion.yield_amount,
            children_count=serving.children_count,
        )
        if item.kind == MenuItemKind.PRODUCT:
            lines = await _product_ingredient_lines(
                item,
                portion.yield_amount,
                catalog_by_id=catalog_by_id,
                catalog_by_name=catalog_by_name,
            )
        else:
            lines = await _dish_card_ingredient_lines(
                item,
                portion.dish_card_portion_variant_id,
                catalog_by_id=catalog_by_id,
                catalog_by_name=catalog_by_name,
            )
        calculations.append(DishCalculation(dish=dish, ingredient_lines=lines))

    return calculations


async def _dish_card_ingredient_lines(
    item: DailyMenuItem,
    portion_variant_id: PydanticObjectId | None,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> list[IngredientLine]:
    if item.dish_card_version_id is None:
        raise MenuRequirementValidationError(
            f'Dish "{item.name}" must reference a dish card version'
        )
    if portion_variant_id is None:
        raise MenuRequirementValidationError(
            f'Dish "{item.name}" must reference a portion variant'
        )

    version = await DishCardVersion.get(item.dish_card_version_id)
    if version is None:
        raise MenuRequirementValidationError(
            f'Dish card version for "{item.name}" was not found'
        )
    if version.status not in {
        DishCardVersionStatus.CONFIRMED,
        DishCardVersionStatus.ARCHIVED,
    }:
        raise MenuRequirementValidationError(
            f'Dish card version for "{item.name}" is not confirmed'
        )
    if not any(variant.id == portion_variant_id for variant in version.portion_variants):
        raise MenuRequirementValidationError(
            f'Portion variant for "{item.name}" was not found'
        )

    amounts = [
        amount
        for amount in version.ingredient_amounts
        if amount.portion_variant_id == portion_variant_id
    ]
    if not amounts:
        raise MenuRequirementValidationError(
            f'Dish "{item.name}" has no ingredients for the selected portion'
        )
    return [
        _ingredient_line(
            amount,
            catalog_by_id=catalog_by_id,
            catalog_by_name=catalog_by_name,
        )
        for amount in amounts
    ]


async def _product_ingredient_lines(
    item: DailyMenuItem,
    yield_amount: str,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> list[IngredientLine]:
    try:
        amount = Decimal(yield_amount.strip().replace(",", "."))
    except InvalidOperation as exc:
        raise MenuRequirementValidationError(
            f'Product "{item.name}" must have a single numeric yield in grams'
        ) from exc
    if amount < 0:
        raise MenuRequirementValidationError(
            f'Product "{item.name}" cannot have a negative yield'
        )

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
    return [
        IngredientLine(
            key=ingredient_key(ingredient_id, name),
            ingredient_id=ingredient_id,
            name=name,
            net_per_person_g=amount,
        )
    ]


def _ingredient_line(
    amount: IngredientAmount,
    *,
    catalog_by_id: dict[PydanticObjectId, Ingredient],
    catalog_by_name: dict[str, Ingredient],
) -> IngredientLine:
    ingredient = (
        catalog_by_id.get(amount.ingredient_id)
        if amount.ingredient_id is not None
        else None
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
