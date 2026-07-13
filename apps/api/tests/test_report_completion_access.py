from datetime import date, timedelta

import pytest
from beanie import PydanticObjectId

from app.modules.identity.models import School, User, UserRole
from app.modules.menu_requirements import service as menu_requirement_service
from app.modules.menu_requirements.schemas import (
    MenuRequirementAggregateStatus,
    MenuRequirementCalendarDayResponse,
    MenuRequirementReportGranularity,
)
from app.modules.menu_requirements.service import (
    MenuRequirementValidationError,
    _validate_complete_aggregate_report,
)
from app.modules.norm_compliance import service as norm_compliance_service
from app.modules.norm_compliance.service import NormComplianceValidationError

pytestmark = pytest.mark.no_clean_database


def _complete_day(service_date: date) -> MenuRequirementCalendarDayResponse:
    return MenuRequirementCalendarDayResponse(
        service_date=service_date,
        expected_requirements=2,
        generated_requirements=2,
        missing_requirements=0,
        stale_requirements=0,
        status=MenuRequirementAggregateStatus.COMPLETE,
    )


def test_monthly_report_requires_every_participating_day() -> None:
    date_from = date(2026, 7, 1)
    date_to = date(2026, 7, 31)
    summaries = {
        date(2026, 7, 1): _complete_day(date(2026, 7, 1)),
        date(2026, 7, 2): _complete_day(date(2026, 7, 2)),
    }

    _validate_complete_aggregate_report(
        MenuRequirementReportGranularity.MONTH,
        date_from=date_from,
        date_to=date_to,
        day_summaries=summaries,
    )

    summaries[date(2026, 7, 2)] = summaries[date(2026, 7, 2)].model_copy(
        update={
            "generated_requirements": 1,
            "missing_requirements": 1,
            "status": MenuRequirementAggregateStatus.MISSING,
        }
    )
    with pytest.raises(MenuRequirementValidationError, match="every participating day"):
        _validate_complete_aggregate_report(
            MenuRequirementReportGranularity.MONTH,
            date_from=date_from,
            date_to=date_to,
            day_summaries=summaries,
        )


def test_weekly_report_still_requires_five_complete_days() -> None:
    date_from = date(2026, 7, 6)
    date_to = date(2026, 7, 10)
    summaries = {
        date_from + timedelta(days=offset): _complete_day(
            date_from + timedelta(days=offset)
        )
        for offset in range(5)
    }

    _validate_complete_aggregate_report(
        MenuRequirementReportGranularity.WEEK,
        date_from=date_from,
        date_to=date_to,
        day_summaries=summaries,
    )

    summaries.pop(date_to)
    with pytest.raises(MenuRequirementValidationError, match="all five weekdays"):
        _validate_complete_aggregate_report(
            MenuRequirementReportGranularity.WEEK,
            date_from=date_from,
            date_to=date_to,
            day_summaries=summaries,
        )


@pytest.mark.asyncio
async def test_owner_can_open_an_incomplete_monthly_menu_requirement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    school = School.model_construct(
        id=PydanticObjectId(),
        name="Owner school",
        groups=[],
    )

    async def get_school(*_args, **_kwargs):
        return school

    async def get_expected_days(*_args, **_kwargs):
        return {}

    async def get_requirements(*_args, **_kwargs):
        return []

    async def get_statuses(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(menu_requirement_service, "_get_accessible_school", get_school)
    monkeypatch.setattr(menu_requirement_service, "_expected_menu_days", get_expected_days)
    monkeypatch.setattr(
        menu_requirement_service,
        "_find_requirements_for_report",
        get_requirements,
    )
    monkeypatch.setattr(menu_requirement_service, "_requirement_statuses", get_statuses)

    owner = User.model_construct(id=PydanticObjectId(), role=UserRole.OWNER)
    report = await menu_requirement_service.get_menu_requirement_report(
        school.id,
        date(2026, 7, 1),
        date(2026, 7, 31),
        MenuRequirementReportGranularity.MONTH,
        owner,
    )
    assert report.groups == []

    admin = User.model_construct(id=PydanticObjectId(), role=UserRole.ADMIN)
    with pytest.raises(MenuRequirementValidationError, match="every participating day"):
        await menu_requirement_service.get_menu_requirement_report(
            school.id,
            date(2026, 7, 1),
            date(2026, 7, 31),
            MenuRequirementReportGranularity.MONTH,
            admin,
        )


@pytest.mark.asyncio
async def test_owner_can_open_incomplete_norm_compliance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    school = School.model_construct(
        id=PydanticObjectId(),
        name="Owner school",
        groups=[],
    )

    async def get_school(*_args, **_kwargs):
        return school

    async def get_empty(*_args, **_kwargs):
        return []

    monkeypatch.setattr(norm_compliance_service, "_get_accessible_school", get_school)
    monkeypatch.setattr(norm_compliance_service, "_find_requirements", get_empty)
    monkeypatch.setattr(norm_compliance_service, "_find_expected_requirements", get_empty)

    owner = User.model_construct(id=PydanticObjectId(), role=UserRole.OWNER)
    report = await norm_compliance_service.get_norm_compliance_report(
        school.id,
        date(2026, 7, 6),
        date(2026, 7, 10),
        owner,
    )
    assert report.groups == []

    admin = User.model_construct(id=PydanticObjectId(), role=UserRole.ADMIN)
    with pytest.raises(NormComplianceValidationError, match="all five weekdays"):
        await norm_compliance_service.get_norm_compliance_report(
            school.id,
            date(2026, 7, 6),
            date(2026, 7, 10),
            admin,
        )
