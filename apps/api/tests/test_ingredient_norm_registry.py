from decimal import Decimal

import pytest
from beanie import PydanticObjectId

from app.modules.menu_requirements.models import (
    MenuRequirement,
    MenuRequirementCell,
    MenuRequirementDish,
    MenuRequirementIngredientRow,
)
from app.modules.menus.models import MenuItemKind
from app.modules.norm_compliance.service import (
    _apply_manual_ingredient_rules_from_catalog,
    _is_countable_contribution,
)
from app.modules.nutrition.contributions import (
    IngredientLine,
    ingredient_contribution_snapshots,
)
from app.modules.nutrition.domain import (
    NormativeContributionSnapshot,
    NormativeContributionSource,
    NormativeGroupCode,
    NormativeUnit,
)
from app.modules.nutrition.ingredient_registry import (
    INGREDIENT_NORM_RULES,
    INGREDIENTS_NOT_COUNTED_SEPARATELY,
)
from app.modules.recipe.models import Ingredient

pytestmark = pytest.mark.no_clean_database


def test_manual_registry_covers_the_reviewed_catalog_without_overlap() -> None:
    assert len(INGREDIENT_NORM_RULES) >= 97
    assert not set(INGREDIENT_NORM_RULES) & set(INGREDIENTS_NOT_COUNTED_SEPARATELY)


def test_manual_registry_uses_distinct_legal_groups() -> None:
    assert INGREDIENT_NORM_RULES["морква свіжа з 01.01"].group_code == (
        NormativeGroupCode.VEGETABLES
    )
    assert INGREDIENT_NORM_RULES["буряк столовий свіжий з 01.01."].group_code == (
        NormativeGroupCode.VEGETABLES
    )
    assert INGREDIENT_NORM_RULES["картопля свіжа з 01.03"].group_code == (
        NormativeGroupCode.POTATOES
    )
    assert INGREDIENT_NORM_RULES["філе куряче"].group_code == NormativeGroupCode.POULTRY
    assert INGREDIENT_NORM_RULES["філе минтая зі шкірою вироблене промисловістю"].group_code == (
        NormativeGroupCode.FISH
    )
    assert INGREDIENT_NORM_RULES["чорнослив без кісточки"].group_code == (
        NormativeGroupCode.DRIED_FRUITS_NUTS_SEEDS
    )


def test_composite_dressings_contribute_only_their_oil_share() -> None:
    dressing = _ingredient("Заправка для салату (ТК № 10.01)")
    honey_mustard = _ingredient("Соус медово-гірчичний")

    dressing_snapshot = _snapshots(dressing, Decimal("4"))[0]
    honey_snapshot = _snapshots(honey_mustard, Decimal("7"))[0]

    assert dressing_snapshot.group_code == NormativeGroupCode.VEGETABLE_FATS
    assert dressing_snapshot.amount == Decimal("2.8")
    assert honey_snapshot.group_code == NormativeGroupCode.VEGETABLE_FATS
    assert honey_snapshot.amount == Decimal("5.7")


def test_manual_registry_creates_snapshot_for_unconfigured_ingredient() -> None:
    ingredient = _ingredient("Морква свіжа з 01.01")
    snapshots = _snapshots(ingredient, Decimal("35.5"))

    assert len(snapshots) == 1
    assert snapshots[0].group_code == NormativeGroupCode.VEGETABLES
    assert snapshots[0].amount == Decimal("35.5")
    assert snapshots[0].unit == NormativeUnit.GRAM


def test_manual_registry_converts_only_whole_egg_items() -> None:
    ingredient = _ingredient("Яйце куряче")

    assert _snapshots(ingredient, Decimal("8")) == []

    one_egg = _snapshots(ingredient, Decimal("40"))
    assert one_egg[0].group_code == NormativeGroupCode.EGGS
    assert one_egg[0].amount == Decimal("1")
    assert one_egg[0].unit == NormativeUnit.ITEM

    two_eggs = _snapshots(ingredient, Decimal("80"))
    assert two_eggs[0].amount == Decimal("2")


def test_saved_fractional_egg_snapshot_is_not_countable() -> None:
    contribution = NormativeContributionSnapshot(
        group_code=NormativeGroupCode.EGGS,
        amount=Decimal("0.2"),
        unit=NormativeUnit.ITEM,
        source_type=NormativeContributionSource.INGREDIENT,
        source_id=str(PydanticObjectId()),
        source_name="Яйце куряче",
    )

    assert not _is_countable_contribution(contribution)


def test_auxiliary_products_from_resolution_point_9_are_not_counted() -> None:
    assert "борошно цільнозернове" in INGREDIENTS_NOT_COUNTED_SEPARATELY
    assert "томатна паста" in INGREDIENTS_NOT_COUNTED_SEPARATELY
    assert "цукор ванільний" in INGREDIENTS_NOT_COUNTED_SEPARATELY

    assert _snapshots(_ingredient("Борошно цільнозернове"), Decimal("10")) == []
    assert _snapshots(_ingredient("Томатна паста"), Decimal("5")) == []
    assert _snapshots(_ingredient("Цукор ванільний"), Decimal("2")) == []


def test_cereal_is_classified_and_counted_from_menu_requirement_net_amount() -> None:
    ingredient = _ingredient("Крупа гречана")

    assert INGREDIENT_NORM_RULES[ingredient.normalized_name].group_code == (
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    )
    snapshots = _snapshots(ingredient, Decimal("40"))
    assert snapshots[0].group_code == NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    assert snapshots[0].amount == Decimal("40")


def test_existing_requirement_without_snapshots_is_enriched_from_registry() -> None:
    ingredient = _ingredient("Морква свіжа з 01.01")
    menu_item_id = PydanticObjectId()
    dish = MenuRequirementDish(
        menu_item_id=menu_item_id,
        position=1,
        kind=MenuItemKind.DISH_CARD,
        name="Морквяний салат",
        yield_amount="50",
        children_count=20,
    )
    requirement = MenuRequirement.model_construct(
        dishes=[dish],
        ingredient_rows=[
            MenuRequirementIngredientRow(
                key=f"ingredient:{ingredient.id}",
                ingredient_id=ingredient.id,
                ingredient_name=ingredient.name,
                cells=[
                    MenuRequirementCell(
                        menu_item_id=menu_item_id,
                        net_per_person_g=Decimal("35"),
                    )
                ],
                per_person_total_g=Decimal("35"),
                issue_total_raw_g=Decimal("700"),
                issue_total_rounded_g=700,
            )
        ],
    )

    _apply_manual_ingredient_rules_from_catalog([requirement], [ingredient])

    assert dish.normative_contributions[0].group_code == NormativeGroupCode.VEGETABLES
    assert dish.normative_contributions[0].amount == Decimal("35")


def _ingredient(name: str) -> Ingredient:
    return Ingredient.model_construct(
        id=PydanticObjectId(),
        name=name,
        normalized_name=name.lower(),
        unit="g",
        normative_contributions=[],
    )


def _snapshots(
    ingredient: Ingredient,
    amount: Decimal,
):
    line = IngredientLine(
        key=f"ingredient:{ingredient.id}",
        ingredient_id=ingredient.id,
        name=ingredient.name,
        net_per_person_g=amount,
    )
    return ingredient_contribution_snapshots(
        [line],
        catalog_by_id={ingredient.id: ingredient},
        catalog_by_name={ingredient.normalized_name: ingredient},
        excluded_groups=set(),
        source_type=NormativeContributionSource.INGREDIENT,
    )
