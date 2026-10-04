from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from beanie import PydanticObjectId

from app.modules.menu_requirements.errors import MenuRequirementValidationError
from app.modules.menu_requirements.reporting import (
    _build_calendar_month,
    _build_scope_day_summaries,
    _exclude_not_served_requirements,
    _validate_complete_aggregate_report,
)
from app.modules.menu_requirements.schemas import MenuRequirementReportGranularity
from app.modules.menu_requirements.utils import hash_daily_menu
from app.modules.menus.models import DailyMenu, Weekday
from app.modules.menus.service import _merge_distributed_days

pytestmark = pytest.mark.no_clean_database


@pytest.mark.parametrize("granularity", ["week", "month"])
@pytest.mark.parametrize(
    "states,success",
    [
        (["complete"] * 5, True),
        (["not_served"] + ["complete"] * 4, True),
        (["not_served"] * 5, True),
        (["not_served", "empty"] + ["complete"] * 3, False),
        (["empty"] * 5, False),
    ],
)
def test_period_completion_with_not_served(monkeypatch, granularity, states, success):
    from app.modules.menu_requirements import reporting

    school_id, menu_id, group_id = [PydanticObjectId() for _ in range(3)]
    group = SimpleNamespace(id=group_id)
    monkeypatch.setattr(
        reporting,
        "select_eligible_groups",
        lambda day, _: [group] if day.state == "complete" else [],
    )
    monday = date(2026, 7, 6)
    expected, requirements = {}, []
    for offset, state in enumerate(states):
        service_date = monday + timedelta(days=offset)
        weekday = list(Weekday)[offset]
        expected[service_date] = [
            SimpleNamespace(
                day=SimpleNamespace(state=state, not_served=state == "not_served"),
                school_id=school_id,
                weekly_menu_id=menu_id,
                weekday=weekday,
            )
        ]
        if state == "complete":
            requirements.append(
                SimpleNamespace(
                    id=PydanticObjectId(),
                    service_date=service_date,
                    school_id=school_id,
                    weekly_menu_id=menu_id,
                    weekday=weekday,
                    school_group_id=group_id,
                )
            )
    summaries, _ = _build_scope_day_summaries(
        expected,
        requirements,
        requirement_statuses={},
        groups_by_school_id={school_id: {group_id: group}},
    )
    assert summaries[monday].not_served == (states[0] == "not_served")
    calendar = _build_calendar_month(
        2026,
        7,
        expected_dates=set(expected),
        generated_dates={r.service_date for r in requirements},
        stale_dates=set(),
        day_summaries=summaries,
    )
    if success:
        assert calendar.missing_days == 0
        assert calendar.generated_days == 5
        week = next(w for w in calendar.weeks if w.date_from == monday)
        assert week.generated_days == 5
        assert week.missing_days == 0
    kwargs = dict(
        date_from=monday if granularity == "week" else date(2026, 7, 1),
        date_to=monday + timedelta(days=4) if granularity == "week" else date(2026, 7, 31),
        day_summaries=summaries,
    )
    if success:
        _validate_complete_aggregate_report(MenuRequirementReportGranularity(granularity), **kwargs)
    else:
        with pytest.raises(MenuRequirementValidationError):
            _validate_complete_aggregate_report(
                MenuRequirementReportGranularity(granularity), **kwargs
            )


def test_not_served_excludes_previously_generated_requirements():
    menu_id = PydanticObjectId()
    old = SimpleNamespace(weekly_menu_id=menu_id, weekday=Weekday.MONDAY)
    other = SimpleNamespace(weekly_menu_id=PydanticObjectId(), weekday=Weekday.MONDAY)
    expected = {
        date(2026, 7, 6): [
            SimpleNamespace(
                weekly_menu_id=menu_id,
                weekday=Weekday.MONDAY,
                day=SimpleNamespace(not_served=True),
            )
        ]
    }
    assert _exclude_not_served_requirements(expected, [old, other]) == [other]


def test_not_served_zeroes_children_and_changes_hash():
    from app.modules.identity.models import AgeGroup
    from app.modules.menus.models import DailyMenuItem, MenuItemServingCount, MenuPortion

    day = DailyMenu(
        weekday=Weekday.MONDAY,
        items=[
            DailyMenuItem(
                position=1,
                name="Каша",
                portions=[
                    MenuPortion(
                        age_group=AgeGroup.SIX_TO_ELEVEN,
                        yield_amount="100",
                    )
                ],
                servings=[
                    MenuItemServingCount(
                        school_group_id=PydanticObjectId(),
                        age_group=AgeGroup.SIX_TO_ELEVEN,
                        children_count=12,
                    )
                ],
            )
        ],
    )
    original_hash = hash_daily_menu(day)
    marked = DailyMenu.model_validate({**day.model_dump(), "not_served": True})
    assert marked.items[0].servings[0].children_count == 0
    assert hash_daily_menu(marked) != original_hash
    assert DailyMenu.model_validate(day.model_dump()).not_served is False
    legacy = day.model_dump()
    legacy.pop("not_served")
    assert DailyMenu.model_validate(legacy).not_served is False
    zero_day = DailyMenu.model_validate({**marked.model_dump(), "not_served": False})
    assert hash_daily_menu(marked) != hash_daily_menu(zero_day)


@pytest.mark.parametrize("school_not_served", [False, True])
def test_template_merge_preserves_school_not_served_and_normalizes_all_items(school_not_served):
    from app.modules.identity.models import AgeGroup
    from app.modules.menus.models import DailyMenuItem, MenuItemServingCount, MenuPortion

    school_day = DailyMenu(
        weekday=Weekday.MONDAY,
        not_served=school_not_served,
        items=[
            DailyMenuItem(
                position=1,
                name="Каша",
                portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="100")],
                servings=[
                    MenuItemServingCount(
                        school_group_id=PydanticObjectId(),
                        age_group=AgeGroup.SIX_TO_ELEVEN,
                        children_count=30,
                    )
                ],
            )
        ],
    )
    template = DailyMenu.model_validate(
        {**school_day.model_dump(), "not_served": not school_not_served}
    )
    # A new template item can carry counts independently of the existing school items.
    template.items.append(template.items[0].model_copy(deep=True))
    template.items[-1].id = PydanticObjectId()
    template.items[-1].position = 2
    template.items[-1].servings[0].children_count = 30
    merged = _merge_distributed_days([template], [school_day], [school_day])[0]
    assert merged.not_served == school_not_served
    if school_not_served:
        assert all(s.children_count == 0 for item in merged.items for s in item.servings)
    else:
        assert merged.items[0].servings[0].children_count == 30


@pytest.mark.asyncio
@pytest.mark.parametrize("granularity", ["week", "month"])
async def test_all_not_served_period_returns_zero_report(monkeypatch, granularity):
    from app.modules.identity.models import School, User, UserRole
    from app.modules.menu_requirements import reporting

    school = School.model_construct(id=PydanticObjectId(), name="Школа", groups=[])
    monday = date(2026, 7, 6)
    expected = {
        monday + timedelta(days=offset): [
            SimpleNamespace(
                school_id=school.id,
                weekly_menu_id=PydanticObjectId(),
                weekday=list(Weekday)[offset],
                day=SimpleNamespace(not_served=True),
            )
        ]
        for offset in range(5)
    }

    async def get_school(*args, **kwargs):
        return school

    async def get_expected(*args, **kwargs):
        return expected

    async def get_empty(*args, **kwargs):
        return []

    monkeypatch.setattr(reporting, "_get_accessible_school", get_school)
    monkeypatch.setattr(reporting, "_expected_menu_days", get_expected)
    monkeypatch.setattr(reporting, "_find_requirements_for_report", get_empty)
    monkeypatch.setattr(reporting, "_requirement_statuses", get_empty)
    report = await reporting.get_menu_requirement_report(
        school.id,
        monday if granularity == "week" else date(2026, 7, 1),
        monday + timedelta(days=4) if granularity == "week" else date(2026, 7, 31),
        MenuRequirementReportGranularity(granularity),
        User.model_construct(role=UserRole.SCHOOL_USER, school_id=school.id),
    )
    assert report.not_served is True
    assert report.groups == []
    assert report.missing_dates == []
    assert report.stale_dates == []

    from io import BytesIO

    from openpyxl import load_workbook

    from app.modules.menu_requirements.xlsx import build_menu_requirement_report_workbook

    workbook = load_workbook(BytesIO(build_menu_requirement_report_workbook(report)))
    assert any(
        cell.value == "Не харчувалися. Кількість дітей: 0."
        for row in workbook.active
        for cell in row
    )
