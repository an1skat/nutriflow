from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from beanie import PydanticObjectId

from app.modules.menu_requirements import service as requirements
from app.modules.menus.models import DailyMenuItem, MenuPortion
from app.modules.menus.reference_resolver import (
    MenuReferenceCatalog,
    MenuReferenceError,
    resolve_menu_item_references,
)
from app.modules.recipe.models import (
    DishCard,
    DishCardVersion,
    DishCardVersionStatus,
    IngredientAmount,
    Nutrition,
    PortionVariant,
)
from app.modules.recipe.schemas import CalculateIngredientsRequest
from app.modules.recipe.service import DishCardVersionNotConfirmedError, calculate_ingredient_lines

pytestmark = pytest.mark.no_clean_database


@pytest.mark.parametrize(
    ("status", "current", "matching_card", "usable"),
    [
        ("draft", True, True, True),
        ("draft", False, True, False),
        ("draft", True, False, False),
        ("import_preview", True, True, False),
        ("confirmed", False, True, True),
        ("archived", False, True, True),
    ],
)
async def test_consumers_only_allow_current_draft(
    monkeypatch, status, current, matching_card, usable
):
    card_id, version_id = PydanticObjectId(), PydanticObjectId()
    variant = PortionVariant(
        age_group="6-11", output_grams=Decimal("100"), nutrition=Nutrition(kcal=Decimal("42"))
    )
    version = DishCardVersion.model_construct(
        id=version_id,
        dish_card_id=card_id,
        version=1,
        status=DishCardVersionStatus(status),
        portion_variants=[variant],
        ingredient_amounts=[
            IngredientAmount(
                ingredient_name_snapshot="Морква",
                gross_amount=Decimal("25"),
                net_amount=Decimal("20"),
                unit="g",
                portion_variant_id=variant.id,
            )
        ],
    )
    card = DishCard.model_construct(
        id=card_id if matching_card else PydanticObjectId(),
        current_version_id=version_id if current else PydanticObjectId(),
    )
    item = DailyMenuItem.model_construct(
        name="Суп",
        dish_card_id=card.id,
        dish_card_version_id=version_id,
        portions=[MenuPortion(age_group="6-11", yield_amount="100")],
    )
    catalog = MenuReferenceCatalog({}, {}, {card.id: card}, {}, {version_id: version}, {})
    monkeypatch.setattr(MenuReferenceCatalog, "load", AsyncMock(return_value=catalog))
    monkeypatch.setattr(DishCardVersion, "get", AsyncMock(return_value=version))
    monkeypatch.setattr(DishCard, "get", AsyncMock(return_value=card))

    calculation = CalculateIngredientsRequest(portion_variant_id=variant.id, servings_count=3)
    if usable and status != "archived":
        assert calculate_ingredient_lines(version, calculation, dish_card=card)[0].gross_total == 75
    else:
        with pytest.raises(DishCardVersionNotConfirmedError):
            calculate_ingredient_lines(version, calculation, dish_card=card)

    if usable:
        await resolve_menu_item_references([item])
        assert item.portions[0].nutrition.kcal == 42
    else:
        with pytest.raises(MenuReferenceError):
            await resolve_menu_item_references([item])

    async def ingredient_lines():
        return await requirements._dish_card_ingredient_lines(
            item,
            variant.id,
            None,
            "100",
            service_date=date(2026, 9, 21),
            catalog_by_id={},
            catalog_by_name={},
        )

    if usable:
        _, lines, _ = await ingredient_lines()
        assert lines[0].gross_per_person_g == 25
        assert lines[0].net_per_person_g == 20
        # The real lookup returns the version's own card, even for a forged menu item.
        item.dish_card_id = PydanticObjectId()
        with pytest.raises(requirements.MenuRequirementValidationError, match="does not belong"):
            await ingredient_lines()
    else:
        with pytest.raises(requirements.MenuRequirementValidationError):
            await ingredient_lines()

    if status == "draft" and usable:
        item.dish_card_id = card.id
        monkeypatch.setattr(DishCard, "get", AsyncMock(side_effect=AssertionError("N+1 lookup")))
        await requirements._dish_card_ingredient_lines(
            item,
            variant.id,
            None,
            "100",
            service_date=date(2026, 9, 21),
            catalog_by_id={},
            catalog_by_name={},
            dish_cards_by_id={card.id: card},
        )
