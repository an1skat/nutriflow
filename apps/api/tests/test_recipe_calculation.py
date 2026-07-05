from datetime import UTC, datetime
from decimal import Decimal

import pytest
from beanie import PydanticObjectId

from app.modules.recipe.models import (
    DishCardVersion,
    DishCardVersionStatus,
    IngredientAmount,
    PortionVariant,
)
from app.modules.recipe.schemas import CalculateIngredientsRequest
from app.modules.recipe.service import (
    AlternativeChoiceRequiredError,
    DishCardVersionNotConfirmedError,
    calculate_ingredient_lines,
    validate_version,
)

pytestmark = pytest.mark.no_clean_database


def make_version(
    *,
    status: DishCardVersionStatus = DishCardVersionStatus.CONFIRMED,
    portion_variants: list[PortionVariant] | None = None,
    ingredient_amounts: list[IngredientAmount] | None = None,
    recognition_errors: list[str] | None = None,
) -> DishCardVersion:
    now = datetime.now(UTC)
    return DishCardVersion.model_construct(
        id=PydanticObjectId(),
        dish_card_id=PydanticObjectId(),
        version=1,
        status=status,
        source_import_id=None,
        source_file_name=None,
        source_page=None,
        recognized_warnings=[],
        recognition_errors=recognition_errors or [],
        allergen_ids=[],
        technology_text=None,
        portion_variants=portion_variants or [],
        ingredient_amounts=ingredient_amounts or [],
        created_at=now,
        updated_at=now,
        created_by=None,
    )


def test_calculates_gross_and_net_totals_with_decimal_arithmetic() -> None:
    portion = PortionVariant(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
    )
    version = make_version(
        portion_variants=[portion],
        ingredient_amounts=[
            IngredientAmount(
                ingredient_name_snapshot="Морква",
                gross_amount=Decimal("106.08"),
                net_amount=Decimal("84"),
                unit="g",
                portion_variant_id=portion.id,
            ),
            IngredientAmount(
                ingredient_name_snapshot="Яблука",
                gross_amount=Decimal("54.72"),
                net_amount=Decimal("32.4"),
                unit="g",
                portion_variant_id=portion.id,
            ),
        ],
    )

    lines = calculate_ingredient_lines(
        version,
        CalculateIngredientsRequest(
            portion_variant_id=portion.id,
            servings_count=10,
        ),
    )

    assert lines[0].gross_total == Decimal("1060.80")
    assert lines[0].net_total == Decimal("840")
    assert lines[1].gross_total == Decimal("547.20")
    assert lines[1].net_total == Decimal("324.0")
    assert isinstance(lines[0].gross_total, Decimal)
    assert isinstance(lines[0].net_total, Decimal)


def test_alternative_group_requires_explicit_choice() -> None:
    portion = PortionVariant(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
    )
    version = make_version(
        portion_variants=[portion],
        ingredient_amounts=[
            IngredientAmount(
                ingredient_name_snapshot="Морква свіжа до 01.01",
                group_key="carrot-season",
                alternative_label="before-jan",
                gross_amount=Decimal("103.2"),
                net_amount=Decimal("84"),
                unit="g",
                portion_variant_id=portion.id,
            ),
            IngredientAmount(
                ingredient_name_snapshot="Морква свіжа з 01.01",
                group_key="carrot-season",
                alternative_label="after-jan",
                gross_amount=Decimal("106.08"),
                net_amount=Decimal("84"),
                unit="g",
                portion_variant_id=portion.id,
            ),
        ],
    )

    with pytest.raises(AlternativeChoiceRequiredError):
        calculate_ingredient_lines(
            version,
            CalculateIngredientsRequest(
                portion_variant_id=portion.id,
                servings_count=10,
            ),
        )


def test_selected_alternative_is_calculated_without_summing_other_options() -> None:
    portion = PortionVariant(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
    )
    version = make_version(
        portion_variants=[portion],
        ingredient_amounts=[
            IngredientAmount(
                ingredient_name_snapshot="Морква свіжа до 01.01",
                group_key="carrot-season",
                alternative_label="before-jan",
                gross_amount=Decimal("103.2"),
                net_amount=Decimal("84"),
                unit="g",
                portion_variant_id=portion.id,
            ),
            IngredientAmount(
                ingredient_name_snapshot="Морква свіжа з 01.01",
                group_key="carrot-season",
                alternative_label="after-jan",
                gross_amount=Decimal("106.08"),
                net_amount=Decimal("84"),
                unit="g",
                portion_variant_id=portion.id,
            ),
        ],
    )

    lines = calculate_ingredient_lines(
        version,
        CalculateIngredientsRequest(
            portion_variant_id=portion.id,
            servings_count=10,
            selected_alternatives={"carrot-season": "after-jan"},
        ),
    )

    assert len(lines) == 1
    assert lines[0].ingredient_name_snapshot == "Морква свіжа з 01.01"
    assert lines[0].gross_total == Decimal("1060.80")


def test_unconfirmed_version_cannot_be_calculated() -> None:
    portion = PortionVariant(
        portion_grams=Decimal("120"),
        output_grams=Decimal("120"),
    )
    version = make_version(
        status=DishCardVersionStatus.IMPORT_PREVIEW,
        portion_variants=[portion],
    )

    with pytest.raises(DishCardVersionNotConfirmedError):
        calculate_ingredient_lines(
            version,
            CalculateIngredientsRequest(
                portion_variant_id=portion.id,
                servings_count=1,
            ),
        )


def test_validation_blocks_preview_with_recognition_errors() -> None:
    version = make_version(
        status=DishCardVersionStatus.IMPORT_PREVIEW,
        recognition_errors=["Не вдалося надійно розпізнати таблицю інгредієнтів."],
    )

    result = validate_version(version)

    assert result.can_confirm is False
    assert {issue.code for issue in result.blocking_errors} == {
        "recognition_error",
        "missing_portion_variants",
        "missing_ingredient_amounts",
    }
