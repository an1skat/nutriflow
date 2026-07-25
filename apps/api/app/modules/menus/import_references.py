from app.modules.menus.diagnostics import build_import_diagnostic
from app.modules.menus.models import (
    MenuImportDiagnosticLevel,
    MenuItemKind,
    MenuPortionCalculationSource,
)
from app.modules.menus.reference_resolver import MenuReferenceCatalog, named_portion_variant_id
from app.modules.menus.schemas import DailyMenuItemPayload, MenuNutritionPayload
from app.modules.menus.xlsx import ParsedWeeklyMenuPreview
from app.modules.recipe.models import (
    Allergen,
    resolve_portion_variant_by_yield,
    scale_nutrition,
)


async def hydrate_preview_references(preview: ParsedWeeklyMenuPreview) -> None:
    if not preview.menus:
        return

    items = [
        item
        for preview_item in preview.menus
        for day in preview_item.menu.days
        for item in day.items
    ]
    catalog = await MenuReferenceCatalog.load(items)
    known_allergen_codes = {allergen.code for allergen in await Allergen.find_all().to_list()}

    for preview_item in preview.menus:
        for day in preview_item.menu.days:
            for item in day.items:
                row_number = preview_item.item_rows.get((day.weekday.value, item.position))
                if item.kind == MenuItemKind.PRODUCT:
                    _hydrate_product(
                        preview,
                        preview_item.sheet_name,
                        row_number,
                        item,
                        catalog,
                    )
                else:
                    _hydrate_dish(
                        preview,
                        preview_item.sheet_name,
                        row_number,
                        item,
                        catalog,
                    )
                _warn_about_unknown_allergens(
                    preview,
                    preview_item.sheet_name,
                    row_number,
                    item.allergen_codes,
                    known_allergen_codes,
                )


def _hydrate_product(
    preview: ParsedWeeklyMenuPreview,
    sheet_name: str,
    row_number: int | None,
    item: DailyMenuItemPayload,
    catalog: MenuReferenceCatalog,
) -> None:
    lookup_name = item.product_name_snapshot or item.name
    ingredient = catalog.product_ingredient(item)
    if ingredient is None:
        preview.diagnostics.append(
            build_import_diagnostic(
                level=MenuImportDiagnosticLevel.WARNING,
                code="ingredient_not_found",
                message=f'Ingredient "{lookup_name}" was not found',
                sheet_name=sheet_name,
                row_number=row_number,
                column_number=3,
            )
        )
        return
    item.product_ingredient_id = ingredient.id
    item.product_name_snapshot = ingredient.name


def _hydrate_dish(
    preview: ParsedWeeklyMenuPreview,
    sheet_name: str,
    row_number: int | None,
    item: DailyMenuItemPayload,
    catalog: MenuReferenceCatalog,
) -> None:
    recipe_card_number = (item.recipe_card_number or "").strip()
    if not recipe_card_number:
        return

    dish_card = catalog.dish_card(item)
    if dish_card is None:
        preview.diagnostics.append(
            build_import_diagnostic(
                level=MenuImportDiagnosticLevel.ERROR,
                code="dish_card_not_found",
                message=f'Recipe card "{recipe_card_number}" was not found',
                sheet_name=sheet_name,
                row_number=row_number,
                column_number=1,
            )
        )
        return

    item.dish_card_id = dish_card.id
    item.dish_card_version_id = dish_card.current_version_id
    version = catalog.dish_card_version(item, dish_card)
    if version is None:
        preview.diagnostics.append(
            build_import_diagnostic(
                level=MenuImportDiagnosticLevel.ERROR,
                code="dish_card_version_not_found",
                message=f'Recipe card "{recipe_card_number}" has no current version',
                sheet_name=sheet_name,
                row_number=row_number,
                column_number=1,
            )
        )
        return

    for portion_index, portion in enumerate(item.portions):
        preferred_variant_id = portion.dish_card_portion_variant_id or named_portion_variant_id(
            version, item.name, portion.yield_amount
        )
        resolution = resolve_portion_variant_by_yield(
            version.portion_variants,
            portion.yield_amount,
            preferred_variant_id=preferred_variant_id,
        )
        if resolution is None:
            preview.diagnostics.append(
                build_import_diagnostic(
                    level=MenuImportDiagnosticLevel.ERROR,
                    code="portion_variant_not_found",
                    message=(
                        f'Dish "{item.name}" has no portion variant for output '
                        f"{portion.yield_amount} g"
                    ),
                    sheet_name=sheet_name,
                    row_number=row_number,
                    column_number=4 + portion_index * 5,
                )
            )
            continue

        variant = resolution.variant
        nutrition = scale_nutrition(variant.nutrition, resolution.factor)
        portion.nutrition = MenuNutritionPayload(**nutrition.model_dump())
        if resolution.is_scaled:
            portion.dish_card_portion_variant_id = None
            portion.calculated_from = MenuPortionCalculationSource(
                portion_variant_id=variant.id,
                yield_amount=str(variant.output_grams),
            )
            preview.diagnostics.append(
                build_import_diagnostic(
                    level=MenuImportDiagnosticLevel.WARNING,
                    code="portion_variant_scaled",
                    message=(
                        f'Dish "{item.name}" has no exact portion '
                        f"{portion.yield_amount} g; nutrition was calculated "
                        f"from {variant.output_grams} g"
                    ),
                    sheet_name=sheet_name,
                    row_number=row_number,
                    column_number=4 + portion_index * 5,
                )
            )
        else:
            portion.dish_card_portion_variant_id = variant.id
            portion.calculated_from = None

    if not item.allergen_codes:
        item.allergen_codes = catalog.allergen_codes(version)


def _warn_about_unknown_allergens(
    preview: ParsedWeeklyMenuPreview,
    sheet_name: str,
    row_number: int | None,
    allergen_codes: list[str],
    known_allergen_codes: set[str],
) -> None:
    unknown_codes = [code for code in allergen_codes if code not in known_allergen_codes]
    if not unknown_codes:
        return
    preview.diagnostics.append(
        build_import_diagnostic(
            level=MenuImportDiagnosticLevel.WARNING,
            code="unknown_allergen_codes",
            message="Unknown allergen codes: " + ", ".join(unknown_codes),
            sheet_name=sheet_name,
            row_number=row_number,
            column_number=2,
        )
    )
