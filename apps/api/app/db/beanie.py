from beanie import Document, init_beanie

from app.db.mongo import get_database
from app.modules.identity.models import RefreshSession, School, User
from app.modules.menus.models import WeeklyMenu
from app.modules.recipe.models import (
    Allergen,
    DishCard,
    DishCardVersion,
    Ingredient,
)


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
    ]


async def init_odm() -> None:
    await init_beanie(database=get_database(), document_models=get_document_models())
