from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from beanie import PydanticObjectId

from app.modules.nutrition.domain import (
    NormativeContribution,
    NormativeContributionBasis,
    NormativeContributionSnapshot,
    NormativeContributionSource,
    normalize_lookup_text,
)
from app.modules.nutrition.ingredient_registry import (
    INGREDIENTS_NOT_COUNTED_SEPARATELY,
    get_ingredient_norm_rule,
)


class IngredientWithContributions(Protocol):
    id: PydanticObjectId | None
    name: str
    normalized_name: str
    unit: str
    normative_contributions: list[NormativeContribution]


@dataclass(frozen=True)
class IngredientLine:
    key: str
    ingredient_id: PydanticObjectId | None
    name: str
    net_per_person_g: Decimal
    gross_per_person_g: Decimal | None = None


def ingredient_contribution_snapshots(
    lines: list[IngredientLine],
    *,
    catalog_by_id: Mapping[PydanticObjectId, IngredientWithContributions],
    catalog_by_name: Mapping[str, IngredientWithContributions],
    excluded_groups: set,
    source_type: NormativeContributionSource,
) -> list[NormativeContributionSnapshot]:
    snapshots: list[NormativeContributionSnapshot] = []
    for line in lines:
        ingredient = (
            catalog_by_id.get(line.ingredient_id) if line.ingredient_id is not None else None
        )
        if ingredient is None:
            ingredient = catalog_by_name.get(normalize_lookup_text(line.name))
        if ingredient is None:
            continue
        if (
            source_type == NormativeContributionSource.INGREDIENT
            and ingredient.normalized_name in INGREDIENTS_NOT_COUNTED_SEPARATELY
        ):
            continue

        if not ingredient.normative_contributions:
            rule = get_ingredient_norm_rule(ingredient.normalized_name)
            amount = rule.contribution_amount(line.net_per_person_g) if rule is not None else None
            if rule is not None and amount is not None and rule.group_code not in excluded_groups:
                snapshots.append(
                    NormativeContributionSnapshot(
                        group_code=rule.group_code,
                        amount=amount,
                        unit=rule.unit,
                        product_variant=rule.product_variant,
                        source_type=source_type,
                        source_id=str(ingredient.id) if ingredient.id is not None else None,
                        source_name=ingredient.name,
                    )
                )
            continue

        source_quantity = _source_quantity(line.net_per_person_g, ingredient.unit)
        for contribution in ingredient.normative_contributions:
            if contribution.group_code in excluded_groups:
                continue
            snapshots.append(
                _scaled_ingredient_contribution(
                    contribution,
                    source_quantity=source_quantity,
                    ingredient=ingredient,
                    source_type=source_type,
                )
            )
    return snapshots


def _source_quantity(amount_g: Decimal, source_unit: str) -> Decimal:
    return amount_g / Decimal("1000") if source_unit in {"kg", "кг"} else amount_g


def _scaled_ingredient_contribution(
    contribution: NormativeContribution,
    *,
    source_quantity: Decimal,
    ingredient: IngredientWithContributions,
    source_type: NormativeContributionSource,
) -> NormativeContributionSnapshot:
    multiplier = (
        source_quantity
        if contribution.basis == NormativeContributionBasis.PER_SOURCE_UNIT
        else Decimal("1")
    )
    return NormativeContributionSnapshot(
        group_code=contribution.group_code,
        amount=contribution.amount * multiplier,
        unit=contribution.unit,
        portion_equivalent=(
            contribution.portion_equivalent * multiplier
            if contribution.portion_equivalent is not None
            else None
        ),
        product_variant=contribution.product_variant,
        source_type=source_type,
        source_id=str(ingredient.id) if ingredient.id is not None else None,
        source_name=ingredient.name,
    )
