from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Any

from bson.decimal128 import Decimal128
from pydantic import BaseModel, BeforeValidator, Field


def normalize_lookup_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _coerce_decimal(value: Any) -> Any:
    if isinstance(value, Decimal128):
        return value.to_decimal()
    if isinstance(value, (str, int, float)):
        return Decimal(str(value))
    return value


NormAmountDecimal = Annotated[Decimal, BeforeValidator(_coerce_decimal)]


class NormativeGroupCode(StrEnum):
    VEGETABLES = "vegetables"
    FRUITS_BERRIES = "fruits_berries"
    JUICES = "juices"
    DRIED_FRUITS_NUTS_SEEDS = "dried_fruits_nuts_seeds"
    CEREALS_GRAINS_LEGUMES = "cereals_grains_legumes"
    POTATOES = "potatoes"
    BREAD = "bread"
    FISH = "fish"
    POULTRY = "poultry"
    RED_MEAT = "red_meat"
    EGGS = "eggs"
    DAIRY = "dairy"
    ANIMAL_FATS = "animal_fats"
    VEGETABLE_FATS = "vegetable_fats"
    SALT = "salt"
    SUGAR = "sugar"
    COCOA = "cocoa"
    TEA = "tea"


class NormativeUnit(StrEnum):
    GRAM = "g"
    MILLILITER = "ml"
    ITEM = "item"
    PORTION = "portion"


class NormativeContributionBasis(StrEnum):
    PER_PORTION = "per_portion"
    PER_SOURCE_UNIT = "per_source_unit"


class NormativeContributionSource(StrEnum):
    PORTION_VARIANT = "portion_variant"
    INGREDIENT = "ingredient"
    PRODUCT = "product"


class NormativeContribution(BaseModel):
    """A normative amount produced by one portion or one source unit.

    Portion variants normally use ``per_portion``. Ingredient mappings use
    ``per_source_unit`` so menu-requirement generation can multiply the mapping
    by the ingredient's per-person amount without changing recipe calculations.
    """

    group_code: NormativeGroupCode
    amount: NormAmountDecimal = Field(gt=0)
    unit: NormativeUnit
    basis: NormativeContributionBasis = NormativeContributionBasis.PER_PORTION
    portion_equivalent: NormAmountDecimal | None = Field(default=None, gt=0)
    product_variant: str | None = Field(default=None, min_length=1, max_length=80)


class NormativeContributionSnapshot(BaseModel):
    group_code: NormativeGroupCode
    amount: NormAmountDecimal = Field(gt=0)
    unit: NormativeUnit
    portion_equivalent: NormAmountDecimal | None = Field(default=None, gt=0)
    product_variant: str | None = Field(default=None, max_length=80)
    source_type: NormativeContributionSource
    source_id: str | None = None
    source_name: str = Field(min_length=1, max_length=255)
