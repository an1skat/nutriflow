from decimal import Decimal

import pytest

from app.modules.identity.models import AgeGroup
from app.modules.menu_requirements.service import _product_ingredient_lines
from app.modules.menus.models import DailyMenuItem, MenuItemKind, MenuPortion
from app.modules.nutrition.domain import (
    NormativeContribution,
    NormativeGroupCode,
    NormativeUnit,
)
from app.modules.recipe.models import Ingredient


@pytest.mark.asyncio
async def test_product_portion_can_record_exact_component_norms() -> None:
    product = Ingredient(
        name="Хліб цільнозерновий з тв.сиром",
        normalized_name="хліб цільнозерновий з тв.сиром",
        unit="g",
    )
    item = DailyMenuItem(
        kind=MenuItemKind.PRODUCT,
        position=1,
        name=product.name,
        product_ingredient_id=product.id,
        portions=[
            MenuPortion(
                age_group=AgeGroup.SIX_TO_ELEVEN,
                yield_amount="45",
                normative_contributions=[
                    NormativeContribution(
                        group_code=NormativeGroupCode.BREAD,
                        amount=Decimal("30"),
                        unit=NormativeUnit.GRAM,
                    ),
                    NormativeContribution(
                        group_code=NormativeGroupCode.DAIRY,
                        amount=Decimal("15"),
                        unit=NormativeUnit.GRAM,
                    ),
                ],
            )
        ],
    )

    _, contributions = await _product_ingredient_lines(
        item,
        item.portions[0],
        catalog_by_id={product.id: product},
        catalog_by_name={product.normalized_name: product},
    )

    assert [(item.group_code, item.amount) for item in contributions] == [
        (NormativeGroupCode.BREAD, Decimal("30")),
        (NormativeGroupCode.DAIRY, Decimal("15")),
    ]
