from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.modules.auth.dependencies import CsrfProtection, CurrentUser
from app.modules.imports.schemas import ImportPreviewResponse
from app.modules.imports.service import preview_dish_cards_import

router = APIRouter()


@router.post(
    "/dish-cards/preview",
    response_model=ImportPreviewResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def preview_dish_cards(
    file: Annotated[UploadFile, File(description="XLSX file with dish cards")],
    _current_user: CurrentUser,
    _csrf: CsrfProtection,
):
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File name is required",
        )

    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .xlsx files are supported",
        )

    return await preview_dish_cards_import(file)
