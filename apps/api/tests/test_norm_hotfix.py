from copy import deepcopy
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from beanie import PydanticObjectId

from app.modules.identity.models import AgeGroup
from app.modules.menu_requirements.models import (
    MenuRequirement,
    MenuRequirementDish,
)
from app.modules.menu_requirements.repair_norms import repair_requirement_norms
from app.modules.menu_requirements.service import (
    DishCalculation,
    _dish_card_ingredient_lines,
    _product_ingredient_lines,
    build_ingredient_rows,
)
from app.modules.menus.models import DailyMenuItem, MealType, MenuItemKind, MenuPortion, Weekday
from app.modules.norm_compliance.service import (
    _apply_manual_ingredient_rules_from_catalog,
    _build_section,
)
from app.modules.nutrition.contributions import (
    IngredientLine,
    ingredient_contribution_snapshots,
    product_portion_contributions,
)
from app.modules.nutrition.domain import (
    NormativeContributionSource,
    NormativeGroupCode,
    NormativeUnit,
)
from app.modules.nutrition.ingredient_registry import get_ingredient_norm_rule
from app.modules.recipe.models import (
    DishCardVersion,
    DishCardVersionStatus,
    IngredientAmount,
    PortionVariant,
)
from app.scripts.repair_norm_requirements import repaired_fields

pytestmark = pytest.mark.no_clean_database

POTATOES = [
    "Картопля свіжа з 01.09 по 31.10",
    "Картопля свіжа з 01.11 по 31.12",
    "Картопля свіжа з 01.01 по 28–29.02",
    "Картопля свіжа з 01.03",
]


def requirement(dishes, rows):
    return MenuRequirement.model_construct(
        id=PydanticObjectId(),
        weekly_menu_id=PydanticObjectId(),
        school_group_id=PydanticObjectId(),
        weekday=Weekday.WEDNESDAY,
        service_date=date(2026, 9, 16),
        dishes=dishes,
        ingredient_rows=rows,
        source_day_hash="0" * 64,
        age_group=AgeGroup.SIX_TO_ELEVEN,
        meal_type=MealType.LUNCH,
    )


def dish(name="Капусняк", kind=MenuItemKind.DISH_CARD, yield_amount="200"):
    return MenuRequirementDish(
        menu_item_id=PydanticObjectId(),
        position=1,
        kind=kind,
        name=name,
        yield_amount=yield_amount,
        children_count=10,
    )


def line(name, amount="25"):
    return IngredientLine(
        key=name,
        ingredient_id=None,
        name=name,
        net_per_person_g=Decimal(amount),
        gross_per_person_g=Decimal(amount) * 2,
    )


def snapshots(lines):
    return ingredient_contribution_snapshots(
        lines,
        catalog_by_id={},
        catalog_by_name={},
        excluded_groups=set(),
        source_type=NormativeContributionSource.INGREDIENT,
    )


@pytest.mark.parametrize("name", ["Яйце відварне", "Яйце куряче"])
def test_exact_egg_names_and_existing_whole_item_semantics(name):
    result = snapshots([line(name, "40")])
    assert [(c.group_code, c.amount, c.unit) for c in result] == [
        (NormativeGroupCode.EGGS, Decimal(1), NormativeUnit.ITEM)
    ]
    assert snapshots([line(name, "8")]) == []


@pytest.mark.parametrize("name", ["Яйце відварне з соусом", "Яйце шоколадне", "Яйце відварневе"])
def test_unreviewed_names_are_not_classified(name):
    assert get_ingredient_norm_rule(name.lower()) is None
    assert snapshots([line(name, "40")]) == []


@pytest.mark.parametrize("value", ["45", "30/15/5", "-30/15", "0/15", "NaN/15"])
def test_composite_split_is_not_guessed(value):
    assert product_portion_contributions("Хліб цільнозерновий з тв.сиром", value) == []


async def test_old_menu_composite_generation_without_catalog():
    item = DailyMenuItem(
        position=1,
        name="Хліб цільнозерновий з тв.сиром",
        kind=MenuItemKind.PRODUCT,
        portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="30/15")],
    )
    lines, contributions = await _product_ingredient_lines(
        item, item.portions[0], catalog_by_id={}, catalog_by_name={}
    )
    assert lines[0].net_per_person_g == 45
    assert [(c.group_code, c.amount, c.product_variant) for c in contributions] == [
        (NormativeGroupCode.BREAD, 30, None),
        (NormativeGroupCode.DAIRY, 15, "hard_cheese"),
    ]


async def test_recipe_to_requirement_to_compliance_counts_one_potato(monkeypatch):
    variant = PortionVariant(
        id=PydanticObjectId(), age_group=AgeGroup.SIX_TO_ELEVEN, output_grams=200
    )
    card_id = PydanticObjectId()
    version = DishCardVersion.model_construct(
        id=PydanticObjectId(),
        dish_card_id=card_id,
        status=DishCardVersionStatus.CONFIRMED,
        portion_variants=[variant],
        ingredient_amounts=[
            IngredientAmount.model_construct(
                portion_variant_id=variant.id,
                ingredient_id=None,
                ingredient_name_snapshot=name,
                unit="g",
                net_amount=Decimal("25"),
                gross_amount=Decimal("50"),
            )
            for name in POTATOES
        ],
    )
    monkeypatch.setattr(DishCardVersion, "get", AsyncMock(return_value=version))
    item = DailyMenuItem(
        position=1,
        name="Капусняк",
        kind=MenuItemKind.DISH_CARD,
        dish_card_id=card_id,
        dish_card_version_id=version.id,
        portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="200")],
    )
    _, lines, contributions = await _dish_card_ingredient_lines(
        item,
        variant.id,
        None,
        "200",
        service_date=date(2026, 9, 16),
        catalog_by_id={},
        catalog_by_name={},
    )
    saved_dish = dish()
    saved_dish.normative_contributions = contributions
    req = requirement([saved_dish], build_ingredient_rows([DishCalculation(saved_dish, lines)]))
    assert len(req.ingredient_rows) == 1
    assert req.ingredient_rows[0].issue_total_raw_g == 250
    section = _build_section(req.age_group, req.meal_type, [req], [])
    row = next(r for r in section.rows if r.normative_group_code == NormativeGroupCode.POTATOES)
    assert row.actual_amount == 25
    assert [b.source_name for b in row.breakdown] == [POTATOES[0]]


def test_repair_old_snapshots_and_rows_preserves_manual_quantities_and_is_idempotent():
    soup = dish()
    lines = [line(name) for name in POTATOES] + [line("Сіль", "1.7")]
    soup.normative_contributions = snapshots(lines)
    sandwich = dish("Хліб цільнозерновий з тв.сиром", MenuItemKind.PRODUCT, "30/15")
    egg = dish("Яйце відварне", MenuItemKind.PRODUCT, "40")
    rows = build_ingredient_rows(
        [
            DishCalculation(soup, lines),
            DishCalculation(sandwich, [line(sandwich.name, "45")]),
            DishCalculation(egg, [line(egg.name, "40")]),
        ]
    )
    req = requirement([soup, sandwich, egg], rows)
    salt_before = next(r.model_dump() for r in req.ingredient_rows if r.ingredient_name == "Сіль")
    repair_requirement_norms(req)
    assert len(req.ingredient_rows) == 4
    assert (
        next(r.model_dump() for r in req.ingredient_rows if r.ingredient_name == "Сіль")
        == salt_before
    )
    assert soup.children_count == 10
    assert req.source_day_hash == "0" * 64
    first = deepcopy(req.model_dump())
    repair_requirement_norms(req)
    assert req.model_dump() == first
    _apply_manual_ingredient_rules_from_catalog([req], [])
    section = _build_section(req.age_group, req.meal_type, [req], [])
    assert section.unmapped_items == []
    amounts = {row.normative_group_code: row.actual_amount for row in section.rows}
    assert amounts[NormativeGroupCode.POTATOES] == 25
    assert amounts[NormativeGroupCode.BREAD] == 30
    assert amounts[NormativeGroupCode.DAIRY] == 1
    assert amounts[NormativeGroupCode.EGGS] == 1


def test_repair_filters_seasons_per_dish_without_removing_another_dish_cell():
    first, second = dish(), dish("Суп гороховий")
    req = requirement(
        [first, second],
        build_ingredient_rows(
            [
                DishCalculation(first, [line(name) for name in POTATOES]),
                DishCalculation(second, [line(POTATOES[0], "12")]),
            ]
        ),
    )
    repair_requirement_norms(req)
    assert len(req.ingredient_rows) == 1
    assert len(req.ingredient_rows[0].cells) == 2
    assert req.ingredient_rows[0].issue_total_raw_g == 370


@pytest.mark.parametrize(
    "name",
    [
        "Хліб цільнозерновий з тв.сиром",
        "Хліб цільнозерновий з тв. сиром",
        "Хліб цільнозерновий з тв.  сиром",
    ],
)
def test_composite_product_tolerates_space_around_tv(name):
    contributions = product_portion_contributions(name, "30/15")
    assert [(c.group_code, c.amount, c.product_variant) for c in contributions] == [
        (NormativeGroupCode.BREAD, Decimal("30"), None),
        (NormativeGroupCode.DAIRY, Decimal("15"), "hard_cheese"),
    ]


def test_repaired_fields_supports_date_object():
    doc = {
        "service_date": date(2026, 9, 16),
        "dishes": [dish().model_dump()],
        "ingredient_rows": [],
    }
    repaired = repaired_fields(doc)
    assert "dishes" in repaired
    assert "ingredient_rows" in repaired

