from typing import Annotated

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.modules.auth.dependencies import CsrfProtection, require_permissions
from app.modules.identity.models import AdminPermission, User
from app.modules.recipe.models import DishCardVersionStatus
from app.modules.recipe.schemas import (
    AllergenListResponse,
    AllergenResponse,
    CalculateIngredientsRequest,
    CalculateIngredientsResponse,
    CreateAllergenRequest,
    CreateDishCardRequest,
    CreateDishCardVersionPreviewRequest,
    CreateDishCardVersionRequest,
    CreateIngredientRequest,
    DishCardListResponse,
    DishCardResponse,
    DishCardVersionListResponse,
    DishCardVersionResponse,
    DishCardVersionValidationResponse,
    IngredientListResponse,
    IngredientResponse,
    PdfImportPreviewResponse,
    UpdateAllergenRequest,
    UpdateDishCardRequest,
    UpdateDishCardVersionRequest,
    UpdateIngredientRequest,
)
from app.modules.recipe.service import (
    DishCardVersionImmutableError,
    DishCardVersionInvalidError,
    DishCardVersionNotConfirmedError,
    RecipeConflictError,
    RecipeNotFoundError,
    preview_pdf_import,
)
from app.modules.recipe.service import (
    calculate_ingredients as calculate_ingredients_record,
)
from app.modules.recipe.service import (
    confirm_dish_card_version as confirm_dish_card_version_record,
)
from app.modules.recipe.service import (
    create_allergen as create_allergen_record,
)
from app.modules.recipe.service import (
    create_dish_card as create_dish_card_record,
)
from app.modules.recipe.service import (
    create_dish_card_version as create_dish_card_version_record,
)
from app.modules.recipe.service import (
    create_ingredient as create_ingredient_record,
)
from app.modules.recipe.service import (
    get_allergen as get_allergen_record,
)
from app.modules.recipe.service import (
    get_dish_card as get_dish_card_record,
)
from app.modules.recipe.service import (
    get_dish_card_version as get_dish_card_version_record,
)
from app.modules.recipe.service import (
    get_ingredient as get_ingredient_record,
)
from app.modules.recipe.service import (
    list_allergens as list_allergen_records,
)
from app.modules.recipe.service import (
    list_dish_card_versions as list_dish_card_version_records,
)
from app.modules.recipe.service import (
    list_dish_cards as list_dish_card_records,
)
from app.modules.recipe.service import (
    list_ingredients as list_ingredient_records,
)
from app.modules.recipe.service import (
    update_allergen as update_allergen_record,
)
from app.modules.recipe.service import (
    update_dish_card as update_dish_card_record,
)
from app.modules.recipe.service import (
    update_dish_card_version as update_dish_card_version_record,
)
from app.modules.recipe.service import (
    update_ingredient as update_ingredient_record,
)
from app.modules.recipe.service import (
    validate_dish_card_version as validate_dish_card_version_record,
)

router = APIRouter()

AdminUser = Annotated[
    User,
    Depends(require_permissions(AdminPermission.RECIPES_MANAGE)),
]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


def not_found(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=str(exc),
    )


def conflict(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=str(exc),
    )


def forbidden(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=str(exc),
    )


def bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=str(exc),
    )


@router.get("/ingredients", response_model=IngredientListResponse)
async def list_ingredients(
    _admin: AdminUser,
    offset: Offset = 0,
    limit: Limit = 50,
    query: str | None = None,
    include_inactive: bool = False,
) -> IngredientListResponse:
    ingredients, total = await list_ingredient_records(
        offset=offset,
        limit=limit,
        query=query,
        include_inactive=include_inactive,
    )
    return IngredientListResponse(
        items=[IngredientResponse.from_ingredient(item) for item in ingredients],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/ingredients",
    response_model=IngredientResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_ingredient(
    payload: CreateIngredientRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> IngredientResponse:
    try:
        ingredient = await create_ingredient_record(payload)
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return IngredientResponse.from_ingredient(ingredient)


@router.get("/ingredients/{ingredient_id}", response_model=IngredientResponse)
async def get_ingredient(
    ingredient_id: PydanticObjectId,
    _admin: AdminUser,
) -> IngredientResponse:
    try:
        ingredient = await get_ingredient_record(ingredient_id)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc

    return IngredientResponse.from_ingredient(ingredient)


@router.patch("/ingredients/{ingredient_id}", response_model=IngredientResponse)
async def update_ingredient(
    ingredient_id: PydanticObjectId,
    payload: UpdateIngredientRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> IngredientResponse:
    try:
        ingredient = await update_ingredient_record(ingredient_id, payload)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return IngredientResponse.from_ingredient(ingredient)


@router.get("/allergens", response_model=AllergenListResponse)
async def list_allergens(
    _admin: AdminUser,
    offset: Offset = 0,
    limit: Limit = 50,
    query: str | None = None,
) -> AllergenListResponse:
    allergens, total = await list_allergen_records(
        offset=offset,
        limit=limit,
        query=query,
    )
    return AllergenListResponse(
        items=[AllergenResponse.from_allergen(item) for item in allergens],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/allergens",
    response_model=AllergenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_allergen(
    payload: CreateAllergenRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> AllergenResponse:
    try:
        allergen = await create_allergen_record(payload)
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return AllergenResponse.from_allergen(allergen)


@router.get("/allergens/{allergen_id}", response_model=AllergenResponse)
async def get_allergen(
    allergen_id: PydanticObjectId,
    _admin: AdminUser,
) -> AllergenResponse:
    try:
        allergen = await get_allergen_record(allergen_id)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc

    return AllergenResponse.from_allergen(allergen)


@router.patch("/allergens/{allergen_id}", response_model=AllergenResponse)
async def update_allergen(
    allergen_id: PydanticObjectId,
    payload: UpdateAllergenRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> AllergenResponse:
    try:
        allergen = await update_allergen_record(allergen_id, payload)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return AllergenResponse.from_allergen(allergen)


@router.get("/dish-cards", response_model=DishCardListResponse)
async def list_dish_cards(
    _admin: AdminUser,
    offset: Offset = 0,
    limit: Limit = 50,
    query: str | None = None,
    include_inactive: bool = False,
) -> DishCardListResponse:
    dish_cards, total = await list_dish_card_records(
        offset=offset,
        limit=limit,
        query=query,
        include_inactive=include_inactive,
    )
    return DishCardListResponse(
        items=[DishCardResponse.from_dish_card(item) for item in dish_cards],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/dish-cards",
    response_model=DishCardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_dish_card(
    payload: CreateDishCardRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> DishCardResponse:
    try:
        dish_card = await create_dish_card_record(payload)
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return DishCardResponse.from_dish_card(dish_card)


@router.get("/dish-cards/{dish_card_id}", response_model=DishCardResponse)
async def get_dish_card(
    dish_card_id: PydanticObjectId,
    _admin: AdminUser,
) -> DishCardResponse:
    try:
        dish_card = await get_dish_card_record(dish_card_id)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc

    return DishCardResponse.from_dish_card(dish_card)


@router.patch("/dish-cards/{dish_card_id}", response_model=DishCardResponse)
async def update_dish_card(
    dish_card_id: PydanticObjectId,
    payload: UpdateDishCardRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> DishCardResponse:
    try:
        dish_card = await update_dish_card_record(dish_card_id, payload)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return DishCardResponse.from_dish_card(dish_card)


@router.get(
    "/dish-cards/{dish_card_id}/versions",
    response_model=DishCardVersionListResponse,
)
async def list_dish_card_versions(
    dish_card_id: PydanticObjectId,
    _admin: AdminUser,
    offset: Offset = 0,
    limit: Limit = 50,
) -> DishCardVersionListResponse:
    try:
        versions, total = await list_dish_card_version_records(
            dish_card_id,
            offset=offset,
            limit=limit,
        )
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc

    return DishCardVersionListResponse(
        items=[DishCardVersionResponse.from_version(item) for item in versions],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/dish-cards/{dish_card_id}/versions",
    response_model=DishCardVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_dish_card_version(
    dish_card_id: PydanticObjectId,
    payload: CreateDishCardVersionRequest,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> DishCardVersionResponse:
    try:
        version = await create_dish_card_version_record(
            dish_card_id,
            payload,
            created_by=admin.id,
        )
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return DishCardVersionResponse.from_version(version)


@router.post(
    "/dish-cards/{dish_card_id}/versions/preview",
    response_model=DishCardVersionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_dish_card_version_preview(
    dish_card_id: PydanticObjectId,
    payload: CreateDishCardVersionPreviewRequest,
    admin: AdminUser,
    _csrf: CsrfProtection,
) -> DishCardVersionResponse:
    try:
        version = await create_dish_card_version_record(
            dish_card_id,
            payload,
            created_by=admin.id,
            status=DishCardVersionStatus.IMPORT_PREVIEW,
        )
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except RecipeConflictError as exc:
        raise conflict(exc) from exc

    return DishCardVersionResponse.from_version(version)


@router.post(
    "/dish-card-versions/pdf-preview",
    response_model=PdfImportPreviewResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def preview_dish_card_pdf(
    file: Annotated[UploadFile, File(description="PDF file with dish card")],
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> PdfImportPreviewResponse:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File name is required",
        )
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .pdf files are supported",
        )

    return await preview_pdf_import(file)


@router.get(
    "/dish-card-versions/{version_id}",
    response_model=DishCardVersionResponse,
)
async def get_dish_card_version(
    version_id: PydanticObjectId,
    _admin: AdminUser,
) -> DishCardVersionResponse:
    try:
        version = await get_dish_card_version_record(version_id)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc

    return DishCardVersionResponse.from_version(version)


@router.patch(
    "/dish-card-versions/{version_id}",
    response_model=DishCardVersionResponse,
)
async def update_dish_card_version(
    version_id: PydanticObjectId,
    payload: UpdateDishCardVersionRequest,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> DishCardVersionResponse:
    try:
        version = await update_dish_card_version_record(version_id, payload)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except DishCardVersionImmutableError as exc:
        raise forbidden(exc) from exc

    return DishCardVersionResponse.from_version(version)


@router.get(
    "/dish-card-versions/{version_id}/validation",
    response_model=DishCardVersionValidationResponse,
)
async def validate_dish_card_version(
    version_id: PydanticObjectId,
    _admin: AdminUser,
) -> DishCardVersionValidationResponse:
    try:
        return await validate_dish_card_version_record(version_id)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc


@router.post(
    "/dish-card-versions/{version_id}/confirm",
    response_model=DishCardVersionResponse,
)
async def confirm_dish_card_version(
    version_id: PydanticObjectId,
    _admin: AdminUser,
    _csrf: CsrfProtection,
) -> DishCardVersionResponse:
    try:
        version = await confirm_dish_card_version_record(version_id)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except DishCardVersionImmutableError as exc:
        raise forbidden(exc) from exc
    except DishCardVersionInvalidError as exc:
        raise bad_request(exc) from exc

    return DishCardVersionResponse.from_version(version)


@router.post(
    "/dish-card-versions/{version_id}/calculate",
    response_model=CalculateIngredientsResponse,
)
async def calculate_ingredients(
    version_id: PydanticObjectId,
    payload: CalculateIngredientsRequest,
    _admin: AdminUser,
) -> CalculateIngredientsResponse:
    try:
        items = await calculate_ingredients_record(version_id, payload)
    except RecipeNotFoundError as exc:
        raise not_found(exc) from exc
    except DishCardVersionNotConfirmedError as exc:
        raise bad_request(exc) from exc

    return CalculateIngredientsResponse(
        dish_card_version_id=version_id,
        portion_variant_id=payload.portion_variant_id,
        servings_count=payload.servings_count,
        items=items,
    )
