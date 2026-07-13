from datetime import date as Date

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, status

from app.modules.auth.dependencies import CurrentUser
from app.modules.menus.models import MealType
from app.modules.norm_compliance.schemas import NormComplianceReportResponse
from app.modules.norm_compliance.service import (
    NormComplianceAccessDeniedError,
    NormComplianceNotFoundError,
    NormComplianceValidationError,
    get_norm_compliance_report,
)

router = APIRouter()


@router.get("/report", response_model=NormComplianceReportResponse)
async def get_report(
    current_user: CurrentUser,
    school_id: PydanticObjectId,
    date_from: Date,
    date_to: Date,
    meal_type: MealType | None = None,
    school_group_id: PydanticObjectId | None = None,
) -> NormComplianceReportResponse:
    try:
        return await get_norm_compliance_report(
            school_id,
            date_from,
            date_to,
            current_user,
            meal_type=meal_type,
            school_group_id=school_group_id,
        )
    except NormComplianceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NormComplianceAccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NormComplianceValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
