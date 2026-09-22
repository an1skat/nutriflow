"""Targeted repair of stored requirement data; never re-read mutable menus or recipes."""

from app.modules.menu_requirements.models import MenuRequirement
from app.modules.menu_requirements.service import _build_ingredient_row
from app.modules.menus.models import MenuItemKind
from app.modules.nutrition.contributions import (
    IngredientLine,
    ingredient_contribution_snapshots,
    product_portion_contributions,
)
from app.modules.nutrition.domain import (
    NormativeContributionSnapshot,
    NormativeContributionSource,
    normalize_lookup_text,
)
from app.modules.nutrition.seasonality import select_seasonal_items


def repair_requirement_norms(requirement: MenuRequirement) -> None:
    """Keep selected seasonal quantities and fill only the two reviewed product gaps.

    Unrelated rows, explicit contributions, servings and closed-day metadata survive.
    The caller owns persistence and optimistic concurrency control.
    """
    changed_rows: set[str] = set()
    children = {dish.menu_item_id: dish.children_count for dish in requirement.dishes}
    for dish in requirement.dishes:
        rows = [
            row
            for row in requirement.ingredient_rows
            if any(cell.menu_item_id == dish.menu_item_id for cell in row.cells)
        ]
        selected = select_seasonal_items(
            rows, requirement.service_date, name=lambda row: row.ingredient_name
        )
        selected_keys = {row.key for row in selected}
        for row in rows:
            if row.key not in selected_keys:
                changed_rows.add(row.key)
                row.cells = [cell for cell in row.cells if cell.menu_item_id != dish.menu_item_id]

        ingredient_snapshots = [
            c
            for c in dish.normative_contributions
            if c.source_type == NormativeContributionSource.INGREDIENT
        ]
        selected_snapshots = select_seasonal_items(
            ingredient_snapshots, requirement.service_date, name=lambda c: c.source_name
        )
        dish.normative_contributions = [
            c
            for c in dish.normative_contributions
            if c.source_type != NormativeContributionSource.INGREDIENT or c in selected_snapshots
        ]
        if dish.kind != MenuItemKind.PRODUCT or dish.normative_contributions:
            continue
        components = product_portion_contributions(dish.name, dish.yield_amount)
        if components:
            dish.normative_contributions = [
                NormativeContributionSnapshot(
                    **component.model_dump(exclude={"basis"}),
                    source_type=NormativeContributionSource.PRODUCT,
                    source_id=str(dish.menu_item_id),
                    source_name=dish.name,
                )
                for component in components
            ]
        elif normalize_lookup_text(dish.name) == "яйце відварне":
            lines = [
                IngredientLine(
                    key=row.key,
                    ingredient_id=row.ingredient_id,
                    name=dish.name,
                    net_per_person_g=cell.net_per_person_g,
                )
                for row in selected
                for cell in row.cells
                if cell.menu_item_id == dish.menu_item_id
            ]
            dish.normative_contributions = ingredient_contribution_snapshots(
                lines,
                catalog_by_id={},
                catalog_by_name={},
                excluded_groups=set(),
                source_type=NormativeContributionSource.PRODUCT,
            )

    # Recompute totals only for changed rows, preserving unrelated manual edits.
    requirement.ingredient_rows = [
        _build_ingredient_row(
            key=row.key,
            ingredient_id=row.ingredient_id,
            ingredient_name=row.ingredient_name,
            cells=row.cells,
            children_by_dish=children,
        )
        if row.key in changed_rows
        else row
        for row in requirement.ingredient_rows
        if row.cells or row.key not in changed_rows
    ]
