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
    MenuChangeRequest,
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


def test_added_item_creates_readable_change_without_changing_schema() -> None:
    previous_days = build_days()
    updated_days = deepcopy(previous_days)
    added_item = DailyMenuItem(
        position=2,
        kind="product",
        name="Хліб пшеничний",
        portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="30")],
    )
    updated_days[0].items.append(added_item)

    changes = _collect_school_dish_changes(previous_days, updated_days)

    assert len(changes) == 1
    assert changes[0].item_id == added_item.id
    assert changes[0].field == "item_added"
    assert changes[0].before_value is None
    assert changes[0].after_value == "Хліб пшеничний"


@pytest.mark.asyncio
async def test_legacy_menu_change_request_still_deserializes() -> None:
    from app.db.beanie import init_odm
    from app.db.mongo import close_mongo, connect_mongo

    await connect_mongo()
    try:
        await init_odm()
        days = build_days()
        request = MenuChangeRequest.model_validate(
            {
                "menu_id": PydanticObjectId(),
                "school_id": PydanticObjectId(),
                "submitted_by": PydanticObjectId(),
                "menu_title": "Старе меню",
                "meal_type": "lunch",
                "days_snapshot": [day.model_dump() for day in days],
                "changes": [
                    {
                        "weekday": "monday",
                        "item_id": days[0].items[0].id,
                        "position": 1,
                        "field": "name",
                        "before_value": "Каша",
                        "after_value": "Каша гречана",
                    }
                ],
            }
        )

        assert request.changes[0].field == "name"
        assert request.status == MenuChangeRequestStatus.PENDING
    finally:
        await close_mongo()


def test_template_update_preserves_school_dish_replacement() -> None:
    source_days = build_days()
    school_days = deepcopy(source_days)
    school_item = school_days[0].items[0]
    school_item.recipe_card_number = "2.17"
    school_item.name = "Рис з овочами"
    school_item.is_school_customized = True

    merged = _merge_distributed_days(source_days, school_days)

    assert merged[0].items[0].recipe_card_number == "2.17"
    assert merged[0].items[0].name == "Рис з овочами"


def test_template_update_preserves_school_added_item_and_updates_template_dish() -> None:
    # 5 template items
    template_items = [
        DailyMenuItem(
            position=i,
            name=f"Страва {i}",
            portions=[
                MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount=f"{100 + i * 10}")
            ],
            servings=[
                MenuItemServingCount(
                    school_group_id=PydanticObjectId(),
                    age_group=AgeGroup.SIX_TO_ELEVEN,
                    children_count=15,
                )
            ],
        )
        for i in range(1, 6)
    ]
    template_days = [DailyMenu(weekday=Weekday.MONDAY, items=template_items)]

    # School A has the 5 template items + 6th local item
    school_a_days = deepcopy(template_days)
    bread_ingredient_id = PydanticObjectId()
    bread_item = DailyMenuItem(
        position=6,
        kind="product",
        product_ingredient_id=bread_ingredient_id,
        name="Хліб пшеничний",
        portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="30")],
        servings=[
            MenuItemServingCount(
                school_group_id=school_a_days[0].items[0].servings[0].school_group_id,
                age_group=AgeGroup.SIX_TO_ELEVEN,
                children_count=15,
            )
        ],
        is_school_added=True,
    )
    school_a_days[0].items.append(bread_item)
    school_a_item6_id = bread_item.id

    # Admin updates template item 2
    updated_template_days = deepcopy(template_days)
    updated_template_days[0].items[1].name = "Суп гороховий оновлений"
    updated_template_days[0].items[1].recipe_card_number = "1.05"

    merged_a = _merge_distributed_days(updated_template_days, school_a_days)

    assert len(merged_a[0].items) == 6
    # Template item 2 updated
    assert merged_a[0].items[1].name == "Суп гороховий оновлений"
    assert merged_a[0].items[1].recipe_card_number == "1.05"
    assert merged_a[0].items[1].servings[0].children_count == 15

    # School item 6 preserved
    item6 = merged_a[0].items[5]
    assert item6.id == school_a_item6_id
    assert item6.position == 6
    assert item6.name == "Хліб пшеничний"
    assert item6.product_ingredient_id == bread_ingredient_id
    assert item6.portions[0].yield_amount == "30"
    assert item6.servings[0].children_count == 15
    assert item6.is_school_added is True


def test_admin_adds_new_template_item_preserves_school_added_item_with_shifted_position() -> None:
    # 5 template items
    template_items = [
        DailyMenuItem(
            position=i,
            name=f"Страва {i}",
            portions=[
                MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount=f"{100 + i * 10}")
            ],
            servings=[
                MenuItemServingCount(
                    school_group_id=PydanticObjectId(),
                    age_group=AgeGroup.SIX_TO_ELEVEN,
                    children_count=15,
                )
            ],
        )
        for i in range(1, 6)
    ]
    template_days = [DailyMenu(weekday=Weekday.MONDAY, items=template_items)]

    # School A: 5 template items + local item 6
    school_a_days = deepcopy(template_days)
    bread_item = DailyMenuItem(
        position=6,
        kind="product",
        name="Хліб",
        portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="30")],
        servings=[
            MenuItemServingCount(
                school_group_id=PydanticObjectId(),
                age_group=AgeGroup.SIX_TO_ELEVEN,
                children_count=15,
            )
        ],
        is_school_added=True,
    )
    school_a_days[0].items.append(bread_item)
    school_a_item_id = bread_item.id

    # School B: only 5 template items
    school_b_days = deepcopy(template_days)

    # Admin adds NEW template item 6
    admin_days = deepcopy(template_days)
    new_template_item = DailyMenuItem(
        position=6,
        name="Компот з ягід (новий)",
        portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="200")],
    )
    admin_days[0].items.append(new_template_item)
    new_template_item_id = new_template_item.id

    # Propagate to School A and School B
    merged_a = _merge_distributed_days(admin_days, school_a_days)
    merged_b = _merge_distributed_days(admin_days, school_b_days)

    # School B gets 6 items (all 6 template items)
    assert len(merged_b[0].items) == 6
    assert [item.position for item in merged_b[0].items] == [1, 2, 3, 4, 5, 6]
    assert merged_b[0].items[5].id == new_template_item_id

    # School A gets 7 items: 6 template items + local item shifted to position 7
    assert len(merged_a[0].items) == 7
    assert [item.position for item in merged_a[0].items] == [1, 2, 3, 4, 5, 6, 7]
    assert merged_a[0].items[5].id == new_template_item_id
    assert merged_a[0].items[5].name == "Компот з ягід (новий)"

    local_item = merged_a[0].items[6]
    assert local_item.id == school_a_item_id
    assert local_item.position == 7
    assert local_item.name == "Хліб"
    assert local_item.portions[0].yield_amount == "30"
    assert local_item.is_school_added is True


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
