from datetime import date as Date
from decimal import Decimal
from enum import StrEnum

from beanie import PydanticObjectId
from pydantic import BaseModel

from app.modules.identity.models import AgeGroup
from app.modules.menus.models import MealType
from app.modules.norm_compliance.domain import (
    NormAmountDecimal,
    NormativeContributionSource,
    NormativeGroupCode,
    NormativeUnit,
)


class ComplianceStatus(StrEnum):
    COMPLETE = "complete"
    UNDER = "under"
    OVER = "over"
    MISSING = "missing"
    STALE = "stale"
    UNMAPPED = "unmapped"
    MIXED = "mixed"


class ToleranceInfoResponse(BaseModel):
    minimum_percent: Decimal
    maximum_percent: Decimal
    description: str


class ComplianceBreakdownResponse(BaseModel):
    requirement_id: PydanticObjectId
    service_date: Date
    menu_item_id: PydanticObjectId
    dish_name: str
    source_type: NormativeContributionSource
    source_id: str | None
    source_name: str
    amount: NormAmountDecimal
    unit: NormativeUnit
    portion_equivalent: NormAmountDecimal | None


class UnmappedItemResponse(BaseModel):
    requirement_id: PydanticObjectId
    service_date: Date
    menu_item_id: PydanticObjectId
    item_name: str
    reason: str


class ComplianceRowResponse(BaseModel):
    normative_group_code: NormativeGroupCode
    normative_group_name: str
    characteristic: str
    frequency: str
    source_appendix: str
    required_portions: NormAmountDecimal
    actual_portions: NormAmountDecimal
    required_amount: NormAmountDecimal
    actual_amount: NormAmountDecimal
    unit: NormativeUnit
    percent: NormAmountDecimal | None
    deviation: NormAmountDecimal
    status: ComplianceStatus
    tolerance: ToleranceInfoResponse
    breakdown: list[ComplianceBreakdownResponse]
    unmapped_items: list[UnmappedItemResponse]


class ComplianceMealSectionResponse(BaseModel):
    meal_type: MealType
    status: ComplianceStatus
    expected_dates: list[Date]
    missing_dates: list[Date]
    stale_dates: list[Date]
    rows: list[ComplianceRowResponse]
    unmapped_items: list[UnmappedItemResponse]


class ComplianceGroupResponse(BaseModel):
    school_group_id: PydanticObjectId
    school_group_name: str
    age_group: AgeGroup
    status: ComplianceStatus
    sections: list[ComplianceMealSectionResponse]


class NormComplianceReportResponse(BaseModel):
    school_id: PydanticObjectId
    school_name: str
    date_from: Date
    date_to: Date
    status: ComplianceStatus
    groups: list[ComplianceGroupResponse]
