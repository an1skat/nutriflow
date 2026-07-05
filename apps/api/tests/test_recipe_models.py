from decimal import Decimal

import pytest
from beanie import PydanticObjectId

from app.modules.identity.models import AgeGroup
from app.modules.recipe.models import (
    Allergen,
    AmountBasis,
    DishCardVersion,
    DishCardVersionStatus,
    Ingredient,
    IngredientAmount,
    Nutrition,
    PortionVariant,
)

pytestmark = pytest.mark.no_clean_database


def test_ingredient_normalizes_lookup_fields() -> None:
    aliases = [
        " Морква  ",
        "морква",
        "  Яблуко   зелене ",
        "",
    ]

    assert Ingredient.normalize_name("  Морква   Свіжа  ") == "морква свіжа"
    assert Ingredient.normalize_unit(" G ") == "g"
    assert Ingredient.normalize_aliases(aliases) == ["морква", "яблуко зелене"]


def test_allergen_code_is_normalized() -> None:
    assert Allergen.normalize_code(" gluten ") == "GLUTEN"


def test_ingredient_amount_keeps_decimal_values() -> None:
    portion_variant_id = PydanticObjectId()

    amount = IngredientAmount(
        ingredient_name_snapshot="Морква",
        gross_amount=Decimal("35.50"),
        net_amount=Decimal("28.25"),
        unit="g",
        portion_variant_id=portion_variant_id,
    )

    assert amount.gross_amount == Decimal("35.50")
    assert amount.net_amount == Decimal("28.25")
    assert isinstance(amount.gross_amount, Decimal)
    assert isinstance(amount.net_amount, Decimal)
    assert amount.amount_basis == AmountBasis.PER_PORTION


def test_nutrition_keeps_decimal_values() -> None:
    nutrition = Nutrition(
        kcal=Decimal("67.4"),
        proteins=Decimal("1.2"),
        fats=Decimal("4.8"),
        carbs=Decimal("8.3"),
    )

    assert isinstance(nutrition.kcal, Decimal)
    assert isinstance(nutrition.proteins, Decimal)
    assert isinstance(nutrition.fats, Decimal)
    assert isinstance(nutrition.carbs, Decimal)


def test_portion_variant_supports_age_group_and_gram_based_variants() -> None:
    age_based = PortionVariant(
        age_group=AgeGroup.SIX_TO_ELEVEN,
        output_grams=Decimal("120"),
    )
    gram_based = PortionVariant(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
    )

    assert age_based.age_group == AgeGroup.SIX_TO_ELEVEN
    assert age_based.output_grams == Decimal("120")
    assert gram_based.portion_grams == Decimal("120")
    assert gram_based.output_grams == Decimal("120")


def test_dish_card_version_defaults_to_draft_with_empty_import_diagnostics() -> None:
    assert DishCardVersion.model_fields["status"].default == DishCardVersionStatus.DRAFT
    assert DishCardVersion.model_fields["recognized_warnings"].default_factory() == []
    assert DishCardVersion.model_fields["recognition_errors"].default_factory() == []
    assert DishCardVersion.model_fields["portion_variants"].default_factory() == []
    assert DishCardVersion.model_fields["ingredient_amounts"].default_factory() == []
