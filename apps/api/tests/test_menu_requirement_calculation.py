from datetime import date
from decimal import Decimal

import pytest
from beanie import PydanticObjectId

from app.modules.menu_requirements.models import MenuRequirementDish
from app.modules.menu_requirements.service import (
    DishCalculation,
    MenuRequirementValidationError,
    _product_ingredient_lines,
    _resolve_requirement_portion_variant,
    build_ingredient_rows,
    convert_to_grams,
    resolve_service_date,
)
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MenuItemKind,
    MenuPortion,
    MenuPortionCalculationSource,
    Weekday,
    WeeklyMenu,
)
from app.modules.nutrition.contributions import IngredientLine
from app.modules.recipe.models import DishCardVersion, PortionVariant

pytestmark = pytest.mark.no_clean_database


def make_dish(
    *,
    position: int,
    name: str,
    children_count: int,
) -> MenuRequirementDish:
    return MenuRequirementDish(
        menu_item_id=PydanticObjectId(),
        position=position,
        kind=MenuItemKind.DISH_CARD,
        name=name,
        yield_amount="100",
        children_count=children_count,
    )


def test_builds_matrix_totals_with_per_dish_children_counts() -> None:
    salt_id = PydanticObjectId()
    first_dish = make_dish(position=1, name="Перша страва", children_count=10)
    second_dish = make_dish(position=2, name="Друга страва", children_count=7)

    rows = build_ingredient_rows(
        [
            DishCalculation(
                dish=first_dish,
                ingredient_lines=[
                    IngredientLine(
                        key=f"ingredient:{salt_id}",
                        ingredient_id=salt_id,
                        name="Сіль",
                        net_per_person_g=Decimal("3.2"),
                        gross_per_person_g=Decimal("4"),
                    )
                ],
            ),
            DishCalculation(
                dish=second_dish,
                ingredient_lines=[
                    IngredientLine(
                        key=f"ingredient:{salt_id}",
                        ingredient_id=salt_id,
                        name="Сіль",
                        net_per_person_g=Decimal("5.1"),
                        gross_per_person_g=Decimal("6"),
                    )
                ],
            ),
        ],
    )

    salt = next(row for row in rows if row.ingredient_id == salt_id)

    assert [cell.net_per_person_g for cell in salt.cells] == [
        Decimal("3.2"),
        Decimal("5.1"),
    ]
    assert [cell.gross_per_person_g for cell in salt.cells] == [
        Decimal("4"),
        Decimal("6"),
    ]
    assert salt.per_person_total_g == Decimal("8.3")
    assert salt.issue_total_raw_g == Decimal("67.7")
    assert salt.issue_total_rounded_g == 68
    assert salt.gross_per_person_total_g == Decimal("10")
    assert salt.gross_issue_total_raw_g == Decimal("82")
    assert salt.gross_issue_total_rounded_g == 82
    assert len(rows) == 1


def test_sums_duplicate_ingredient_lines_inside_one_dish() -> None:
    ingredient_id = PydanticObjectId()
    dish = make_dish(position=1, name="Страва", children_count=2)

    rows = build_ingredient_rows(
        [
            DishCalculation(
                dish=dish,
                ingredient_lines=[
                    IngredientLine(
                        key=f"ingredient:{ingredient_id}",
                        ingredient_id=ingredient_id,
                        name="Морква",
                        net_per_person_g=Decimal("10.25"),
                        gross_per_person_g=Decimal("12.5"),
                    ),
                    IngredientLine(
                        key=f"ingredient:{ingredient_id}",
                        ingredient_id=ingredient_id,
                        name="Морква",
                        net_per_person_g=Decimal("2.75"),
                        gross_per_person_g=Decimal("3.5"),
                    ),
                ],
            )
        ],
    )

    assert len(rows) == 1
    assert rows[0].cells[0].net_per_person_g == Decimal("13.00")
    assert rows[0].per_person_total_g == Decimal("13.00")
    assert rows[0].issue_total_raw_g == Decimal("26.00")
    assert rows[0].issue_total_rounded_g == 26
    assert rows[0].cells[0].gross_per_person_g == Decimal("16.0")
    assert rows[0].gross_per_person_total_g == Decimal("16.0")
    assert rows[0].gross_issue_total_raw_g == Decimal("32.0")
    assert rows[0].gross_issue_total_rounded_g == 32


@pytest.mark.parametrize(
    ("value", "unit", "expected"),
    [
        (Decimal("12.5"), "g", Decimal("12.5")),
        (Decimal("12.5"), "гр.", Decimal("12.5")),
        (Decimal("0.125"), "кг", Decimal("125.000")),
    ],
)
def test_converts_supported_units_to_grams(
    value: Decimal,
    unit: str,
    expected: Decimal,
) -> None:
    assert convert_to_grams(value, unit) == expected


def test_rejects_units_without_a_mass_conversion() -> None:
    with pytest.raises(
        MenuRequirementValidationError,
        match="cannot be converted to grams",
    ):
        convert_to_grams(Decimal("1"), "шт")


def test_resolves_saved_calculation_source_for_menu_requirement() -> None:
    source = PortionVariant(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
    )
    version = DishCardVersion.model_construct(
        dish_card_id=PydanticObjectId(),
        version=1,
        portion_variants=[source],
    )

    variant, factor = _resolve_requirement_portion_variant(
        version,
        None,
        MenuPortionCalculationSource(
            portion_variant_id=source.id,
            yield_amount="120",
        ),
        "100",
        "Суп",
    )

    assert variant.id == source.id
    assert factor == Decimal("100") / Decimal("120")


def test_uses_requested_date_when_menu_has_no_persisted_dates() -> None:
    menu = WeeklyMenu.model_construct(starts_on=None)
    day = DailyMenu.model_construct(
        weekday=Weekday.MONDAY,
        date=None,
    )

    assert resolve_service_date(menu, day, date(2026, 7, 6)) == date(
        2026,
        7,
        6,
    )


@pytest.mark.parametrize(
    ("raw_yield", "expected_grams"),
    [
        ("40", Decimal("40")),
        ("40,5", Decimal("40.5")),
        ("40.5", Decimal("40.5")),
        ("40 г", Decimal("40")),
        ("40гр", Decimal("40")),
        ("40 g", Decimal("40")),
        ("20/20", Decimal("40")),
        ("20 / 20 г", Decimal("40")),
    ],
)
async def test_product_ingredient_lines_yield_parsing(
    raw_yield: str, expected_grams: Decimal
) -> None:
    item = DailyMenuItem.model_construct(
        id=PydanticObjectId(),
        name="Хліб цільнозерновий",
        kind=MenuItemKind.PRODUCT,
        product_ingredient_id=None,
        product_name_snapshot=None,
    )
    portion = MenuPortion.model_construct(
        yield_amount=raw_yield,
        normative_contributions=[],
    )
    lines, _ = await _product_ingredient_lines(
        item,
        portion,
        catalog_by_id={},
        catalog_by_name={},
    )
    assert len(lines) == 1
    assert lines[0].net_per_person_g == expected_grams
    assert lines[0].gross_per_person_g == expected_grams
    assert lines[0].name == "Хліб цільнозерновий"


@pytest.mark.parametrize("invalid_yield", ["invalid", "", "40/abc", "невідомо"])
async def test_product_ingredient_lines_invalid_yield(invalid_yield: str) -> None:
    item = DailyMenuItem.model_construct(
        id=PydanticObjectId(),
        name="Хліб цільнозерновий",
        kind=MenuItemKind.PRODUCT,
        product_ingredient_id=None,
        product_name_snapshot=None,
    )
    portion = MenuPortion.model_construct(
        yield_amount=invalid_yield,
        normative_contributions=[],
    )
    with pytest.raises(
        MenuRequirementValidationError,
        match='Product "Хліб цільнозерновий" must have a single numeric yield in grams',
    ):
        await _product_ingredient_lines(
            item,
            portion,
            catalog_by_id={},
            catalog_by_name={},
        )

