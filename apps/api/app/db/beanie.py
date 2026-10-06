from collections.abc import Mapping
from typing import Any

from beanie import Document, init_beanie

from app.db.mongo import get_database
from app.modules.identity.models import Community, RefreshSession, School, User
from app.modules.menu_requirements.models import MenuRequirement
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
        Community,
        School,
        User,
        RefreshSession,
        Ingredient,
        Allergen,
        DishCard,
        DishCardVersion,
        WeeklyMenu,
        MenuRequirement,
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


async def upgrade_school_copy_index() -> None:
    collection = get_database()[WeeklyMenu.Settings.name]
    indexes = await collection.index_information()
    if "uq_weekly_menu_source_school" not in indexes:
        return
    # Build the new constraint first; never leave active copies unprotected.
    published_index = next(
        index
        for index in WeeklyMenu.Settings.indexes
        if index.document["name"] == "uq_weekly_menu_published_source_school"
    )
    await collection.create_indexes([published_index])
    await collection.drop_index("uq_weekly_menu_source_school")


async def init_odm() -> None:
    await drop_stale_menu_import_preview_indexes()
    await upgrade_school_copy_index()
    await init_beanie(database=get_database(), document_models=get_document_models())
