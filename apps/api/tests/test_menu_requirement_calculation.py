from datetime import date
from decimal import Decimal

import pytest
from beanie import PydanticObjectId

from app.modules.menu_requirements.models import MenuRequirementDish
from app.modules.menu_requirements.service import (
    DishCalculation,
    IngredientCatalogEntry,
    MenuRequirementValidationError,
    build_ingredient_rows,
    convert_to_grams,
    resolve_service_date,
)
from app.modules.menus.models import DailyMenu, MenuItemKind, Weekday, WeeklyMenu
from app.modules.nutrition.contributions import IngredientLine

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
    unused_id = PydanticObjectId()
    first_dish = make_dish(position=1, name="Перша страва", children_count=10)
    second_dish = make_dish(position=2, name="Друга страва", children_count=7)

    rows = build_ingredient_rows(
        [
            IngredientCatalogEntry(
                key=f"ingredient:{salt_id}",
                ingredient_id=salt_id,
                name="Сіль",
            ),
            IngredientCatalogEntry(
                key=f"ingredient:{unused_id}",
                ingredient_id=unused_id,
                name="Цукор",
            ),
        ],
        [
            DishCalculation(
                dish=first_dish,
                ingredient_lines=[
                    IngredientLine(
                        key=f"ingredient:{salt_id}",
                        ingredient_id=salt_id,
                        name="Сіль",
                        net_per_person_g=Decimal("3.2"),
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
                    )
                ],
            ),
        ],
    )

    salt = next(row for row in rows if row.ingredient_id == salt_id)
    unused = next(row for row in rows if row.ingredient_id == unused_id)

    assert [cell.net_per_person_g for cell in salt.cells] == [
        Decimal("3.2"),
        Decimal("5.1"),
    ]
    assert salt.per_person_total_g == Decimal("8.3")
    assert salt.issue_total_raw_g == Decimal("67.7")
    assert salt.issue_total_rounded_g == 68
    assert unused.cells == []
    assert unused.per_person_total_g == Decimal("0")
    assert unused.issue_total_rounded_g == 0


def test_sums_duplicate_ingredient_lines_inside_one_dish() -> None:
    ingredient_id = PydanticObjectId()
    dish = make_dish(position=1, name="Страва", children_count=2)

    rows = build_ingredient_rows(
        [],
        [
            DishCalculation(
                dish=dish,
                ingredient_lines=[
                    IngredientLine(
                        key=f"ingredient:{ingredient_id}",
                        ingredient_id=ingredient_id,
                        name="Морква",
                        net_per_person_g=Decimal("10.25"),
                    ),
                    IngredientLine(
                        key=f"ingredient:{ingredient_id}",
                        ingredient_id=ingredient_id,
                        name="Морква",
                        net_per_person_g=Decimal("2.75"),
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
