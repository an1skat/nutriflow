from copy import deepcopy

import pytest
from beanie import PydanticObjectId

from app.modules.identity.models import AgeGroup
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MenuItemServingCount,
    MenuPortion,
    Weekday,
)
from app.modules.menus.service import _collect_school_dish_changes

pytestmark = pytest.mark.no_clean_database


def build_days() -> list[DailyMenu]:
    return [
        DailyMenu(
            weekday=Weekday.MONDAY,
            items=[
                DailyMenuItem(
                    position=1,
                    recipe_card_number="1.01",
                    name="Каша гречана",
                    portions=[
                        MenuPortion(
                            age_group=AgeGroup.SIX_TO_ELEVEN,
                            yield_amount="200",
                        )
                    ],
                    servings=[
                        MenuItemServingCount(
                            school_group_id=PydanticObjectId(),
                            age_group=AgeGroup.SIX_TO_ELEVEN,
                            children_count=20,
                        )
                    ],
                )
            ],
        )
    ]


def test_children_count_change_does_not_create_technologist_request() -> None:
    previous_days = build_days()
    updated_days = deepcopy(previous_days)
    updated_days[0].items[0].servings[0].children_count = 24

    changes = _collect_school_dish_changes(previous_days, updated_days)

    assert changes == []


def test_dish_replacement_creates_readable_field_diff() -> None:
    previous_days = build_days()
    updated_days = deepcopy(previous_days)
    updated_item = updated_days[0].items[0]
    updated_item.recipe_card_number = "2.17"
    updated_item.name = "Рис з овочами"
    updated_item.portions[0].yield_amount = "220"

    changes = _collect_school_dish_changes(previous_days, updated_days)

    changed_fields = {change.field for change in changes}
    assert changed_fields == {"recipe_card_number", "name", "portions"}
    name_change = next(change for change in changes if change.field == "name")
    assert name_change.before_value == "Каша гречана"
    assert name_change.after_value == "Рис з овочами"
