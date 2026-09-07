from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from beanie import PydanticObjectId

from app.modules.recipe import service
from app.modules.recipe.models import DishCardVersionStatus

pytestmark = pytest.mark.no_clean_database


async def test_set_main_dish_card_version_updates_confirmed_version(monkeypatch):
    dish_card_id = PydanticObjectId()
    version_id = PydanticObjectId()
    version = SimpleNamespace(
        id=version_id,
        dish_card_id=dish_card_id,
        status=DishCardVersionStatus.CONFIRMED,
    )
    save = AsyncMock()
    dish_card = SimpleNamespace(
        current_version_id=PydanticObjectId(),
        updated_at=None,
        save=save,
    )
    monkeypatch.setattr(service, "get_dish_card_version", AsyncMock(return_value=version))
    monkeypatch.setattr(service, "get_dish_card", AsyncMock(return_value=dish_card))

    result = await service.set_main_dish_card_version(version_id)

    assert result.current_version_id == version_id
    save.assert_awaited_once()


async def test_set_main_dish_card_version_rejects_draft(monkeypatch):
    version_id = PydanticObjectId()
    version = SimpleNamespace(
        id=version_id,
        dish_card_id=PydanticObjectId(),
        status=DishCardVersionStatus.DRAFT,
    )
    monkeypatch.setattr(service, "get_dish_card_version", AsyncMock(return_value=version))

    with pytest.raises(
        service.DishCardVersionNotConfirmedError,
        match="Only confirmed versions can be selected as main",
    ):
        await service.set_main_dish_card_version(version_id)
