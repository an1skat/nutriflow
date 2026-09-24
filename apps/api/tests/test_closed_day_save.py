from copy import deepcopy
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from beanie import PydanticObjectId
from bson import BSON
from pymongo import MongoClient

from app.core.config import get_settings
from app.modules.menus import service
from app.modules.menus.models import DailyMenu
from app.modules.menus.reference_resolver import MenuReferenceCatalog
from app.modules.menus.schemas import DailyMenuPayload
from tests.test_menus_api import csrf_headers, dish_item, login, product_item, weekly_menu_payload


@pytest.fixture
def school_week(seeded_client):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    payload = weekly_menu_payload()
    payload["days"] = [
        {
            "weekday": weekday,
            "date": f"2026-09-{21 + index}",
            "items": [dish_item(), product_item()],
        }
        for index, weekday in enumerate(["monday", "tuesday", "wednesday"])
    ]
    response = client.post("/api/v1/menus/weekly", json=payload, headers=csrf_headers(client))
    assert response.status_code == 201, response.text
    source = response.json()
    response = client.post(
        f"/api/v1/menus/weekly/{source['id']}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    menu_id = response.json()["created_menu_ids"][0]
    settings = get_settings()
    with MongoClient(settings.mongo_uri, tz_aware=True) as mongo:
        collection = mongo[settings.mongo_db].weekly_menus
        menu = collection.find_one({"_id": PydanticObjectId(menu_id)})
        group = identities.own_school.groups[0]
        for day in menu["days"]:
            for item in day["items"]:
                item["servings"] = [
                    {
                        "school_group_id": group.id,
                        "age_group": group.age_group,
                        "children_count": 20,
                    }
                ]
            # Historical product snapshot predating resolver contribution backfill.
            day["items"][1]["portions"][0]["normative_contributions"] = []
        collection.replace_one({"_id": menu["_id"]}, menu)
        login(client, identities.school_user.username, identities.school_user_password)
        yield client, collection, menu


def close_days(collection, menu, weekdays):
    for day in menu["days"]:
        if day["weekday"] in weekdays:
            day.update(
                closed_at=datetime(2026, 9, 23, 12, tzinfo=UTC),
                closed_by=PydanticObjectId(),
                close_reason="manual",
                close_notification_pending=True,
                close_notification_sent_at=datetime(2026, 9, 23, 12, 1, tzinfo=UTC),
                reopened_at=datetime(2026, 9, 23, 11, tzinfo=UTC),
                reopened_by=PydanticObjectId(),
            )
    collection.replace_one({"_id": menu["_id"]}, menu)


@pytest.mark.parametrize("closed", [[], ["monday"], ["monday", "wednesday"]])
@pytest.mark.parametrize("edit", ["children_count", "dish"])
def test_open_tuesday_save_preserves_closed_snapshots(school_week, monkeypatch, closed, edit):
    client, collection, menu = school_week
    close_days(collection, menu, closed)
    url = f"/api/v1/menus/weekly/{menu['_id']}"
    original = collection.find_one({"_id": menu["_id"]})
    response = client.get(url).json()
    tuesday = response["days"][1]
    if edit == "children_count":
        tuesday["items"][0]["servings"][0]["children_count"] = 24
    else:
        tuesday["items"][0]["name"] = "Рис з овочами"
        tuesday["items"][0]["recipe_card_number"] = "2.17"

    resolver = AsyncMock(wraps=service.resolve_menu_item_references)
    monkeypatch.setattr(service, "resolve_menu_item_references", resolver)
    saved = client.patch(
        url,
        json={"revision": response["revision"], "days": response["days"]},
        headers=csrf_headers(client),
    )
    assert saved.status_code == 200, saved.text
    persisted = collection.find_one({"_id": menu["_id"]})
    assert persisted["revision"] == original["revision"] + 1
    for before, after in zip(original["days"], persisted["days"], strict=True):
        if before["weekday"] in closed:
            assert BSON.encode(before) == BSON.encode(after)
    resolved_ids = {item.id for call in resolver.call_args_list for item in call.args[0]}
    closed_ids = {
        item["id"] for day in original["days"] if day["weekday"] in closed for item in day["items"]
    }
    assert not resolved_ids & closed_ids
    assert persisted["days"][1]["items"][0]["id"] in resolved_ids
    if edit == "children_count":
        assert persisted["days"][1]["items"][0]["servings"][0]["children_count"] == 24
    else:
        assert persisted["days"][1]["items"][0]["name"] == "Рис з овочами"
        assert persisted["days"][1]["items"][0]["recipe_card_number"] == "2.17"


@pytest.mark.parametrize(
    "field",
    [
        "name",
        "children_count",
        "yield_amount",
        "nutrition",
        "normative_contributions",
        "allergen_codes",
        "position",
        "is_school_added",
        "is_school_customized",
        "remove",
    ],
)
def test_closed_monday_tampering_rejected_before_resolution(school_week, monkeypatch, field):
    client, collection, menu = school_week
    close_days(collection, menu, ["monday"])
    url = f"/api/v1/menus/weekly/{menu['_id']}"
    original = collection.find_one({"_id": menu["_id"]})
    response = client.get(url).json()
    monday = response["days"][0]
    item = monday["items"][1]
    portion = item["portions"][0]
    if field == "children_count":
        item["servings"][0][field] += 1
    elif field == "yield_amount":
        portion[field] = "40/15"
    elif field == "nutrition":
        portion[field]["kcal"] = "999"
    elif field == "normative_contributions":
        portion[field] = [{"group_code": "bread", "amount": "30", "unit": "g"}]
    elif field == "allergen_codes":
        item[field] = []
    elif field == "position":
        item[field] = 3  # Must not be hidden by position resequencing.
    elif field in {"is_school_added", "is_school_customized"}:
        item[field] = True
    elif field == "remove":
        monday["items"].pop()
    else:
        item[field] = "Changed"
    resolver = AsyncMock()
    monkeypatch.setattr(service, "resolve_menu_item_references", resolver)
    saved = client.patch(
        url,
        json={"revision": response["revision"], "days": response["days"]},
        headers=csrf_headers(client),
    )
    assert saved.status_code == 400, saved.text
    assert saved.json()["detail"] == "Closed daily menus cannot be changed"
    resolver.assert_not_called()
    assert collection.find_one({"_id": menu["_id"]}) == original


@pytest.mark.no_clean_database
async def test_reconstruction_changes_only_legacy_product_normative_contributions(monkeypatch):
    item = product_item()
    item["id"] = PydanticObjectId()
    day = DailyMenu(weekday="monday", items=[item], closed_at=datetime(2026, 9, 21, tzinfo=UTC))
    payload = DailyMenuPayload.model_validate(day.model_dump())
    monkeypatch.setattr(
        MenuReferenceCatalog,
        "load",
        AsyncMock(return_value=MenuReferenceCatalog({}, {}, {}, {}, {}, {})),
    )
    reconstructed = (await service._to_daily_menus([payload]))[0]
    before = service._day_content_dump(day)
    after = service._day_content_dump(reconstructed)
    assert before["items"][0]["portions"][0]["normative_contributions"] == []
    assert after["items"][0]["portions"][0]["normative_contributions"] == [
        {
            "group_code": "bread",
            "amount": "30",
            "unit": "g",
            "basis": "per_portion",
            "portion_equivalent": None,
            "product_variant": None,
        },
        {
            "group_code": "dairy",
            "amount": "15",
            "unit": "g",
            "basis": "per_portion",
            "portion_equivalent": None,
            "product_variant": "hard_cheese",
        },
    ]
    restored = deepcopy(after)
    restored["items"][0]["portions"][0]["normative_contributions"] = []
    assert restored == before
