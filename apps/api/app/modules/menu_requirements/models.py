from datetime import date as Date
from datetime import datetime
from decimal import Decimal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.modules.identity.models import AgeGroup, utc_now
from app.modules.menus.models import MealType, MenuItemKind, Weekday
from app.modules.nutrition.domain import NormativeContributionSnapshot
from app.modules.recipe.models import AmountDecimal


class MenuRequirementDish(BaseModel):
    menu_item_id: PydanticObjectId
    position: int = Field(ge=1, le=200)
    kind: MenuItemKind
    name: str = Field(min_length=1, max_length=255)
    recipe_card_number: str | None = Field(default=None, max_length=80)
    dish_card_id: PydanticObjectId | None = None
    dish_card_version_id: PydanticObjectId | None = None
    portion_variant_id: PydanticObjectId | None = None
    product_ingredient_id: PydanticObjectId | None = None
    yield_amount: str = Field(min_length=1, max_length=40)
    children_count: int = Field(ge=1, le=100_000)
    normative_contributions: list[NormativeContributionSnapshot] = Field(default_factory=list)


class MenuRequirementCell(BaseModel):
    menu_item_id: PydanticObjectId
    net_per_person_g: AmountDecimal = Field(ge=Decimal("0"))
    gross_per_person_g: AmountDecimal | None = Field(default=None, ge=Decimal("0"))


class MenuRequirementIngredientRow(BaseModel):
    key: str = Field(min_length=1, max_length=300)
    ingredient_id: PydanticObjectId | None = None
    ingredient_name: str = Field(min_length=1, max_length=200)
    cells: list[MenuRequirementCell] = Field(default_factory=list)
    per_person_total_g: AmountDecimal = Field(ge=Decimal("0"))
    issue_total_raw_g: AmountDecimal = Field(ge=Decimal("0"))
    issue_total_rounded_g: int = Field(ge=0)
    gross_per_person_total_g: AmountDecimal | None = Field(default=None, ge=Decimal("0"))
    gross_issue_total_raw_g: AmountDecimal | None = Field(default=None, ge=Decimal("0"))
    gross_issue_total_rounded_g: int | None = Field(default=None, ge=0)

    def has_values(self) -> bool:
        return any(
            cell.net_per_person_g != Decimal("0")
            or (cell.gross_per_person_g is not None and cell.gross_per_person_g != Decimal("0"))
            for cell in self.cells
        )


class MenuRequirement(Document):
    school_id: PydanticObjectId
    weekly_menu_id: PydanticObjectId
    source_menu_id: PydanticObjectId | None = None
    menu_title: str = Field(min_length=1, max_length=255)
    meal_type: MealType
    weekday: Weekday
    service_date: Date
    school_group_id: PydanticObjectId
    school_group_name: str = Field(min_length=1, max_length=200)
    age_group: AgeGroup
    dishes: list[MenuRequirementDish] = Field(default_factory=list, min_length=1)
    ingredient_rows: list[MenuRequirementIngredientRow] = Field(default_factory=list)
    source_day_hash: str = Field(min_length=64, max_length=64)
    revision: int = Field(default=1, ge=1)
    generated_by: PydanticObjectId
    generated_at: datetime = Field(default_factory=utc_now)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "menu_requirements"
        indexes = [
            IndexModel(
                [
                    ("weekly_menu_id", ASCENDING),
                    ("weekday", ASCENDING),
                    ("school_group_id", ASCENDING),
                ],
                unique=True,
                name="uq_menu_requirement_menu_day_group",
            ),
            IndexModel(
                [
                    ("school_id", ASCENDING),
                    ("school_group_id", ASCENDING),
                    ("service_date", ASCENDING),
                    ("meal_type", ASCENDING),
                ],
                name="ix_menu_requirement_school_group_date_meal",
            ),
            IndexModel(
                [("school_id", ASCENDING), ("generated_at", DESCENDING)],
                name="ix_menu_requirement_school_generated",
            ),
        ]
