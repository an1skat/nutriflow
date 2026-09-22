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


@pytest.mark.parametrize("dash", ["-", "–", "—", "/"])
@pytest.mark.parametrize("dots", ["", "."])
@pytest.mark.parametrize(
    ("service_date", "expected"),
    [
        (date(2026, 9, 16), 0),
        (date(2026, 11, 15), 1),
        (date(2026, 1, 15), 2),
        (date(2026, 3, 15), 3),
        (date(2028, 2, 29), 2),
        (date(2026, 10, 31), 0),
        (date(2026, 11, 1), 1),
        (date(2026, 3, 1), 3),
    ],
)
def test_all_potato_variants_form_one_group(service_date, expected, dash, dots):
    names = [
        f"Картопля свіжа з 01.09{dots} по 31.10{dots}",
        f"Картопля свіжа з 01.11{dots} по 31.12{dots}",
        f"Картопля свіжа з 01.01{dots} по 28{dash}29.02{dots}",
        f"Картопля свіжа з 01.03{dots}",
    ]
    amounts = [_amount(name, PydanticObjectId()) for name in names]
    # Open-ended March first must not swallow the bounded September/November range.
    for candidates in (amounts, list(reversed(amounts))):
        assert _select_seasonal_amounts(candidates, service_date) == [amounts[expected]]


def test_seasonal_spaces_single_out_of_season_and_unrelated_rows():
    variant = PydanticObjectId()
    september = _amount("Картопля свіжа з 01 . 09 . по 31 . 10 .", variant)
    january = _amount("Картопля свіжа з 01 . 01 . по 28 – 29 . 02 .", variant)
    salt = _amount("Сіль", variant)
    assert _select_seasonal_amounts([september, january, salt], date(2026, 9, 16)) == [
        september,
        salt,
    ]
    assert _select_seasonal_amounts([january, salt], date(2026, 9, 16)) == [salt]
    assert _select_seasonal_amounts([salt, salt], date(2026, 9, 16)) == [salt, salt]
