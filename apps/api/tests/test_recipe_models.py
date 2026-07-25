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
    resolve_portion_variant_by_yield,
    scale_nutrition,
)
from app.modules.recipe.schemas import NutritionPayload, PortionVariantPayload

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


def test_nutrition_defaults_to_zero_and_accepts_null_values() -> None:
    default_nutrition = Nutrition()
    nullable_payload = NutritionPayload(
        kcal=None,
        proteins=None,
        fats=None,
        carbs=None,
    )
    model_with_nullable_nutrition = PortionVariant(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
        nutrition=None,
    )
    payload_with_nullable_nutrition = PortionVariantPayload(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
        nutrition=None,
    )

    assert default_nutrition.kcal == Decimal("0")
    assert default_nutrition.proteins == Decimal("0")
    assert default_nutrition.fats == Decimal("0")
    assert default_nutrition.carbs == Decimal("0")
    assert nullable_payload.kcal == Decimal("0")
    assert nullable_payload.proteins == Decimal("0")
    assert nullable_payload.fats == Decimal("0")
    assert nullable_payload.carbs == Decimal("0")
    assert model_with_nullable_nutrition.nutrition.kcal == Decimal("0")
    assert payload_with_nullable_nutrition.nutrition.kcal == Decimal("0")


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


def test_portion_resolution_uses_exact_or_nearest_larger_variant() -> None:
    variants = [
        PortionVariant(portion_grams=value, output_grams=value)
        for value in (Decimal("50"), Decimal("75"), Decimal("120"))
    ]

    exact = resolve_portion_variant_by_yield(variants, "75")
    scaled_100 = resolve_portion_variant_by_yield(variants, "100")
    scaled_225 = resolve_portion_variant_by_yield(variants, "225")
    scaled_preferred = resolve_portion_variant_by_yield(
        variants,
        "100",
        preferred_variant_id=variants[0].id,
    )
    tied = resolve_portion_variant_by_yield(
        [
            PortionVariant(portion_grams=Decimal("80"), output_grams=Decimal("80")),
            PortionVariant(portion_grams=Decimal("120"), output_grams=Decimal("120")),
        ],
        "100",
    )

    assert exact is not None
    assert exact.variant.output_grams == Decimal("75")
    assert exact.factor == 1
    assert exact.is_scaled is False
    assert scaled_100 is not None
    assert scaled_100.variant.output_grams == Decimal("120")
    assert scaled_100.factor == Decimal("100") / Decimal("120")
    assert scaled_225 is not None
    assert scaled_225.variant.output_grams == Decimal("120")
    assert scaled_225.factor == Decimal("1.875")
    assert scaled_preferred is not None
    assert scaled_preferred.variant.id == variants[0].id
    assert scaled_preferred.factor == Decimal("2")
    assert tied is not None
    assert tied.variant.output_grams == Decimal("120")


def test_scaled_nutrition_rounds_half_up_to_two_decimals() -> None:
    scaled = scale_nutrition(
        Nutrition(kcal="100", proteins="5", fats="3", carbs="15"),
        Decimal("100") / Decimal("120"),
    )

    assert scaled.kcal == Decimal("83.33")
    assert scaled.proteins == Decimal("4.17")
    assert scaled.fats == Decimal("2.50")
    assert scaled.carbs == Decimal("12.50")


def test_dish_card_version_defaults_to_draft_with_empty_import_diagnostics() -> None:
    assert DishCardVersion.model_fields["status"].default == DishCardVersionStatus.DRAFT
    assert DishCardVersion.model_fields["recognized_warnings"].default_factory() == []
    assert DishCardVersion.model_fields["recognition_errors"].default_factory() == []
    assert DishCardVersion.model_fields["portion_variants"].default_factory() == []
    assert DishCardVersion.model_fields["ingredient_amounts"].default_factory() == []
