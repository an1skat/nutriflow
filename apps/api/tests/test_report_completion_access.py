from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from beanie import PydanticObjectId

from app.modules.identity.models import School, User, UserRole
from app.modules.menu_requirements import reporting as menu_requirement_reporting
from app.modules.menu_requirements.errors import (
    MenuRequirementRangeIncompleteError,
    MenuRequirementValidationError,
)
from app.modules.menu_requirements.reporting import (
    _validate_complete_aggregate_report,
    _validate_report_range,
)
from app.modules.menu_requirements.schemas import (
    MenuRequirementAggregateStatus,
    MenuRequirementCalendarDayResponse,
    MenuRequirementReportGranularity,
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


def test_custom_range_ignores_weekends_between_complete_workdays() -> None:
    friday = date(2026, 7, 10)
    monday = date(2026, 7, 13)

    _validate_complete_aggregate_report(
        MenuRequirementReportGranularity.RANGE,
        date_from=friday,
        date_to=monday,
        day_summaries={
            friday: _complete_day(friday),
            monday: _complete_day(monday),
        },
    )


def test_custom_range_returns_exact_missing_and_stale_workdays() -> None:
    monday = date(2026, 7, 6)
    tuesday = date(2026, 7, 7)
    wednesday = date(2026, 7, 8)
    stale_wednesday = _complete_day(wednesday).model_copy(
        update={
            "stale_requirements": 1,
            "status": MenuRequirementAggregateStatus.STALE,
        }
    )

    with pytest.raises(MenuRequirementRangeIncompleteError) as error:
        _validate_complete_aggregate_report(
            MenuRequirementReportGranularity.RANGE,
            date_from=monday,
            date_to=wednesday,
            day_summaries={
                monday: _complete_day(monday),
                wednesday: stale_wednesday,
            },
        )

    assert error.value.missing_dates == (tuesday,)
    assert error.value.stale_dates == (wednesday,)
    assert str(error.value) == (
        "Menu requirement report cannot be generated; "
        "missing dates: 2026-07-07; stale dates: 2026-07-08"
    )


def test_custom_range_requires_a_workday_and_one_calendar_month() -> None:
    with pytest.raises(MenuRequirementValidationError, match="at least one weekday"):
        _validate_complete_aggregate_report(
            MenuRequirementReportGranularity.RANGE,
            date_from=date(2026, 7, 11),
            date_to=date(2026, 7, 12),
            day_summaries={},
        )

    with pytest.raises(MenuRequirementValidationError, match="one calendar month"):
        _validate_report_range(
            date(2026, 7, 31),
            date(2026, 8, 3),
            MenuRequirementReportGranularity.RANGE,
        )


def test_weekly_report_still_requires_five_complete_days() -> None:
    date_from = date(2026, 7, 6)
    date_to = date(2026, 7, 10)
    summaries = {
        date_from + timedelta(days=offset): _complete_day(date_from + timedelta(days=offset))
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


def test_weekly_report_ignores_weekend_summaries() -> None:
    monday = date(2026, 7, 6)
    sunday = monday + timedelta(days=6)
    summaries = {
        monday + timedelta(days=offset): _complete_day(monday + timedelta(days=offset))
        for offset in range(5)
    }
    summaries[sunday] = _complete_day(sunday).model_copy(
        update={
            "stale_requirements": 1,
            "status": MenuRequirementAggregateStatus.STALE,
        }
    )

    _validate_complete_aggregate_report(
        MenuRequirementReportGranularity.WEEK,
        date_from=monday,
        date_to=sunday,
        day_summaries=summaries,
    )


def test_monthly_report_ignores_weekend_summaries() -> None:
    weekday = date(2026, 7, 6)
    saturday = date(2026, 7, 11)
    summaries = {
        weekday: _complete_day(weekday),
        saturday: _complete_day(saturday).model_copy(
            update={
                "stale_requirements": 1,
                "status": MenuRequirementAggregateStatus.STALE,
            }
        ),
    }

    _validate_complete_aggregate_report(
        MenuRequirementReportGranularity.MONTH,
        date_from=date(2026, 7, 1),
        date_to=date(2026, 7, 31),
        day_summaries=summaries,
    )


@pytest.mark.parametrize(
    "granularity",
    [
        MenuRequirementReportGranularity.WEEK,
        MenuRequirementReportGranularity.MONTH,
    ],
)
@pytest.mark.asyncio
async def test_aggregate_report_data_excludes_weekends_for_owner(
    monkeypatch: pytest.MonkeyPatch,
    granularity: MenuRequirementReportGranularity,
) -> None:
    school = School.model_construct(
        id=PydanticObjectId(),
        name="Owner school",
        groups=[],
    )
    friday = date(2026, 7, 10)
    saturday = date(2026, 7, 11)
    weekday_requirement = SimpleNamespace(id=PydanticObjectId(), service_date=friday)
    weekend_requirement = SimpleNamespace(id=PydanticObjectId(), service_date=saturday)
    captured_requirement_dates: list[date] = []
    captured_expected_dates: set[date] = set()

    async def get_school(*_args, **_kwargs):
        return school

    async def get_expected_days(*_args, **_kwargs):
        return {friday: [object()], saturday: [object()]}

    async def get_requirements(*_args, **_kwargs):
        return [weekday_requirement, weekend_requirement]

    async def get_statuses(requirements):
        assert [requirement.service_date for requirement in requirements] == [friday]
        return {}

    def build_groups(requirements, *, expected_days, **_kwargs):
        captured_requirement_dates.extend(requirement.service_date for requirement in requirements)
        captured_expected_dates.update(expected_days)
        return []

    monkeypatch.setattr(menu_requirement_reporting, "_get_accessible_school", get_school)
    monkeypatch.setattr(menu_requirement_reporting, "_expected_menu_days", get_expected_days)
    monkeypatch.setattr(
        menu_requirement_reporting,
        "_find_requirements_for_report",
        get_requirements,
    )
    monkeypatch.setattr(menu_requirement_reporting, "_requirement_statuses", get_statuses)
    monkeypatch.setattr(menu_requirement_reporting, "_build_report_groups", build_groups)

    owner = User.model_construct(id=PydanticObjectId(), role=UserRole.OWNER)
    report = await menu_requirement_reporting.get_menu_requirement_report(
        school.id,
        date(2026, 7, 6),
        date(2026, 7, 12),
        granularity,
        owner,
    )

    assert captured_requirement_dates == [friday]
    assert captured_expected_dates == {friday}
    assert report.missing_dates == []
    assert report.stale_dates == []


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

    monkeypatch.setattr(menu_requirement_reporting, "_get_accessible_school", get_school)
    monkeypatch.setattr(menu_requirement_reporting, "_expected_menu_days", get_expected_days)
    monkeypatch.setattr(
        menu_requirement_reporting,
        "_find_requirements_for_report",
        get_requirements,
    )
    monkeypatch.setattr(menu_requirement_reporting, "_requirement_statuses", get_statuses)

    owner = User.model_construct(id=PydanticObjectId(), role=UserRole.OWNER)
    report = await menu_requirement_reporting.get_menu_requirement_report(
        school.id,
        date(2026, 7, 1),
        date(2026, 7, 31),
        MenuRequirementReportGranularity.MONTH,
        owner,
    )
    assert report.groups == []

    admin = User.model_construct(id=PydanticObjectId(), role=UserRole.ADMIN)
    with pytest.raises(MenuRequirementValidationError, match="every participating day"):
        await menu_requirement_reporting.get_menu_requirement_report(
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
