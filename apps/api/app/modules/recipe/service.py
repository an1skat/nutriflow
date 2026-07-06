import re
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO

from beanie import PydanticObjectId
from fastapi import UploadFile
from pymongo.errors import DuplicateKeyError

from app.modules.recipe.models import (
    Allergen,
    DishCard,
    DishCardVersion,
    DishCardVersionStatus,
    Ingredient,
    IngredientAmount,
    Nutrition,
    PortionVariant,
    normalize_lookup_text,
)
from app.modules.recipe.schemas import (
    CalculateIngredientsRequest,
    CreateAllergenRequest,
    CreateDishCardRequest,
    CreateDishCardVersionRequest,
    CreateIngredientRequest,
    DishCardVersionValidationResponse,
    IngredientCalculationLine,
    PdfImportPreviewResponse,
    UpdateAllergenRequest,
    UpdateDishCardRequest,
    UpdateDishCardVersionRequest,
    UpdateIngredientRequest,
    ValidationIssue,
)


class RecipeConflictError(ValueError):
    """A recipe entity with the same unique data already exists."""


class RecipeNotFoundError(ValueError):
    """The requested recipe entity does not exist."""


class DishCardVersionImmutableError(ValueError):
    """Confirmed or archived dish card versions cannot be changed."""


class DishCardVersionInvalidError(ValueError):
    """Dish card version cannot move to the requested state."""


class DishCardVersionNotConfirmedError(ValueError):
    """Only confirmed dish card versions can be used for calculations."""


async def list_ingredients(
    *,
    offset: int,
    limit: int,
    query: str | None = None,
    include_inactive: bool = False,
) -> tuple[list[Ingredient], int]:
    filters: dict = {}

    if not include_inactive:
        filters["is_active"] = True

    if query:
        normalized = normalize_lookup_text(query)
        filters["$or"] = [
            {"normalized_name": {"$regex": re.escape(normalized), "$options": "i"}},
            {"aliases": {"$regex": re.escape(normalized), "$options": "i"}},
        ]

    cursor = Ingredient.find(filters)
    total = await cursor.count()
    items = await cursor.sort("normalized_name").skip(offset).limit(limit).to_list()
    return items, total


async def get_ingredient(ingredient_id: PydanticObjectId) -> Ingredient:
    ingredient = await Ingredient.get(ingredient_id)

    if ingredient is None:
        raise RecipeNotFoundError("Ingredient not found")

    return ingredient


async def create_ingredient(data: CreateIngredientRequest) -> Ingredient:
    ingredient = Ingredient(
        name=data.name,
        normalized_name=normalize_lookup_text(data.name),
        unit=data.unit,
        normative_group_id=data.normative_group_id,
        aliases=data.aliases,
    )

    try:
        await ingredient.insert()
    except DuplicateKeyError as exc:
        raise RecipeConflictError("Ingredient with this name and unit already exists") from exc

    return ingredient


async def update_ingredient(
    ingredient_id: PydanticObjectId,
    data: UpdateIngredientRequest,
) -> Ingredient:
    ingredient = await get_ingredient(ingredient_id)

    if "name" in data.model_fields_set:
        ingredient.name = data.name
        ingredient.normalized_name = normalize_lookup_text(data.name)
    if "unit" in data.model_fields_set:
        ingredient.unit = data.unit
    if "normative_group_id" in data.model_fields_set:
        ingredient.normative_group_id = data.normative_group_id
    if "aliases" in data.model_fields_set:
        ingredient.aliases = data.aliases
    if "is_active" in data.model_fields_set:
        ingredient.is_active = bool(data.is_active)

    ingredient.updated_at = datetime.now(UTC)

    try:
        await ingredient.save()
    except DuplicateKeyError as exc:
        raise RecipeConflictError("Ingredient with this name and unit already exists") from exc

    return ingredient


async def list_allergens(
    *,
    offset: int,
    limit: int,
    query: str | None = None,
) -> tuple[list[Allergen], int]:
    filters: dict = {}

    if query:
        normalized = query.strip()
        filters["$or"] = [
            {"code": {"$regex": re.escape(normalized), "$options": "i"}},
            {"name": {"$regex": re.escape(normalized), "$options": "i"}},
        ]

    cursor = Allergen.find(filters)
    total = await cursor.count()
    items = await cursor.sort("code").skip(offset).limit(limit).to_list()
    return items, total


async def get_allergen(allergen_id: PydanticObjectId) -> Allergen:
    allergen = await Allergen.get(allergen_id)

    if allergen is None:
        raise RecipeNotFoundError("Allergen not found")

    return allergen


async def create_allergen(data: CreateAllergenRequest) -> Allergen:
    allergen = Allergen(
        code=data.code,
        name=data.name,
        description=data.description,
    )

    try:
        await allergen.insert()
    except DuplicateKeyError as exc:
        raise RecipeConflictError("Allergen with this code already exists") from exc

    return allergen


async def update_allergen(
    allergen_id: PydanticObjectId,
    data: UpdateAllergenRequest,
) -> Allergen:
    allergen = await get_allergen(allergen_id)

    if "code" in data.model_fields_set:
        allergen.code = data.code
    if "name" in data.model_fields_set:
        allergen.name = data.name
    if "description" in data.model_fields_set:
        allergen.description = data.description

    allergen.updated_at = datetime.now(UTC)

    try:
        await allergen.save()
    except DuplicateKeyError as exc:
        raise RecipeConflictError("Allergen with this code already exists") from exc

    return allergen


async def list_dish_cards(
    *,
    offset: int,
    limit: int,
    query: str | None = None,
    include_inactive: bool = False,
) -> tuple[list[DishCard], int]:
    filters: dict = {}

    if not include_inactive:
        filters["is_active"] = True

    if query:
        normalized = query.strip()
        filters["$or"] = [
            {"card_number": {"$regex": re.escape(normalized), "$options": "i"}},
            {"name": {"$regex": re.escape(normalized), "$options": "i"}},
        ]

    cursor = DishCard.find(filters)
    total = await cursor.count()
    items = await cursor.sort("card_number").skip(offset).limit(limit).to_list()
    return items, total


async def get_dish_card(dish_card_id: PydanticObjectId) -> DishCard:
    dish_card = await DishCard.get(dish_card_id)

    if dish_card is None:
        raise RecipeNotFoundError("Dish card not found")

    return dish_card


async def create_dish_card(data: CreateDishCardRequest) -> DishCard:
    dish_card = DishCard(
        card_number=data.card_number,
        name=data.name,
        category=data.category,
        source=data.source,
    )

    try:
        await dish_card.insert()
    except DuplicateKeyError as exc:
        raise RecipeConflictError("Dish card with this number already exists") from exc

    return dish_card


async def update_dish_card(
    dish_card_id: PydanticObjectId,
    data: UpdateDishCardRequest,
) -> DishCard:
    dish_card = await get_dish_card(dish_card_id)

    if "card_number" in data.model_fields_set:
        dish_card.card_number = data.card_number
    if "name" in data.model_fields_set:
        dish_card.name = data.name
    if "category" in data.model_fields_set:
        dish_card.category = data.category
    if "source" in data.model_fields_set:
        dish_card.source = data.source
    if "is_active" in data.model_fields_set:
        dish_card.is_active = bool(data.is_active)

    dish_card.updated_at = datetime.now(UTC)

    try:
        await dish_card.save()
    except DuplicateKeyError as exc:
        raise RecipeConflictError("Dish card with this number already exists") from exc

    return dish_card


async def list_dish_card_versions(
    dish_card_id: PydanticObjectId,
    *,
    offset: int,
    limit: int,
) -> tuple[list[DishCardVersion], int]:
    await get_dish_card(dish_card_id)
    cursor = DishCardVersion.find(DishCardVersion.dish_card_id == dish_card_id)
    total = await cursor.count()
    items = await cursor.sort("-version").skip(offset).limit(limit).to_list()
    return items, total


async def get_dish_card_version(version_id: PydanticObjectId) -> DishCardVersion:
    version = await DishCardVersion.get(version_id)

    if version is None:
        raise RecipeNotFoundError("Dish card version not found")

    return version


async def create_dish_card_version(
    dish_card_id: PydanticObjectId,
    data: CreateDishCardVersionRequest,
    *,
    created_by: PydanticObjectId | None,
    status: DishCardVersionStatus = DishCardVersionStatus.DRAFT,
) -> DishCardVersion:
    await get_dish_card(dish_card_id)
    version_number = data.version or await _next_version_number(dish_card_id)
    now = datetime.now(UTC)
    version = DishCardVersion(
        dish_card_id=dish_card_id,
        version=version_number,
        status=status,
        source_import_id=data.source_import_id,
        source_file_name=data.source_file_name,
        source_page=data.source_page,
        recognized_warnings=data.recognized_warnings,
        recognition_errors=data.recognition_errors,
        allergen_ids=data.allergen_ids,
        technology_text=data.technology_text,
        portion_variants=[_to_portion_variant(item) for item in data.portion_variants],
        ingredient_amounts=[_to_ingredient_amount(item) for item in data.ingredient_amounts],
        created_at=now,
        updated_at=now,
        created_by=created_by,
    )

    try:
        await version.insert()
    except DuplicateKeyError as exc:
        raise RecipeConflictError("Dish card version already exists") from exc

    return version


async def update_dish_card_version(
    version_id: PydanticObjectId,
    data: UpdateDishCardVersionRequest,
) -> DishCardVersion:
    version = await get_dish_card_version(version_id)
    _ensure_mutable(version)

    if "source_file_name" in data.model_fields_set:
        version.source_file_name = data.source_file_name
    if "source_page" in data.model_fields_set:
        version.source_page = data.source_page
    if "recognized_warnings" in data.model_fields_set:
        version.recognized_warnings = data.recognized_warnings or []
    if "recognition_errors" in data.model_fields_set:
        version.recognition_errors = data.recognition_errors or []
    if "allergen_ids" in data.model_fields_set:
        version.allergen_ids = data.allergen_ids or []
    if "technology_text" in data.model_fields_set:
        version.technology_text = data.technology_text
    if "portion_variants" in data.model_fields_set:
        version.portion_variants = [
            _to_portion_variant(item) for item in data.portion_variants or []
        ]
    if "ingredient_amounts" in data.model_fields_set:
        version.ingredient_amounts = [
            _to_ingredient_amount(item) for item in data.ingredient_amounts or []
        ]

    version.updated_at = datetime.now(UTC)
    await version.save()
    return version


async def validate_dish_card_version(
    version_id: PydanticObjectId,
) -> DishCardVersionValidationResponse:
    version = await get_dish_card_version(version_id)
    return validate_version(version)


def validate_version(version: DishCardVersion) -> DishCardVersionValidationResponse:
    blocking_errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []

    for index, message in enumerate(version.recognition_errors):
        blocking_errors.append(
            ValidationIssue(
                code="recognition_error",
                message=message,
                field=f"recognition_errors.{index}",
            )
        )

    for index, message in enumerate(version.recognized_warnings):
        warnings.append(
            ValidationIssue(
                code="recognized_warning",
                message=message,
                field=f"recognized_warnings.{index}",
            )
        )

    if not version.portion_variants:
        blocking_errors.append(
            ValidationIssue(
                code="missing_portion_variants",
                message="At least one portion variant is required",
                field="portion_variants",
            )
        )

    if not version.ingredient_amounts:
        blocking_errors.append(
            ValidationIssue(
                code="missing_ingredient_amounts",
                message="At least one ingredient amount is required",
                field="ingredient_amounts",
            )
        )

    variant_ids = {variant.id for variant in version.portion_variants}
    for index, amount in enumerate(version.ingredient_amounts):
        if amount.portion_variant_id not in variant_ids:
            blocking_errors.append(
                ValidationIssue(
                    code="unknown_portion_variant",
                    message="Ingredient amount references unknown portion variant",
                    field=f"ingredient_amounts.{index}.portion_variant_id",
                )
            )
        if amount.ingredient_id is None:
            warnings.append(
                ValidationIssue(
                    code="ingredient_not_linked",
                    message="Ingredient amount has no linked ingredient",
                    field=f"ingredient_amounts.{index}.ingredient_id",
                )
            )

    return DishCardVersionValidationResponse(
        blocking_errors=blocking_errors,
        warnings=warnings,
        can_confirm=not blocking_errors,
    )


async def confirm_dish_card_version(version_id: PydanticObjectId) -> DishCardVersion:
    version = await get_dish_card_version(version_id)
    _ensure_mutable(version)
    validation = validate_version(version)

    if validation.blocking_errors:
        raise DishCardVersionInvalidError("Dish card version has blocking validation errors")

    dish_card = await get_dish_card(version.dish_card_id)
    now = datetime.now(UTC)
    version.status = DishCardVersionStatus.CONFIRMED
    version.updated_at = now
    await version.save()
    dish_card.current_version_id = version.id
    dish_card.updated_at = now
    await dish_card.save()
    return version


async def calculate_ingredients(
    version_id: PydanticObjectId,
    data: CalculateIngredientsRequest,
) -> list[IngredientCalculationLine]:
    version = await get_dish_card_version(version_id)
    return calculate_ingredient_lines(version, data)


def calculate_ingredient_lines(
    version: DishCardVersion,
    data: CalculateIngredientsRequest,
) -> list[IngredientCalculationLine]:
    if version.status != DishCardVersionStatus.CONFIRMED:
        raise DishCardVersionNotConfirmedError(
            "Only confirmed dish card versions can be calculated"
        )

    if not any(variant.id == data.portion_variant_id for variant in version.portion_variants):
        raise RecipeNotFoundError("Portion variant not found")

    amounts = [
        amount
        for amount in version.ingredient_amounts
        if amount.portion_variant_id == data.portion_variant_id
    ]
    multiplier = Decimal(data.servings_count)
    return [
        IngredientCalculationLine(
            ingredient_id=amount.ingredient_id,
            ingredient_name_snapshot=amount.ingredient_name_snapshot,
            unit=amount.unit,
            gross_per_portion=amount.gross_amount,
            net_per_portion=amount.net_amount,
            gross_total=amount.gross_amount * multiplier,
            net_total=amount.net_amount * multiplier,
            notes=amount.notes,
        )
        for amount in amounts
    ]


async def preview_pdf_import(file: UploadFile) -> PdfImportPreviewResponse:
    content = await file.read()
    warnings = [
        "PDF preview is not confirmed automatically. Review extracted data before saving.",
    ]
    recognition_errors: list[str] = []
    extracted_text: str | None = None
    guessed_card_number: str | None = None
    guessed_name: str | None = None

    try:
        from pypdf import PdfReader
    except ModuleNotFoundError:
        recognition_errors.append("PDF text extraction dependency is not installed.")
        return PdfImportPreviewResponse(
            filename=file.filename or "",
            content_type=file.content_type,
            extracted_text_preview=None,
            guessed_card_number=None,
            guessed_name=None,
            warnings=warnings,
            recognition_errors=recognition_errors,
        )

    try:
        reader = PdfReader(BytesIO(content))
        extracted_text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        recognition_errors.append(f"Could not extract text from PDF: {exc}")

    if extracted_text:
        guessed_card_number, guessed_name = _guess_dish_card_identity(extracted_text)
        if guessed_card_number is None:
            warnings.append("Could not confidently detect dish card number.")
        if guessed_name is None:
            warnings.append("Could not confidently detect dish card name.")
    elif not recognition_errors:
        recognition_errors.append("PDF text extraction returned empty content.")

    return PdfImportPreviewResponse(
        filename=file.filename or "",
        content_type=file.content_type,
        extracted_text_preview=extracted_text[:4000] if extracted_text else None,
        guessed_card_number=guessed_card_number,
        guessed_name=guessed_name,
        warnings=warnings,
        recognition_errors=recognition_errors,
    )


async def _next_version_number(dish_card_id: PydanticObjectId) -> int:
    latest = (
        await DishCardVersion.find(DishCardVersion.dish_card_id == dish_card_id)
        .sort("-version")
        .first_or_none()
    )
    return 1 if latest is None else latest.version + 1


def _ensure_mutable(version: DishCardVersion) -> None:
    if version.status in {
        DishCardVersionStatus.CONFIRMED,
        DishCardVersionStatus.ARCHIVED,
    }:
        raise DishCardVersionImmutableError("Confirmed or archived version cannot be changed")


def _to_portion_variant(data) -> PortionVariant:
    return PortionVariant(
        id=data.id or PydanticObjectId(),
        age_group=data.age_group,
        portion_grams=data.portion_grams,
        output_grams=data.output_grams,
        nutrition=Nutrition(**data.nutrition.model_dump()),
    )


def _to_ingredient_amount(data) -> IngredientAmount:
    return IngredientAmount(
        ingredient_id=data.ingredient_id,
        ingredient_name_snapshot=data.ingredient_name_snapshot,
        gross_amount=data.gross_amount,
        net_amount=data.net_amount,
        unit=data.unit,
        amount_basis=data.amount_basis,
        portion_variant_id=data.portion_variant_id,
        notes=data.notes,
    )


def _guess_dish_card_identity(text: str) -> tuple[str | None, str | None]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    card_number = None
    name = None

    for index, line in enumerate(lines):
        match = re.search(r"Технологічна\s+карта\s*№\s*([^\n]+)", line, re.IGNORECASE)
        if match:
            card_number = match.group(1).strip()
            if index + 1 < len(lines):
                name = lines[index + 1].strip()
            break

    return card_number, name
