from datetime import date as Date
from datetime import datetime
from typing import Self

from beanie import PydanticObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.identity.models import AgeGroup
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MealType,
    MenuItemKind,
    MenuItemServingCount,
    MenuNutrition,
    MenuPortion,
    Weekday,
    WeeklyMenu,
    WeeklyMenuStatus,
)
from app.modules.recipe.models import AmountDecimal


class DecimalResponseModel(BaseModel):
    pass


class MenuNutritionPayload(DecimalResponseModel):
    kcal: AmountDecimal | None = None
    proteins: AmountDecimal | None = None
    fats: AmountDecimal | None = None
    carbs: AmountDecimal | None = None


class MenuPortionPayload(DecimalResponseModel):
    age_group: AgeGroup
    yield_amount: str = Field(min_length=1, max_length=40)
    dish_card_portion_variant_id: PydanticObjectId | None = None
    nutrition: MenuNutritionPayload = Field(default_factory=MenuNutritionPayload)

    @field_validator("yield_amount", mode="before")
    @classmethod
    def trim_yield_amount(cls, value: str) -> str:
        return str(value).strip()


class MenuItemServingCountPayload(BaseModel):
    school_group_id: PydanticObjectId
    age_group: AgeGroup
    children_count: int = Field(ge=0, le=100_000)


class DailyMenuItemPayload(DecimalResponseModel):
    id: PydanticObjectId | None = None
    position: int = Field(ge=1, le=200)
    kind: MenuItemKind = MenuItemKind.DISH_CARD
    source_text: str | None = Field(default=None, min_length=1, max_length=255)
    recipe_card_number: str | None = Field(default=None, min_length=1, max_length=80)
    dish_card_id: PydanticObjectId | None = None
    dish_card_version_id: PydanticObjectId | None = None
    product_ingredient_id: PydanticObjectId | None = None
    product_name_snapshot: str | None = Field(default=None, min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    allergen_codes: list[str] = Field(default_factory=list)
    portions: list[MenuPortionPayload] = Field(default_factory=list, min_length=1)
    servings: list[MenuItemServingCountPayload] = Field(default_factory=list)
    notes: str | None = Field(default=None, min_length=1, max_length=2000)

    @field_validator(
        "source_text",
        "recipe_card_number",
        "product_name_snapshot",
        "name",
        "notes",
        mode="before",
    )
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return str(value).strip()

    @field_validator("allergen_codes", mode="before")
    @classmethod
    def normalize_allergen_codes(cls, value: list[str] | None) -> list[str]:
        if value is None:
            return []
        return sorted({item.strip().upper() for item in value if item and item.strip()})


class DailyMenuPayload(DecimalResponseModel):
    weekday: Weekday
    date: Date | None = None
    items: list[DailyMenuItemPayload] = Field(default_factory=list, min_length=1)
    notes: str | None = Field(default=None, min_length=1, max_length=2000)

    @field_validator("notes", mode="before")
    @classmethod
    def trim_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return str(value).strip()


class CreateWeeklyMenuRequest(DecimalResponseModel):
    title: str = Field(min_length=1, max_length=255)
    school_id: PydanticObjectId | None = None
    meal_type: MealType
    cycle_week: int | None = Field(default=None, ge=1, le=53)
    starts_on: Date | None = None
    ends_on: Date | None = None
    days: list[DailyMenuPayload] = Field(default_factory=list, min_length=1, max_length=7)
    notes: str | None = Field(default=None, min_length=1, max_length=2000)
    source_file_name: str | None = Field(default=None, max_length=255)
    source_sheet_name: str | None = Field(default=None, max_length=120)

    @field_validator("title", "notes", "source_file_name", "source_sheet_name", mode="before")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped or None

    @model_validator(mode="after")
    def validate_dates(self) -> Self:
        if (
            self.starts_on is not None
            and self.ends_on is not None
            and self.ends_on < self.starts_on
        ):
            raise ValueError("Weekly menu end date cannot be before start date")
        return self


class UpdateWeeklyMenuRequest(DecimalResponseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    meal_type: MealType | None = None
    cycle_week: int | None = Field(default=None, ge=1, le=53)
    starts_on: Date | None = None
    ends_on: Date | None = None
    days: list[DailyMenuPayload] | None = Field(default=None, min_length=1, max_length=7)
    notes: str | None = Field(default=None, min_length=1, max_length=2000)

    @field_validator("title", "notes", mode="before")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped or None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Weekly menu title cannot be null")
        if "meal_type" in self.model_fields_set and self.meal_type is None:
            raise ValueError("Meal type cannot be null")
        if "days" in self.model_fields_set and self.days is None:
            raise ValueError("Weekly menu days cannot be null")
        if (
            self.starts_on is not None
            and self.ends_on is not None
            and self.ends_on < self.starts_on
        ):
            raise ValueError("Weekly menu end date cannot be before start date")
        return self


class MenuNutritionResponse(MenuNutritionPayload):
    @classmethod
    def from_nutrition(cls, nutrition: MenuNutrition) -> "MenuNutritionResponse":
        return cls.model_validate(nutrition.model_dump())


class MenuPortionResponse(MenuPortionPayload):
    @classmethod
    def from_portion(cls, portion: MenuPortion) -> "MenuPortionResponse":
        return cls.model_validate(portion.model_dump())


class MenuItemServingCountResponse(MenuItemServingCountPayload):
    @classmethod
    def from_serving(
        cls,
        serving: MenuItemServingCount,
    ) -> "MenuItemServingCountResponse":
        return cls.model_validate(serving.model_dump())


class DailyMenuItemResponse(DailyMenuItemPayload):
    id: PydanticObjectId

    @classmethod
    def from_item(cls, item: DailyMenuItem) -> "DailyMenuItemResponse":
        return cls(
            id=item.id,
            position=item.position,
            kind=item.kind,
            source_text=item.source_text,
            recipe_card_number=item.recipe_card_number,
            dish_card_id=item.dish_card_id,
            dish_card_version_id=item.dish_card_version_id,
            product_ingredient_id=item.product_ingredient_id,
            product_name_snapshot=item.product_name_snapshot,
            name=item.name,
            allergen_codes=item.allergen_codes,
            portions=[MenuPortionResponse.from_portion(portion) for portion in item.portions],
            servings=[
                MenuItemServingCountResponse.from_serving(serving) for serving in item.servings
            ],
            notes=item.notes,
        )


class DailyMenuResponse(DailyMenuPayload):
    items: list[DailyMenuItemResponse]

    @classmethod
    def from_day(cls, day: DailyMenu) -> "DailyMenuResponse":
        return cls(
            weekday=day.weekday,
            date=day.date,
            items=[DailyMenuItemResponse.from_item(item) for item in day.items],
            notes=day.notes,
        )


class WeeklyMenuResponse(DecimalResponseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    title: str
    school_id: PydanticObjectId | None
    source_menu_id: PydanticObjectId | None
    meal_type: MealType
    cycle_week: int | None
    starts_on: Date | None
    ends_on: Date | None
    status: WeeklyMenuStatus
    days: list[DailyMenuResponse]
    notes: str | None
    source_file_name: str | None
    source_sheet_name: str | None
    published_at: datetime | None
    created_by: PydanticObjectId | None
    updated_by: PydanticObjectId | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_menu(cls, menu: WeeklyMenu) -> "WeeklyMenuResponse":
        return cls(
            id=menu.id,
            title=menu.title,
            school_id=menu.school_id,
            source_menu_id=menu.source_menu_id,
            meal_type=menu.meal_type,
            cycle_week=menu.cycle_week,
            starts_on=menu.starts_on,
            ends_on=menu.ends_on,
            status=menu.status,
            days=[DailyMenuResponse.from_day(day) for day in menu.days],
            notes=menu.notes,
            source_file_name=menu.source_file_name,
            source_sheet_name=menu.source_sheet_name,
            published_at=menu.published_at,
            created_by=menu.created_by,
            updated_by=menu.updated_by,
            created_at=menu.created_at,
            updated_at=menu.updated_at,
        )


class WeeklyMenuListResponse(BaseModel):
    items: list[WeeklyMenuResponse]
    total: int
    offset: int
    limit: int


class PublishWeeklyMenuRequest(BaseModel):
    school_ids: list[PydanticObjectId] | None = None
    replace_existing: bool = False


class PublishWeeklyMenuResponse(BaseModel):
    source_menu_id: PydanticObjectId
    target_school_ids: list[PydanticObjectId]
    created_menu_ids: list[PydanticObjectId]
    replaced_menu_ids: list[PydanticObjectId]
    skipped_existing_school_ids: list[PydanticObjectId]


class WeeklyMenuImportPreviewResponse(DecimalResponseModel):
    filename: str
    sheet_name: str
    warnings: list[str]
    menu: CreateWeeklyMenuRequest
