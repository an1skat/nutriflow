from datetime import date as Date
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from beanie import PydanticObjectId
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.modules.identity.models import AgeGroup
from app.modules.menu_requirements.models import (
    MenuRequirement,
    MenuRequirementCell,
    MenuRequirementDish,
    MenuRequirementIngredientRow,
)
from app.modules.menus.models import MealType, MenuItemKind, Weekday
from app.modules.nutrition.domain import NormativeContributionSnapshot
from app.modules.recipe.models import AmountDecimal

EditableIngredientName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]


class GenerateMenuRequirementsRequest(BaseModel):
    weekly_menu_id: PydanticObjectId
    weekday: Weekday
    service_date: Date


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
    normative_contributions: list[NormativeContributionSnapshot]

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


class UpdateMenuRequirementCellRequest(BaseModel):
    menu_item_id: PydanticObjectId
    net_per_person_g: AmountDecimal = Field(ge=0)


class UpdateMenuRequirementIngredientRowRequest(BaseModel):
    key: str = Field(min_length=1, max_length=300)
    ingredient_name: EditableIngredientName
    cells: list[UpdateMenuRequirementCellRequest]


class UpdateMenuRequirementRequest(BaseModel):
    ingredient_rows: list[UpdateMenuRequirementIngredientRowRequest] = Field(min_length=1)


class MenuRequirementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    school_id: PydanticObjectId
    school_name: str
    school_admin_owner_id: PydanticObjectId | None
    school_admin_owner_username: str | None
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
    def from_requirement(
        cls,
        requirement: MenuRequirement,
        *,
        school_name: str,
        school_admin_owner_id: PydanticObjectId | None,
        school_admin_owner_username: str | None,
    ) -> "MenuRequirementResponse":
        return cls(
            id=requirement.id,
            school_id=requirement.school_id,
            school_name=school_name,
            school_admin_owner_id=school_admin_owner_id,
            school_admin_owner_username=school_admin_owner_username,
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


class MenuRequirementReportGranularity(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class MenuRequirementAggregateStatus(StrEnum):
    COMPLETE = "complete"
    MISSING = "missing"
    STALE = "stale"
    MIXED = "mixed"


class MenuRequirementDishKeyReliability(StrEnum):
    STABLE = "stable"
    NAME_FALLBACK = "name_fallback"


class MenuRequirementCalendarDayResponse(BaseModel):
    service_date: Date
    expected_requirements: int
    generated_requirements: int
    missing_requirements: int
    stale_requirements: int
    status: MenuRequirementAggregateStatus


class MenuRequirementCalendarWeekResponse(BaseModel):
    week_index: int
    date_from: Date
    date_to: Date
    generated_days: int
    missing_days: int
    stale_days: int
    status: MenuRequirementAggregateStatus
    days: list[MenuRequirementCalendarDayResponse]


class MenuRequirementCalendarMonthResponse(BaseModel):
    month: int
    date_from: Date
    date_to: Date
    total_days: int
    working_days: int
    generated_days: int
    missing_days: int
    stale_days: int
    status: MenuRequirementAggregateStatus
    weeks: list[MenuRequirementCalendarWeekResponse]


class MenuRequirementCalendarResponse(BaseModel):
    school_id: PydanticObjectId
    school_name: str
    year: int
    months: list[MenuRequirementCalendarMonthResponse]


class MenuRequirementReportDishResponse(BaseModel):
    aggregate_key: str
    name: str
    kind: MenuItemKind
    recipe_card_number: str | None
    yield_amount: str
    key_reliability: MenuRequirementDishKeyReliability
    children_count_total: int


class MenuRequirementReportBreakdownItemResponse(BaseModel):
    requirement_id: PydanticObjectId | None
    service_date: Date
    school_group_id: PydanticObjectId
    school_group_name: str
    menu_title: str | None
    net_per_person_g: AmountDecimal | None
    children_count: int | None
    issue_total_raw_g: AmountDecimal | None
    issue_total_rounded_g: int | None
    status: MenuRequirementAggregateStatus


class MenuRequirementReportCellResponse(BaseModel):
    dish_key: str
    net_per_person_g: AmountDecimal
    issue_total_raw_g: AmountDecimal
    issue_total_rounded_g: int
    breakdown: list[MenuRequirementReportBreakdownItemResponse]


class MenuRequirementReportIngredientRowResponse(BaseModel):
    key: str
    ingredient_id: PydanticObjectId | None
    ingredient_name: str
    cells: list[MenuRequirementReportCellResponse]
    per_person_total_g: AmountDecimal
    issue_total_raw_g: AmountDecimal
    issue_total_rounded_g: int


class MenuRequirementReportGroupResponse(BaseModel):
    school_group_id: PydanticObjectId
    school_group_name: str
    age_group: AgeGroup
    dishes: list[MenuRequirementReportDishResponse]
    ingredient_rows: list[MenuRequirementReportIngredientRowResponse]


class MenuRequirementReportResponse(BaseModel):
    school_id: PydanticObjectId
    school_name: str
    date_from: Date
    date_to: Date
    granularity: MenuRequirementReportGranularity
    meal_type: MealType | None
    school_group_id: PydanticObjectId | None
    status: MenuRequirementAggregateStatus
    missing_dates: list[Date]
    stale_dates: list[Date]
    groups: list[MenuRequirementReportGroupResponse]
