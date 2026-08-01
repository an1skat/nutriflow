import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest
from beanie import PydanticObjectId

from app.modules.identity.models import AgeGroup, User, UserRole
from app.modules.menus import service
from app.modules.menus.errors import MenuAccessDeniedError
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MenuChangeRequestStatus,
    MenuItemServingCount,
    MenuPortion,
    Weekday,
)
from app.modules.menus.service import _collect_school_dish_changes, _merge_distributed_days

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


def test_template_update_preserves_school_dish_replacement() -> None:
    source_days = build_days()
    school_days = deepcopy(source_days)
    school_item = school_days[0].items[0]
    school_item.recipe_card_number = "2.17"
    school_item.name = "Рис з овочами"

    merged = _merge_distributed_days(source_days, school_days)

    assert merged[0].items[0].recipe_card_number == "2.17"
    assert merged[0].items[0].name == "Рис з овочами"


def test_admin_can_only_list_and_open_change_requests_from_owned_schools(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    administrator_id = PydanticObjectId()
    own_school_id = PydanticObjectId()
    other_school_id = PydanticObjectId()
    administrator = User.model_construct(id=administrator_id, role=UserRole.ADMIN)
    captured_filters: list[dict[str, object]] = []

    class RequestQuery:
        async def count(self) -> int:
            return 0

        def sort(self, _: str) -> "RequestQuery":
            return self

        def skip(self, _: int) -> "RequestQuery":
            return self

        def limit(self, _: int) -> "RequestQuery":
            return self

        async def to_list(self) -> list[object]:
            return []

    class SchoolQuery:
        async def to_list(self) -> list[object]:
            return []

    async def get_owned_school_ids(_: User) -> list[PydanticObjectId]:
        return [own_school_id]

    def find_change_requests(filters: dict[str, object]) -> RequestQuery:
        captured_filters.append(filters)
        return RequestQuery()

    monkeypatch.setattr(service, "_get_admin_school_ids", get_owned_school_ids)
    monkeypatch.setattr(service.MenuChangeRequest, "find", find_change_requests)
    monkeypatch.setattr(service.School, "find", lambda _: SchoolQuery())

    requests, total = asyncio.run(
        service.list_menu_change_requests(
            administrator,
            offset=0,
            limit=50,
            status=MenuChangeRequestStatus.PENDING,
        )
    )

    assert requests == []
    assert total == 0
    assert captured_filters == [
        {
            "status": MenuChangeRequestStatus.PENDING.value,
            "school_id": {"$in": [own_school_id]},
        }
    ]

    async def get_change_request(_: PydanticObjectId) -> SimpleNamespace:
        return SimpleNamespace(school_id=other_school_id)

    async def get_school(_: PydanticObjectId) -> SimpleNamespace:
        return SimpleNamespace(admin_owner_id=PydanticObjectId())

    monkeypatch.setattr(service.MenuChangeRequest, "get", get_change_request)
    monkeypatch.setattr(service.School, "get", get_school)

    with pytest.raises(MenuAccessDeniedError, match="School access denied"):
        asyncio.run(service.get_menu_change_request(PydanticObjectId(), administrator))
