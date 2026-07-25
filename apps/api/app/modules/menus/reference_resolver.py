from dataclasses import dataclass

from beanie import PydanticObjectId

from app.modules.menus.models import (
    DailyMenuItem,
    MenuItemKind,
    MenuNutrition,
    MenuPortionCalculationSource,
)
from app.modules.nutrition.domain import normalize_lookup_text
from app.modules.recipe.models import (
    Allergen,
    DishCard,
    DishCardVersion,
    Ingredient,
    resolve_portion_variant_by_yield,
    scale_nutrition,
)

FRUIT_NAME_ALIASES = {
    "абрикоси": "абрикос",
    "апельсини": "апельсин",
    "банани": "банан",
    "вишні": "вишня",
    "груші": "груша",
    "мандарини": "мандарин",
    "персики": "персик",
    "сливи": "слива",
    "черешні": "черешня",
    "яблука": "яблуко",
}
FRESH_NAME_WORDS = {"свіжа", "свіже", "свіжий", "свіжі"}


class MenuReferenceError(ValueError):
    """A menu item points to a missing or incompatible catalog record."""


@dataclass(frozen=True)
class MenuReferenceCatalog:
    ingredients_by_id: dict[PydanticObjectId, Ingredient]
    ingredients_by_name: dict[str, Ingredient]
    dish_cards_by_id: dict[PydanticObjectId, DishCard]
    dish_cards_by_number: dict[str, DishCard]
    versions_by_id: dict[PydanticObjectId, DishCardVersion]
    allergens_by_id: dict[PydanticObjectId, Allergen]

    @classmethod
    async def load(cls, items: list[DailyMenuItem]) -> "MenuReferenceCatalog":
        ingredient_ids = {
            item.product_ingredient_id
            for item in items
            if item.kind == MenuItemKind.PRODUCT and item.product_ingredient_id is not None
        }
        ingredient_names = {
            normalize_lookup_text(item.product_name_snapshot or item.name)
            for item in items
            if item.kind == MenuItemKind.PRODUCT
            and normalize_lookup_text(item.product_name_snapshot or item.name)
        }
        ingredients = await _load_ingredients(ingredient_ids, ingredient_names)

        dish_card_ids = {
            item.dish_card_id
            for item in items
            if item.kind == MenuItemKind.DISH_CARD and item.dish_card_id is not None
        }
        card_numbers = {
            candidate
            for item in items
            if item.kind == MenuItemKind.DISH_CARD and item.recipe_card_number
            for candidate in card_number_candidates(item.recipe_card_number or "")
        }
        dish_cards = await _load_dish_cards(dish_card_ids, card_numbers)
        dish_cards_by_id = {card.id: card for card in dish_cards if card.id is not None}
        dish_cards_by_number = {card.card_number: card for card in dish_cards}

        version_ids = {
            item.dish_card_version_id for item in items if item.dish_card_version_id is not None
        }
        version_ids.update(
            card.current_version_id for card in dish_cards if card.current_version_id is not None
        )
        versions = (
            await DishCardVersion.find({"_id": {"$in": list(version_ids)}}).to_list()
            if version_ids
            else []
        )
        versions_by_id = {version.id: version for version in versions if version.id is not None}

        allergen_ids = {allergen_id for version in versions for allergen_id in version.allergen_ids}
        allergens = (
            await Allergen.find({"_id": {"$in": list(allergen_ids)}}).to_list()
            if allergen_ids
            else []
        )

        return cls(
            ingredients_by_id={
                ingredient.id: ingredient for ingredient in ingredients if ingredient.id is not None
            },
            ingredients_by_name=_ingredients_by_name(ingredients),
            dish_cards_by_id=dish_cards_by_id,
            dish_cards_by_number=dish_cards_by_number,
            versions_by_id=versions_by_id,
            allergens_by_id={
                allergen.id: allergen for allergen in allergens if allergen.id is not None
            },
        )

    def product_ingredient(self, item: DailyMenuItem) -> Ingredient | None:
        if item.product_ingredient_id is not None:
            return self.ingredients_by_id.get(item.product_ingredient_id)
        return self.ingredients_by_name.get(
            normalize_lookup_text(item.product_name_snapshot or item.name)
        )

    def dish_card(self, item: DailyMenuItem) -> DishCard | None:
        if item.dish_card_id is not None:
            return self.dish_cards_by_id.get(item.dish_card_id)
        for candidate in card_number_candidates(item.recipe_card_number or ""):
            card = self.dish_cards_by_number.get(candidate)
            if card is not None:
                return card
        return None

    def dish_card_version(
        self,
        item: DailyMenuItem,
        dish_card: DishCard,
    ) -> DishCardVersion | None:
        version_id = item.dish_card_version_id or dish_card.current_version_id
        return self.versions_by_id.get(version_id) if version_id is not None else None

    def allergen_codes(self, version: DishCardVersion) -> list[str]:
        return [
            allergen.code
            for allergen_id in version.allergen_ids
            if (allergen := self.allergens_by_id.get(allergen_id)) is not None
        ]


async def resolve_menu_item_references(items: list[DailyMenuItem]) -> None:
    catalog = await MenuReferenceCatalog.load(items)
    for item in items:
        if item.kind == MenuItemKind.PRODUCT:
            for portion in item.portions:
                portion.dish_card_portion_variant_id = None
                portion.calculated_from = None
            ingredient = catalog.product_ingredient(item)
            if item.product_ingredient_id is not None and ingredient is None:
                raise MenuReferenceError("Product ingredient not found")
            if ingredient is not None:
                item.product_ingredient_id = ingredient.id
                item.product_name_snapshot = ingredient.name
            continue

        dish_card = catalog.dish_card(item)
        if item.dish_card_id is not None and dish_card is None:
            raise MenuReferenceError("Dish card not found")
        if dish_card is None:
            for portion in item.portions:
                portion.dish_card_portion_variant_id = None
                portion.calculated_from = None
            continue

        item.dish_card_id = dish_card.id
        item.dish_card_version_id = item.dish_card_version_id or dish_card.current_version_id
        if item.dish_card_version_id is None:
            continue

        version = catalog.dish_card_version(item, dish_card)
        if version is None or version.dish_card_id != dish_card.id:
            raise MenuReferenceError("Dish card version does not belong to menu item dish card")

        for portion in item.portions:
            preferred_variant_id = portion.dish_card_portion_variant_id or named_portion_variant_id(
                version,
                item.name,
                portion.yield_amount,
            )
            resolution = resolve_portion_variant_by_yield(
                version.portion_variants,
                portion.yield_amount,
                preferred_variant_id=preferred_variant_id,
            )
            if resolution is None:
                portion.dish_card_portion_variant_id = None
                portion.calculated_from = None
                portion.nutrition = MenuNutrition()
                continue

            variant = resolution.variant
            nutrition = scale_nutrition(variant.nutrition, resolution.factor)
            portion.nutrition = MenuNutrition(**nutrition.model_dump())
            if resolution.is_scaled:
                portion.dish_card_portion_variant_id = None
                portion.calculated_from = MenuPortionCalculationSource(
                    portion_variant_id=variant.id,
                    yield_amount=str(variant.output_grams),
                )
            else:
                portion.dish_card_portion_variant_id = variant.id
                portion.calculated_from = None

        if not item.allergen_codes:
            item.allergen_codes = catalog.allergen_codes(version)


async def _load_ingredients(
    ingredient_ids: set[PydanticObjectId],
    ingredient_names: set[str],
) -> list[Ingredient]:
    filters: list[dict] = []
    if ingredient_ids:
        filters.append({"_id": {"$in": list(ingredient_ids)}})
    if ingredient_names:
        filters.extend(
            [
                {"normalized_name": {"$in": list(ingredient_names)}},
                {"aliases": {"$in": list(ingredient_names)}},
            ]
        )
    return await Ingredient.find({"$or": filters}).to_list() if filters else []


async def _load_dish_cards(
    dish_card_ids: set[PydanticObjectId],
    card_numbers: set[str],
) -> list[DishCard]:
    filters: list[dict] = []
    if dish_card_ids:
        filters.append({"_id": {"$in": list(dish_card_ids)}})
    if card_numbers:
        filters.append({"card_number": {"$in": list(card_numbers)}})
    return await DishCard.find({"$or": filters}).to_list() if filters else []


def _ingredients_by_name(ingredients: list[Ingredient]) -> dict[str, Ingredient]:
    result: dict[str, Ingredient] = {}
    for ingredient in ingredients:
        result[ingredient.normalized_name] = ingredient
        for alias in ingredient.aliases:
            result[normalize_lookup_text(alias)] = ingredient
    return result


def card_number_candidates(card_number: str) -> list[str]:
    normalized = card_number.strip()
    if not normalized:
        return []
    candidates = [normalized]
    prefix, separator, suffix = normalized.rpartition("_")
    if separator:
        candidates.append(f"{prefix}.{suffix}")
    else:
        prefix, separator, suffix = normalized.rpartition(".")
        if separator:
            candidates.append(f"{prefix}_{suffix}")
    for candidate in candidates.copy():
        separator = "." if "." in candidate else "_" if "_" in candidate else None
        if separator is None:
            continue
        first, remainder = candidate.split(separator, 1)
        if not first.isdigit() or int(first) != 8:
            continue
        for first_variant in (str(int(first)), first.zfill(2)):
            variant = f"{first_variant}{separator}{remainder}"
            if variant not in candidates:
                candidates.append(variant)
    return candidates


def named_portion_variant_id(
    version: DishCardVersion,
    item_name: str,
    yield_amount: str,
) -> PydanticObjectId | None:
    normalized_name = normalize_portion_variant_name(item_name)
    matching_ids = {
        amount.portion_variant_id
        for amount in version.ingredient_amounts
        if normalize_portion_variant_name(amount.ingredient_name_snapshot) == normalized_name
    }
    if not matching_ids:
        return None

    resolution = resolve_portion_variant_by_yield(
        [item for item in version.portion_variants if item.id in matching_ids],
        yield_amount,
    )
    return resolution.variant.id if resolution is not None else None


def normalize_portion_variant_name(value: str) -> str:
    words = [
        word.strip("*.,")
        for word in normalize_lookup_text(value).split()
        if word.strip("*.,") not in FRESH_NAME_WORDS
    ]
    normalized = " ".join(word for word in words if word)
    return FRUIT_NAME_ALIASES.get(normalized, normalized)
