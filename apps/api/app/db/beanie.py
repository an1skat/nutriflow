from collections.abc import Mapping
from typing import Any

from beanie import Document, init_beanie

from app.db.mongo import get_database
from app.modules.identity.models import RefreshSession, School, User
from app.modules.menus.models import MenuChangeRequest, MenuImportPreviewSession, WeeklyMenu
from app.modules.recipe.models import (
    Allergen,
    DishCard,
    DishCardVersion,
    Ingredient,
)

MENU_IMPORT_PREVIEW_TTL_INDEX_KEY = [("expires_at", 1)]
MENU_IMPORT_PREVIEW_TTL_SECONDS = 0


def get_document_models() -> list[type[Document]]:
    return [
        School,
        User,
        RefreshSession,
        Ingredient,
        Allergen,
        DishCard,
        DishCardVersion,
        WeeklyMenu,
        MenuChangeRequest,
        MenuImportPreviewSession,
    ]


def find_stale_menu_import_preview_index_names(
    index_information: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    stale_indexes: list[str] = []

    for name, details in index_information.items():
        if details.get("key") != MENU_IMPORT_PREVIEW_TTL_INDEX_KEY:
            continue
        if details.get("expireAfterSeconds") == MENU_IMPORT_PREVIEW_TTL_SECONDS:
            continue
        stale_indexes.append(name)

    return stale_indexes


async def drop_stale_menu_import_preview_indexes() -> None:
    collection = get_database()[MenuImportPreviewSession.Settings.name]
    index_information = await collection.index_information()

    for index_name in find_stale_menu_import_preview_index_names(index_information):
        await collection.drop_index(index_name)


async def init_odm() -> None:
    await drop_stale_menu_import_preview_indexes()
    await init_beanie(database=get_database(), document_models=get_document_models())
