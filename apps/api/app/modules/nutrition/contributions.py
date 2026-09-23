import re
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
    NormativeGroupCode,
    NormativeUnit,
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
        source_id = ingredient.id if ingredient is not None else line.ingredient_id
        normalized_name = (
            ingredient.normalized_name
            if ingredient is not None
            else normalize_lookup_text(line.name)
        )
        if (
            source_type == NormativeContributionSource.INGREDIENT
            and normalized_name in INGREDIENTS_NOT_COUNTED_SEPARATELY
        ):
            continue

        if ingredient is None or not ingredient.normative_contributions:
            rule = get_ingredient_norm_rule(normalized_name)
            amount = rule.contribution_amount(line.net_per_person_g) if rule is not None else None
            if rule is not None and amount is not None and rule.group_code not in excluded_groups:
                snapshots.append(
                    NormativeContributionSnapshot(
                        group_code=rule.group_code,
                        amount=amount,
                        unit=rule.unit,
                        product_variant=rule.product_variant,
                        source_type=source_type,
                        source_id=str(source_id) if source_id is not None else None,
                        source_name=ingredient.name if ingredient is not None else line.name,
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


def product_portion_contributions(name: str, yield_amount: str) -> list[NormativeContribution]:
    """Reviewed composite recipe: slash-separated bread / hard-cheese grams.

    A total like "45" cannot recover the component split and is never guessed.
    """
    normalized = re.sub(r"тв\.\s*сир", "тв.сир", normalize_lookup_text(name))
    legacy_bread = normalized == "хліб цільнозерновий"
    if not legacy_bread and normalized != "хліб цільнозерновий з тв.сиром":
        return []
    match = re.fullmatch(
        r"\s*(\d+(?:[.,]\d+)?)\s*/\s*(\d+(?:[.,]\d+)?)\s*(?:г|гр|g)?\s*",
        yield_amount.lower(),
    )
    if match is None:
        return []
    bread, cheese = (Decimal(value.replace(",", ".")) for value in match.groups())
    if legacy_bread and (bread, cheese) != (Decimal("30"), Decimal("15")):
        return []
    if bread <= 0 or cheese <= 0:
        return []
    return [
        NormativeContribution(
            group_code=NormativeGroupCode.BREAD, amount=bread, unit=NormativeUnit.GRAM
        ),
        NormativeContribution(
            group_code=NormativeGroupCode.DAIRY,
            amount=cheese,
            unit=NormativeUnit.GRAM,
            product_variant="hard_cheese",
        ),
    ]
