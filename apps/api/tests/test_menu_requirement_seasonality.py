from datetime import date
from decimal import Decimal

import pytest
from beanie import PydanticObjectId

from app.modules.menu_requirements.service import _select_seasonal_amounts
from app.modules.recipe.models import IngredientAmount

pytestmark = pytest.mark.no_clean_database


def test_menu_requirement_selects_one_current_seasonal_ingredient_variant() -> None:
    portion_variant_id = PydanticObjectId()
    winter = _amount("Морква столова свіжа до 01.01", portion_variant_id)
    summer = _amount("Морква столова свіжа з 01.01", portion_variant_id)

    selected = _select_seasonal_amounts([winter, summer], date(2026, 7, 27))

    assert selected == [summer]


def test_menu_requirement_selects_ground_vegetables_during_their_season() -> None:
    portion_variant_id = PydanticObjectId()
    ground = _amount("Огірки грунтові свіжі", portion_variant_id)
    greenhouse = _amount("Огірки теплично-парникові свіжі", portion_variant_id)

    selected = _select_seasonal_amounts([ground, greenhouse], date(2026, 7, 28))

    assert selected == [ground]


def _amount(name: str, portion_variant_id: PydanticObjectId) -> IngredientAmount:
    return IngredientAmount.model_construct(
        ingredient_name_snapshot=name,
        gross_amount=Decimal("1"),
        net_amount=Decimal("1"),
        unit="g",
        portion_variant_id=portion_variant_id,
    )
