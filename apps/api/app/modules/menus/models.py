from datetime import date as Date
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Self

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator
from pymongo import ASCENDING, IndexModel

from app.modules.identity.models import AgeGroup, utc_now
from app.modules.recipe.models import AmountDecimal

MenuText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
MenuNote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
YieldAmount = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class MealType(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"


class Weekday(StrEnum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class WeeklyMenuStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    REVOKED = "revoked"


class MenuItemKind(StrEnum):
    DISH_CARD = "dish_card"
    PRODUCT = "product"


class MenuImportDiagnosticLevel(StrEnum):
    WARNING = "warning"
    ERROR = "error"


class MenuImportPreviewStatus(StrEnum):
    PREVIEWED = "previewed"
    COMMITTING = "committing"
    COMMITTED = "committed"
    FAILED = "failed"


class MenuChangeRequestStatus(StrEnum):
    PENDING = "pending"
    REVIEWED = "reviewed"


class DayCloseReason(StrEnum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class MenuNutrition(BaseModel):
    kcal: AmountDecimal | None = None
    proteins: AmountDecimal | None = None
    fats: AmountDecimal | None = None
    carbs: AmountDecimal | None = None


class MenuPortionCalculationSource(BaseModel):
    portion_variant_id: PydanticObjectId
    yield_amount: YieldAmount


class MenuPortion(BaseModel):
    age_group: AgeGroup
    yield_amount: YieldAmount
    dish_card_portion_variant_id: PydanticObjectId | None = None
    calculated_from: MenuPortionCalculationSource | None = None
    nutrition: MenuNutrition = Field(default_factory=MenuNutrition)


class MenuItemServingCount(BaseModel):
    school_group_id: PydanticObjectId
    age_group: AgeGroup
    children_count: int = Field(ge=0, le=100_000)


class DailyMenuItem(BaseModel):
    id: PydanticObjectId = Field(default_factory=PydanticObjectId)
    position: int = Field(ge=1, le=200)
    kind: MenuItemKind = MenuItemKind.DISH_CARD
    source_text: MenuText | None = None
    recipe_card_number: str | None = Field(default=None, min_length=1, max_length=80)
    dish_card_id: PydanticObjectId | None = None
    dish_card_version_id: PydanticObjectId | None = None
    product_ingredient_id: PydanticObjectId | None = None
    product_name_snapshot: MenuText | None = None
    name: MenuText
    allergen_codes: list[str] = Field(default_factory=list)
    portions: list[MenuPortion] = Field(default_factory=list, min_length=1)
    servings: list[MenuItemServingCount] = Field(default_factory=list)
    notes: MenuNote | None = None

    @field_validator("recipe_card_number", "source_text", "product_name_snapshot", "notes")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("allergen_codes", mode="before")
    @classmethod
    def normalize_allergen_codes(cls, value: list[str] | None) -> list[str]:
        if value is None:
            return []
        return sorted({item.strip().upper() for item in value if item and item.strip()})

    @model_validator(mode="after")
    def validate_reference_shape(self) -> Self:
        serving_group_ids = [serving.school_group_id for serving in self.servings]
        if len(serving_group_ids) != len(set(serving_group_ids)):
            raise ValueError("Daily menu item servings must be unique by school group")

        if self.kind == MenuItemKind.PRODUCT:
            if self.dish_card_id is not None or self.dish_card_version_id is not None:
                raise ValueError("Product menu item cannot reference a dish card")
            if self.product_name_snapshot is None:
                self.product_name_snapshot = self.name

        if self.kind == MenuItemKind.DISH_CARD and self.product_ingredient_id is not None:
            raise ValueError("Dish card menu item cannot reference a product ingredient")

        return self


class DailyMenu(BaseModel):
    weekday: Weekday
    date: Date | None = None
    items: list[DailyMenuItem] = Field(default_factory=list, min_length=1)
    notes: MenuNote | None = None
    closed_at: datetime | None = None
    closed_by: PydanticObjectId | None = None
    close_reason: DayCloseReason | None = None
    close_notification_pending: bool = False
    close_notification_sent_at: datetime | None = None
    dev_reopened_at: datetime | None = None

    @model_validator(mode="after")
    def validate_item_positions(self) -> Self:
        positions = [item.position for item in self.items]
        if len(positions) != len(set(positions)):
            raise ValueError("Daily menu item positions must be unique")
        return self


class WeeklyMenu(Document):
    title: MenuText
    school_id: PydanticObjectId | None = None
    source_menu_id: PydanticObjectId | None = None
    meal_type: MealType
    cycle_week: int | None = Field(default=None, ge=1, le=53)
    starts_on: Date | None = None
    ends_on: Date | None = None
    status: WeeklyMenuStatus = WeeklyMenuStatus.DRAFT
    days: list[DailyMenu] = Field(default_factory=list, min_length=1, max_length=7)
    notes: MenuNote | None = None
    source_file_name: str | None = Field(default=None, max_length=255)
    source_sheet_name: str | None = Field(default=None, max_length=120)
    published_at: datetime | None = None
    archived_from_status: WeeklyMenuStatus | None = None
    revoked_at: datetime | None = None
    revoked_by: PydanticObjectId | None = None
    revoke_reason: str | None = Field(default=None, max_length=80)
    created_by: PydanticObjectId | None = None
    updated_by: PydanticObjectId | None = None
    revision: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def validate_week_shape(self) -> Self:
        weekdays = [day.weekday for day in self.days]
        if len(weekdays) != len(set(weekdays)):
            raise ValueError("Weekly menu days must be unique")
        if (
            self.starts_on is not None
            and self.ends_on is not None
            and self.ends_on < self.starts_on
        ):
            raise ValueError("Weekly menu end date cannot be before start date")
        return self

    class Settings:
        name = "weekly_menus"
        indexes = [
            IndexModel(
                [
                    ("school_id", ASCENDING),
                    ("meal_type", ASCENDING),
                    ("status", ASCENDING),
                    ("starts_on", ASCENDING),
                ],
                name="ix_weekly_menu_school_meal_status_start",
            ),
            IndexModel(
                [
                    ("source_menu_id", ASCENDING),
                    ("school_id", ASCENDING),
                ],
                name="ix_weekly_menu_source_school",
            ),
            IndexModel([("created_at", ASCENDING)], name="ix_weekly_menu_created_at"),
        ]


class MenuFieldChange(BaseModel):
    weekday: Weekday
    item_id: PydanticObjectId
    position: int = Field(ge=1, le=200)
    field: str = Field(min_length=1, max_length=80)
    before_value: Any = None
    after_value: Any = None


class MenuChangeRequest(Document):
    menu_id: PydanticObjectId
    source_menu_id: PydanticObjectId | None = None
    school_id: PydanticObjectId
    submitted_by: PydanticObjectId
    menu_title: MenuText
    meal_type: MealType
    cycle_week: int | None = Field(default=None, ge=1, le=53)
    starts_on: Date | None = None
    ends_on: Date | None = None
    days_snapshot: list[DailyMenu] = Field(default_factory=list, min_length=1, max_length=7)
    changes: list[MenuFieldChange] = Field(default_factory=list, min_length=1)
    status: MenuChangeRequestStatus = MenuChangeRequestStatus.PENDING
    reviewed_by: PydanticObjectId | None = None
    reviewed_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "menu_change_requests"
        indexes = [
            IndexModel(
                [("status", ASCENDING), ("created_at", ASCENDING)],
                name="ix_menu_change_request_status_created",
            ),
            IndexModel(
                [("school_id", ASCENDING), ("created_at", ASCENDING)],
                name="ix_menu_change_request_school_created",
            ),
            IndexModel(
                [("menu_id", ASCENDING), ("created_at", ASCENDING)],
                name="ix_menu_change_request_menu_created",
            ),
        ]


class MenuImportDiagnostic(BaseModel):
    level: MenuImportDiagnosticLevel
    message: str = Field(min_length=1, max_length=500)
    code: str = Field(min_length=1, max_length=80)
    sheet_name: str | None = Field(default=None, max_length=120)
    row_number: int | None = Field(default=None, ge=1)
    column_letter: str | None = Field(default=None, max_length=8)
    cell: str | None = Field(default=None, max_length=12)


class MenuImportPreviewSession(Document):
    owner_user_id: PydanticObjectId
    filename: str = Field(min_length=1, max_length=255)
    meal_type: MealType
    available_sheet_names: list[str] = Field(default_factory=list)
    selected_sheet_name: str | None = Field(default=None, max_length=120)
    parsed_sheet_names: list[str] = Field(default_factory=list)
    title_override: str | None = Field(default=None, max_length=255)
    diagnostics: list[MenuImportDiagnostic] = Field(default_factory=list)
    status: MenuImportPreviewStatus = MenuImportPreviewStatus.PREVIEWED
    commit_error: str | None = Field(default=None, max_length=500)
    menu_payload: dict[str, Any] | None = None
    menu_payloads: list[dict[str, Any]] = Field(default_factory=list)
    expires_at: datetime
    committed_menu_id: PydanticObjectId | None = None
    committed_menu_ids: list[PydanticObjectId] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "menu_import_preview_sessions"
        indexes = [
            IndexModel([("owner_user_id", ASCENDING)], name="ix_menu_import_preview_owner"),
            IndexModel(
                [("expires_at", ASCENDING)],
                name="ix_menu_import_preview_expires_at",
                expireAfterSeconds=0,
            ),
            IndexModel([("created_at", ASCENDING)], name="ix_menu_import_preview_created_at"),
        ]
