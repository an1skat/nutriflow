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
    NormativeContributionSnapshot,
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


def test_repair_removes_young_potato_on_september_14():
    """Reproduce production repair plan defect: school 6a848408f9867d3ec9e6c866 on 2026-09-14."""
    dish_id = PydanticObjectId()
    baked_potato = MenuRequirementDish(
        menu_item_id=dish_id,
        position=1,
        kind=MenuItemKind.DISH_CARD,
        name="Картопля запечена з маслом вершковим",
        yield_amount="100",
        children_count=10,
        normative_contributions=[
            NormativeContributionSnapshot(
                group_code=NormativeGroupCode.POTATOES,
                amount=Decimal("62"),
                unit=NormativeUnit.GRAM,
                source_type=NormativeContributionSource.INGREDIENT,
                source_id=str(dish_id),
                source_name="Картопля молода до 1.09",
            ),
            NormativeContributionSnapshot(
                group_code=NormativeGroupCode.POTATOES,
                amount=Decimal("62"),
                unit=NormativeUnit.GRAM,
                source_type=NormativeContributionSource.INGREDIENT,
                source_id=str(dish_id),
                source_name="Картопля свіжа з 01.09 по 31.10",
            ),
        ],
    )
    lines = [
        line("Картопля молода до 1.09", "62"),
        line("Картопля свіжа з 01.09 по 31.10", "62"),
    ]
    rows = build_ingredient_rows([DishCalculation(baked_potato, lines)])
    req = requirement([baked_potato], rows)
    req.service_date = date(2026, 9, 14)

    repair_requirement_norms(req)

    # Young potato must be completely removed from ingredient_rows, not just contributions.
    assert len(req.ingredient_rows) == 1
    assert req.ingredient_rows[0].ingredient_name == "Картопля свіжа з 01.09 по 31.10"
    assert req.ingredient_rows[0].issue_total_raw_g == Decimal("620")
    assert len(baked_potato.normative_contributions) == 1
    assert baked_potato.normative_contributions[0].source_name == "Картопля свіжа з 01.09 по 31.10"
    assert baked_potato.normative_contributions[0].amount == Decimal("62")


@pytest.mark.parametrize(
    ("service_date", "expected_name"),
    [
        (date(2026, 8, 31), "Картопля молода до 1.09"),
        (date(2026, 9, 1), "Картопля свіжа з 01.09 по 31.10"),
        (date(2026, 9, 14), "Картопля свіжа з 01.09 по 31.10"),
        (date(2026, 11, 15), "Картопля свіжа з 01.11 по 31.12"),
        (date(2026, 1, 15), "Картопля свіжа з 01.01 по 28–29.02"),
        (date(2026, 3, 15), "Картопля свіжа з 01.03"),
    ],
)
def test_potato_seasonality_with_young_potato(service_date, expected_name):
    from app.modules.nutrition.seasonality import select_seasonal_items

    potatoes = [
        "Картопля свіжа з 01.09 по 31.10",
        "Картопля свіжа з 01.11 по 31.12",
        "Картопля свіжа з 01.01 по 28–29.02",
        "Картопля свіжа з 01.03",
        "Картопля молода до 1.09",
    ]
    for candidates in (potatoes, list(reversed(potatoes))):
        selected = select_seasonal_items(candidates, service_date, name=lambda x: x)
        assert selected == [expected_name]


@pytest.mark.parametrize(
    ("service_date", "expected_name"),
    [
        (date(2026, 9, 14), "Морква свіжа до 1.01"),
        (date(2026, 11, 15), "Морква свіжа до 1.01"),
        (date(2026, 12, 31), "Морква свіжа до 1.01"),
        (date(2026, 1, 1), "Морква свіжа з 1.01"),
        (date(2026, 1, 15), "Морква свіжа з 1.01"),
        (date(2026, 3, 15), "Морква свіжа з 1.01"),
        (date(2026, 8, 31), "Морква свіжа з 1.01"),
    ],
)
def test_carrot_paired_annual_boundary_semantics(service_date, expected_name):
    from app.modules.nutrition.seasonality import select_seasonal_items

    carrots = [
        "Морква свіжа до 1.01",
        "Морква свіжа з 1.01",
    ]
    for candidates in (carrots, list(reversed(carrots))):
        selected = select_seasonal_items(candidates, service_date, name=lambda x: x)
        assert selected == [expected_name]


@pytest.mark.parametrize(
    ("raw_name", "expected_group"),
    [
        ("Картопля молода до 1.09", NormativeGroupCode.POTATOES),
        ("картопля молода до 1.09.", NormativeGroupCode.POTATOES),
        ("Морква свіжа до 1.01", NormativeGroupCode.VEGETABLES),
        ("Морква свіжа з 1.01", NormativeGroupCode.VEGETABLES),
        ("Буряк столовий свіжий до 1.01", NormativeGroupCode.VEGETABLES),
        ("Буряк столовий свіжий з 1.01", NormativeGroupCode.VEGETABLES),
    ],
)
def test_registry_lookup_one_digit_dates(raw_name, expected_group):
    rule = get_ingredient_norm_rule(raw_name.lower())
    assert rule is not None, f"Rule not found for {raw_name}"
    assert rule.group_code == expected_group


def test_singleton_beet_survives_on_september_14():
    from app.modules.nutrition.seasonality import select_seasonal_items

    name = "Буряк столовий свіжий з 01.01."
    selected = select_seasonal_items([name], date(2026, 9, 14), name=lambda x: x)
    assert selected == [name]


def test_singleton_carrot_survives_on_september_16():
    from app.modules.nutrition.seasonality import select_seasonal_items

    name = "Морква свіжа з 01.01"
    selected = select_seasonal_items([name], date(2026, 9, 16), name=lambda x: x)
    assert selected == [name]


def test_potato_alternatives_on_september_14_select_only_target():
    from app.modules.nutrition.seasonality import select_seasonal_items

    potatoes = [
        "Картопля свіжа з 01.09 по 31.10",
        "Картопля свіжа з 01.11 по 31.12",
        "Картопля свіжа з 01.01 по 28–29.02",
        "Картопля свіжа з 01.03",
        "Картопля молода до 1.09",
    ]
    for candidates in (potatoes, list(reversed(potatoes))):
        selected = select_seasonal_items(candidates, date(2026, 9, 14), name=lambda x: x)
        assert selected == ["Картопля свіжа з 01.09 по 31.10"]


def test_real_old_production_snapshot_no_longer_removes_carrot_or_beet():
    from pathlib import Path

    from bson import json_util

    snapshot_path = Path(__file__).parents[1] / "norms-6a848408f9867d3ec9e6c866-2026-09-14_18.json"
    if not snapshot_path.exists():
        pytest.skip("Production snapshot file not present")

    data = json_util.loads(snapshot_path.read_text())
    for entry in data["entries"]:
        before = entry["before"]
        repaired = repaired_fields(before)
        for d_before, d_repaired in zip(before["dishes"], repaired["dishes"], strict=True):
            b_c = [
                c["source_name"]
                for c in d_before.get("normative_contributions", [])
                if any(v in c["source_name"].lower() for v in ("моркв", "буряк"))
            ]
            r_c = [
                c["source_name"]
                for c in d_repaired.get("normative_contributions", [])
                if any(v in c["source_name"].lower() for v in ("моркв", "буряк"))
            ]
            assert r_c == b_c, (
                f"Dish {d_before['name']} lost vegetable contributions: "
                f"before={b_c}, repaired={r_c}"
            )

        repaired_rows = {r["ingredient_name"] for r in repaired.get("ingredient_rows", [])}
        if any(d["name"] == "Салат з буряків" for d in before["dishes"]):
            assert "Буряк столовий свіжий з 01.01." in repaired_rows
        if any(d["name"] == "Плов з булгура зі свининою" for d in before["dishes"]):
            assert "Морква свіжа з 01.01" in repaired_rows
