import re
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Any

from beanie import Document, PydanticObjectId
from bson.decimal128 import Decimal128
from pydantic import (
    BaseModel,
    BeforeValidator,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from pymongo import ASCENDING, IndexModel

from app.modules.identity.models import AgeGroup, utc_now

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Unit = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]


def _coerce_decimal(value: Any) -> Any:
    """Normalize Decimal128 (BSON) and other Decimal-compatible inputs to Decimal.

    Beanie stores ``Decimal`` as BSON ``Decimal128``. On read, the raw ``Decimal128``
    is fed back into Pydantic, which by default rejects it as a non-Decimal type.
    Converting here keeps decimal precision intact across Mongo round-trips and
    avoids any silent fallback to float.
    """
    if value is None or isinstance(value, Decimal):
        return value
    if isinstance(value, Decimal128):
        return value.to_decimal()
    if isinstance(value, (str, int, float)):
        return Decimal(str(value))
    return value


# Reusable Decimal type that survives Mongo Decimal128 round-trips while keeping
# exact decimal arithmetic (no float coercion).
AmountDecimal = Annotated[Decimal, BeforeValidator(_coerce_decimal)]


def _coerce_nutrition_decimal(value: Any) -> Any:
    if value is None or value == "":
        return Decimal("0")
    coerced = _coerce_decimal(value)
    if isinstance(coerced, Decimal):
        return coerced
    return coerced


NutritionDecimal = Annotated[Decimal, BeforeValidator(_coerce_nutrition_decimal)]


def normalize_lookup_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


class DishCardVersionStatus(StrEnum):
    DRAFT = "draft"
    IMPORT_PREVIEW = "import_preview"
    CONFIRMED = "confirmed"
    ARCHIVED = "archived"


class AmountBasis(StrEnum):
    PER_PORTION = "per_portion"


class Ingredient(Document):
    name: Name
    normalized_name: str = Field(min_length=1, max_length=200)
    unit: Unit
    normative_group_id: PydanticObjectId | None = None
    aliases: list[str] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @field_validator("normalized_name", mode="before")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_lookup_text(value)

    @field_validator("unit", mode="before")
    @classmethod
    def normalize_unit(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("aliases", mode="before")
    @classmethod
    def normalize_aliases(cls, value: list[str] | None) -> list[str]:
        if value is None:
            return []
        return sorted({normalize_lookup_text(item) for item in value if item.strip()})

    class Settings:
        name = "ingredients"
        indexes = [
            IndexModel(
                [("normalized_name", ASCENDING), ("unit", ASCENDING)],
                unique=True,
                name="uq_ingredient_normalized_name_unit",
            ),
            IndexModel([("aliases", ASCENDING)], name="ix_ingredient_aliases"),
        ]


class Allergen(Document):
    code: Code
    name: Name
    description: str | None = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()

    class Settings:
        name = "allergens"
        indexes = [
            IndexModel([("code", ASCENDING)], unique=True, name="uq_allergen_code"),
        ]


class Nutrition(BaseModel):
    kcal: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))
    proteins: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))
    fats: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))
    carbs: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))


class PortionVariant(BaseModel):
    id: PydanticObjectId = Field(default_factory=PydanticObjectId)
    age_group: AgeGroup | None = None
    portion_grams: AmountDecimal | None = Field(default=None, ge=Decimal("0"))
    output_grams: AmountDecimal = Field(ge=Decimal("0"))
    nutrition: Nutrition = Field(default_factory=Nutrition)

    @field_validator("nutrition", mode="before")
    @classmethod
    def default_nutrition(cls, value: Any) -> Any:
        return {} if value is None else value

    @model_validator(mode="after")
    def validate_variant_identity(self) -> "PortionVariant":
        if self.age_group is None and self.portion_grams is None:
            raise ValueError("Portion variant must define age_group or portion_grams")
        return self


def parse_menu_yield_grams(value: str) -> Decimal | None:
    normalized = str(value).strip().lower().replace("\u00a0", " ")
    normalized = re.sub(r"\s*(?:г|гр|g)\s*$", "", normalized).strip()
    normalized = normalized.replace(",", ".")

    if not re.fullmatch(r"\d+(?:\.\d+)?", normalized):
        return None

    amount = Decimal(normalized)
    if amount < 0:
        return None
    return amount


def find_portion_variant_by_yield(
    portion_variants: list[PortionVariant],
    yield_amount: str,
    *,
    preferred_variant_id: PydanticObjectId | None = None
) -> PortionVariant | None:
    target = parse_menu_yield_grams(yield_amount)

    if target is None:
        if preferred_variant_id is None:
            return None
        
        return next(
            (
                variant
                for variant in portion_variants
                if variant.id == preferred_variant_id
            ),
            None
        )
    
    for attribute in ("output_grams", "portion_grams"):
        matches = [
            variant
            for variant in portion_variants
            if getattr(variant, attribute) == target
        ]

        if preferred_variant_id is not None:
            preferred = next(
                (
                    variant
                    for variant in matches
                    if variant.id == preferred_variant_id
                ),
                None,
            )
            if preferred is not None:
                return preferred
        
        if matches:
            return matches[0]
        
    return None


class IngredientAmount(BaseModel):
    ingredient_id: PydanticObjectId | None = None
    ingredient_name_snapshot: Name
    gross_amount: AmountDecimal = Field(ge=Decimal("0"))
    net_amount: AmountDecimal = Field(ge=Decimal("0"))
    unit: Unit
    amount_basis: AmountBasis = AmountBasis.PER_PORTION
    portion_variant_id: PydanticObjectId
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("unit", mode="before")
    @classmethod
    def normalize_unit(cls, value: str) -> str:
        return value.strip().lower()


class DishCard(Document):
    card_number: Code
    name: Name
    category: str | None = Field(default=None, max_length=120)
    source: str | None = Field(default=None, max_length=200)
    is_active: bool = True
    current_version_id: PydanticObjectId | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "dish_cards"
        indexes = [
            IndexModel([("card_number", ASCENDING)], unique=True, name="uq_dish_card_number"),
            IndexModel([("name", ASCENDING)], name="ix_dish_card_name"),
        ]


class DishCardVersion(Document):
    dish_card_id: PydanticObjectId
    version: int = Field(ge=1)
    status: DishCardVersionStatus = DishCardVersionStatus.DRAFT
    source_import_id: PydanticObjectId | None = None
    source_file_name: str | None = Field(default=None, max_length=255)
    source_page: int | None = Field(default=None, ge=1)
    recognized_warnings: list[str] = Field(default_factory=list)
    recognition_errors: list[str] = Field(default_factory=list)
    allergen_ids: list[PydanticObjectId] = Field(default_factory=list)
    technology_text: str | None = None
    portion_variants: list[PortionVariant] = Field(default_factory=list)
    ingredient_amounts: list[IngredientAmount] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    created_by: PydanticObjectId | None = None

    class Settings:
        name = "dish_card_versions"
        indexes = [
            IndexModel(
                [("dish_card_id", ASCENDING), ("version", ASCENDING)],
                unique=True,
                name="uq_dish_card_version",
            ),
            IndexModel([("status", ASCENDING)], name="ix_dish_card_version_status"),
        ]
