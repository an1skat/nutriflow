from datetime import date as Date
from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, ConfigDict

from app.modules.identity.models import AgeGroup
from app.modules.menu_requirements.models import (
    MenuRequirement,
    MenuRequirementCell,
    MenuRequirementDish,
    MenuRequirementIngredientRow,
)
from app.modules.menus.models import MealType, MenuItemKind, Weekday
from app.modules.recipe.models import AmountDecimal


class GenerateMenuRequirementsRequest(BaseModel):
    weekly_menu_id: PydanticObjectId
    weekday: Weekday


class MenuRequirementDishResponse(BaseModel):
    menu_item_id: PydanticObjectId
    position: int
    kind: MenuItemKind
    name: str
    recipe_card_number: str | None
    dish_card_id: PydanticObjectId | None
    dish_card_version_id: PydanticObjectId | None
    portion_variant_id: PydanticObjectId | None
    product_ingredient_id: PydanticObjectId | None
    yield_amount: str
    children_count: int

    @classmethod
    def from_dish(cls, dish: MenuRequirementDish) -> "MenuRequirementDishResponse":
        return cls.model_validate(dish.model_dump())


class MenuRequirementCellResponse(BaseModel):
    menu_item_id: PydanticObjectId
    net_per_person_g: AmountDecimal

    @classmethod
    def from_cell(cls, cell: MenuRequirementCell) -> "MenuRequirementCellResponse":
        return cls.model_validate(cell.model_dump())


class MenuRequirementIngredientRowResponse(BaseModel):
    key: str
    ingredient_id: PydanticObjectId | None
    ingredient_name: str
    cells: list[MenuRequirementCellResponse]
    per_person_total_g: AmountDecimal
    issue_total_raw_g: AmountDecimal
    issue_total_rounded_g: int

    @classmethod
    def from_row(
        cls,
        row: MenuRequirementIngredientRow,
    ) -> "MenuRequirementIngredientRowResponse":
        return cls(
            key=row.key,
            ingredient_id=row.ingredient_id,
            ingredient_name=row.ingredient_name,
            cells=[MenuRequirementCellResponse.from_cell(cell) for cell in row.cells],
            per_person_total_g=row.per_person_total_g,
            issue_total_raw_g=row.issue_total_raw_g,
            issue_total_rounded_g=row.issue_total_rounded_g,
        )


class MenuRequirementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    school_id: PydanticObjectId
    weekly_menu_id: PydanticObjectId
    source_menu_id: PydanticObjectId | None
    menu_title: str
    meal_type: MealType
    weekday: Weekday
    service_date: Date
    school_group_id: PydanticObjectId
    school_group_name: str
    age_group: AgeGroup
    dishes: list[MenuRequirementDishResponse]
    ingredient_rows: list[MenuRequirementIngredientRowResponse]
    source_day_hash: str
    revision: int
    generated_by: PydanticObjectId
    generated_at: datetime
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_requirement(cls, requirement: MenuRequirement) -> "MenuRequirementResponse":
        return cls(
            id=requirement.id,
            school_id=requirement.school_id,
            weekly_menu_id=requirement.weekly_menu_id,
            source_menu_id=requirement.source_menu_id,
            menu_title=requirement.menu_title,
            meal_type=requirement.meal_type,
            weekday=requirement.weekday,
            service_date=requirement.service_date,
            school_group_id=requirement.school_group_id,
            school_group_name=requirement.school_group_name,
            age_group=requirement.age_group,
            dishes=[MenuRequirementDishResponse.from_dish(dish) for dish in requirement.dishes],
            ingredient_rows=[
                MenuRequirementIngredientRowResponse.from_row(row)
                for row in requirement.ingredient_rows
            ],
            source_day_hash=requirement.source_day_hash,
            revision=requirement.revision,
            generated_by=requirement.generated_by,
            generated_at=requirement.generated_at,
            created_at=requirement.created_at,
            updated_at=requirement.updated_at,
        )


class MenuRequirementListResponse(BaseModel):
    items: list[MenuRequirementResponse]
    total: int
    offset: int
    limit: int


class GenerateMenuRequirementsResponse(BaseModel):
    items: list[MenuRequirementResponse]
