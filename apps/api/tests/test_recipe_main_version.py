from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from beanie import PydanticObjectId

from app.modules.recipe import service
from app.modules.recipe.models import DishCardVersionStatus

pytestmark = pytest.mark.no_clean_database


@pytest.mark.parametrize("status", [DishCardVersionStatus.CONFIRMED, DishCardVersionStatus.DRAFT])
async def test_set_main_dish_card_version_updates_version(monkeypatch, status):
    dish_card_id = PydanticObjectId()
    version_id = PydanticObjectId()
    version = SimpleNamespace(
        id=version_id,
        dish_card_id=dish_card_id,
        status=status,
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
    assert version.status == status
    save.assert_awaited_once()


@pytest.mark.parametrize(
    "status", [DishCardVersionStatus.IMPORT_PREVIEW, DishCardVersionStatus.ARCHIVED]
)
async def test_set_main_dish_card_version_rejects_ineligible_status(monkeypatch, status):
    version_id = PydanticObjectId()
    version = SimpleNamespace(
        id=version_id,
        dish_card_id=PydanticObjectId(),
        status=status,
    )
    monkeypatch.setattr(service, "get_dish_card_version", AsyncMock(return_value=version))

    with pytest.raises(
        service.DishCardVersionNotConfirmedError,
        match="Only confirmed or draft versions can be selected as main",
    ):
        await service.set_main_dish_card_version(version_id)
