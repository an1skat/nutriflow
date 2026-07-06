from datetime import datetime
from decimal import Decimal
from typing import Self

from beanie import PydanticObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.identity.models import AgeGroup
from app.modules.recipe.models import (
    Allergen,
    AmountBasis,
    AmountDecimal,
    DishCard,
    DishCardVersion,
    DishCardVersionStatus,
    Ingredient,
    IngredientAmount,
    NutritionDecimal,
    PortionVariant,
)


class DecimalResponseModel(BaseModel):
    pass


class CreateIngredientRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    unit: str = Field(min_length=1, max_length=20)
    normative_group_id: PydanticObjectId | None = None
    aliases: list[str] = Field(default_factory=list)

    @field_validator("name", "unit")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class UpdateIngredientRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    normative_group_id: PydanticObjectId | None = None
    aliases: list[str] | None = None
    is_active: bool | None = None

    @field_validator("name", "unit")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Ingredient name cannot be null")
        if "unit" in self.model_fields_set and self.unit is None:
            raise ValueError("Ingredient unit cannot be null")
        if "aliases" in self.model_fields_set and self.aliases is None:
            raise ValueError("Ingredient aliases cannot be null")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        return self


class IngredientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    name: str
    normalized_name: str
    unit: str
    normative_group_id: PydanticObjectId | None
    aliases: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_ingredient(cls, ingredient: Ingredient) -> "IngredientResponse":
        return cls.model_validate(ingredient)


class IngredientListResponse(BaseModel):
    items: list[IngredientResponse]
    total: int
    offset: int
    limit: int


class CreateAllergenRequest(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("code", "name")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class UpdateAllergenRequest(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("code", "name")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if "code" in self.model_fields_set and self.code is None:
            raise ValueError("Allergen code cannot be null")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Allergen name cannot be null")
        return self


class AllergenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    code: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_allergen(cls, allergen: Allergen) -> "AllergenResponse":
        return cls.model_validate(allergen)


class AllergenListResponse(BaseModel):
    items: list[AllergenResponse]
    total: int
    offset: int
    limit: int


class NutritionPayload(DecimalResponseModel):
    kcal: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))
    proteins: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))
    fats: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))
    carbs: NutritionDecimal = Field(default=Decimal("0"), ge=Decimal("0"))


class PortionVariantPayload(DecimalResponseModel):
    id: PydanticObjectId | None = None
    age_group: AgeGroup | None = None
    portion_grams: AmountDecimal | None = Field(default=None, ge=Decimal("0"))
    output_grams: AmountDecimal = Field(ge=Decimal("0"))
    nutrition: NutritionPayload = Field(default_factory=NutritionPayload)

    @field_validator("nutrition", mode="before")
    @classmethod
    def default_nutrition(cls, value: object) -> object:
        return {} if value is None else value

    @model_validator(mode="after")
    def validate_variant_identity(self) -> Self:
        if self.age_group is None and self.portion_grams is None:
            raise ValueError("Portion variant must define age_group or portion_grams")
        return self


class IngredientAmountPayload(DecimalResponseModel):
    ingredient_id: PydanticObjectId | None = None
    ingredient_name_snapshot: str = Field(min_length=1, max_length=200)
    gross_amount: AmountDecimal = Field(ge=Decimal("0"))
    net_amount: AmountDecimal = Field(ge=Decimal("0"))
    unit: str = Field(min_length=1, max_length=20)
    amount_basis: AmountBasis = AmountBasis.PER_PORTION
    portion_variant_id: PydanticObjectId
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("ingredient_name_snapshot", "unit")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("notes")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class PortionVariantResponse(PortionVariantPayload):
    id: PydanticObjectId

    @classmethod
    def from_variant(cls, variant: PortionVariant) -> "PortionVariantResponse":
        return cls.model_validate(variant.model_dump())


class IngredientAmountResponse(IngredientAmountPayload):
    @classmethod
    def from_amount(cls, amount: IngredientAmount) -> "IngredientAmountResponse":
        return cls.model_validate(amount.model_dump())


class CreateDishCardRequest(BaseModel):
    card_number: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=120)
    source: str | None = Field(default=None, max_length=200)

    @field_validator("card_number", "name")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("category", "source")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class UpdateDishCardRequest(BaseModel):
    card_number: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=120)
    source: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None

    @field_validator("card_number", "name")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("category", "source")
    @classmethod
    def trim_optional_nullable_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if "card_number" in self.model_fields_set and self.card_number is None:
            raise ValueError("Dish card number cannot be null")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Dish card name cannot be null")
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null")
        return self


class DishCardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    card_number: str
    name: str
    category: str | None
    source: str | None
    is_active: bool
    current_version_id: PydanticObjectId | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_dish_card(cls, dish_card: DishCard) -> "DishCardResponse":
        return cls.model_validate(dish_card)


class DishCardListResponse(BaseModel):
    items: list[DishCardResponse]
    total: int
    offset: int
    limit: int


class CreateDishCardVersionRequest(BaseModel):
    version: int | None = Field(default=None, ge=1)
    source_import_id: PydanticObjectId | None = None
    source_file_name: str | None = Field(default=None, max_length=255)
    source_page: int | None = Field(default=None, ge=1)
    recognized_warnings: list[str] = Field(default_factory=list)
    recognition_errors: list[str] = Field(default_factory=list)
    allergen_ids: list[PydanticObjectId] = Field(default_factory=list)
    technology_text: str | None = None
    portion_variants: list[PortionVariantPayload] = Field(default_factory=list)
    ingredient_amounts: list[IngredientAmountPayload] = Field(default_factory=list)


class CreateDishCardVersionPreviewRequest(CreateDishCardVersionRequest):
    pass


class UpdateDishCardVersionRequest(BaseModel):
    source_file_name: str | None = Field(default=None, max_length=255)
    source_page: int | None = Field(default=None, ge=1)
    recognized_warnings: list[str] | None = None
    recognition_errors: list[str] | None = None
    allergen_ids: list[PydanticObjectId] | None = None
    technology_text: str | None = None
    portion_variants: list[PortionVariantPayload] | None = None
    ingredient_amounts: list[IngredientAmountPayload] | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class DishCardVersionResponse(DecimalResponseModel):
    id: PydanticObjectId
    dish_card_id: PydanticObjectId
    version: int
    status: DishCardVersionStatus
    source_import_id: PydanticObjectId | None
    source_file_name: str | None
    source_page: int | None
    recognized_warnings: list[str]
    recognition_errors: list[str]
    allergen_ids: list[PydanticObjectId]
    technology_text: str | None
    portion_variants: list[PortionVariantResponse]
    ingredient_amounts: list[IngredientAmountResponse]
    created_at: datetime
    updated_at: datetime
    created_by: PydanticObjectId | None

    @classmethod
    def from_version(cls, version: DishCardVersion) -> "DishCardVersionResponse":
        return cls(
            id=version.id,
            dish_card_id=version.dish_card_id,
            version=version.version,
            status=version.status,
            source_import_id=version.source_import_id,
            source_file_name=version.source_file_name,
            source_page=version.source_page,
            recognized_warnings=version.recognized_warnings,
            recognition_errors=version.recognition_errors,
            allergen_ids=version.allergen_ids,
            technology_text=version.technology_text,
            portion_variants=[
                PortionVariantResponse.from_variant(variant) for variant in version.portion_variants
            ],
            ingredient_amounts=[
                IngredientAmountResponse.from_amount(amount)
                for amount in version.ingredient_amounts
            ],
            created_at=version.created_at,
            updated_at=version.updated_at,
            created_by=version.created_by,
        )


class DishCardVersionListResponse(BaseModel):
    items: list[DishCardVersionResponse]
    total: int
    offset: int
    limit: int


class ValidationIssue(BaseModel):
    code: str
    message: str
    field: str | None = None


class DishCardVersionValidationResponse(BaseModel):
    blocking_errors: list[ValidationIssue]
    warnings: list[ValidationIssue]
    can_confirm: bool


class CalculateIngredientsRequest(BaseModel):
    portion_variant_id: PydanticObjectId
    servings_count: int = Field(ge=1, le=100_000)


class IngredientCalculationLine(DecimalResponseModel):
    ingredient_id: PydanticObjectId | None
    ingredient_name_snapshot: str
    unit: str
    gross_per_portion: AmountDecimal
    net_per_portion: AmountDecimal
    gross_total: AmountDecimal
    net_total: AmountDecimal
    notes: str | None


class CalculateIngredientsResponse(DecimalResponseModel):
    dish_card_version_id: PydanticObjectId
    portion_variant_id: PydanticObjectId
    servings_count: int
    items: list[IngredientCalculationLine]


class PdfImportPreviewResponse(BaseModel):
    filename: str
    content_type: str | None
    extracted_text_preview: str | None
    guessed_card_number: str | None
    guessed_name: str | None
    warnings: list[str]
    recognition_errors: list[str]
