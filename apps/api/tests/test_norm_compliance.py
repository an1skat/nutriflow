from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
from beanie import PydanticObjectId

from app.modules.identity.models import AgeGroup, SchoolGroup, User, UserRole
from app.modules.menu_requirements.models import MenuRequirement, MenuRequirementDish
from app.modules.menu_requirements.service import hash_daily_menu
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    MealType,
    MenuItemKind,
    MenuItemServingCount,
    MenuPortion,
    Weekday,
)
from app.modules.norm_compliance.registry import get_norm, get_norms
from app.modules.norm_compliance.schemas import (
    ComplianceGroupResponse,
    ComplianceStatus,
    NormComplianceReportResponse,
)
from app.modules.norm_compliance.service import (
    ExpectedRequirement,
    NormComplianceAccessDeniedError,
    NormComplianceValidationError,
    _build_section,
    _get_accessible_school,
    _validate_complete_requirement_week,
    _validate_range,
    calculate_numeric_status,
    contribution_value,
)
from app.modules.norm_compliance.xlsx import build_norm_compliance_workbook
from app.modules.nutrition.domain import (
    NormativeContributionSnapshot,
    NormativeContributionSource,
    NormativeGroupCode,
    NormativeUnit,
)

pytestmark = pytest.mark.no_clean_database


@pytest.mark.parametrize("meal_type", [MealType.BREAKFAST, MealType.LUNCH])
@pytest.mark.parametrize("age_group", list(AgeGroup))
def test_registry_contains_appendix_norms_for_every_supported_age(
    meal_type: MealType,
    age_group: AgeGroup,
) -> None:
    norms = get_norms(meal_type, age_group)

    assert len(norms) == 17
    assert {norm.source_appendix for norm in norms} == {
        "9" if meal_type == MealType.BREAKFAST else "9-1"
    }


def test_registry_preserves_breakfast_and_lunch_values() -> None:
    breakfast_cereal = get_norm(
        MealType.BREAKFAST,
        AgeGroup.SIX_TO_ELEVEN,
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES,
    )
    lunch_meat = get_norm(
        MealType.LUNCH,
        AgeGroup.FOURTEEN_TO_EIGHTEEN,
        NormativeGroupCode.RED_MEAT,
    )

    assert breakfast_cereal is not None
    assert breakfast_cereal.weekly_portions == Decimal("4")
    assert breakfast_cereal.portion_options[0].amount == Decimal("120")
    assert lunch_meat is not None
    assert lunch_meat.weekly_portions == Decimal("3")
    assert lunch_meat.required_amount_per_week == Decimal("360")


@pytest.mark.parametrize(
    ("actual", "expected"),
    [
        (Decimal("99"), ComplianceStatus.COMPLETE),
        (Decimal("100"), ComplianceStatus.COMPLETE),
        (Decimal("101"), ComplianceStatus.COMPLETE),
        (Decimal("98.99"), ComplianceStatus.UNDER),
        (Decimal("101.01"), ComplianceStatus.OVER),
    ],
)
def test_numeric_status_uses_tolerance(actual: Decimal, expected: ComplianceStatus) -> None:
    status, _ = calculate_numeric_status(
        actual,
        Decimal("100"),
        minimum_percent=Decimal("99"),
        maximum_percent=Decimal("101"),
    )
    assert status == expected


@pytest.mark.parametrize(
    "group_code",
    [
        NormativeGroupCode.SALT,
        NormativeGroupCode.SUGAR,
        NormativeGroupCode.COCOA,
        NormativeGroupCode.TEA,
    ],
)
def test_limited_products_are_complete_from_fifty_percent(
    group_code: NormativeGroupCode,
) -> None:
    meal_type = MealType.BREAKFAST
    norm = get_norm(meal_type, AgeGroup.SIX_TO_ELEVEN, group_code)
    assert norm is not None

    status, percent = calculate_numeric_status(
        Decimal("50"),
        Decimal("100"),
        minimum_percent=norm.tolerance.minimum_percent,
        maximum_percent=norm.tolerance.maximum_percent,
    )

    assert percent == Decimal("50")
    assert status == ComplianceStatus.COMPLETE


@pytest.mark.parametrize(
    "group_code",
    [
        NormativeGroupCode.FISH,
        NormativeGroupCode.POULTRY,
        NormativeGroupCode.RED_MEAT,
    ],
)
def test_fish_and_meat_groups_require_exact_weekly_mass(group_code: NormativeGroupCode) -> None:
    meal_type = MealType.LUNCH if group_code == NormativeGroupCode.RED_MEAT else MealType.BREAKFAST
    norm = get_norm(meal_type, AgeGroup.SIX_TO_ELEVEN, group_code)
    assert norm is not None

    status, _ = calculate_numeric_status(
        Decimal("99.99"),
        Decimal("100"),
        minimum_percent=norm.tolerance.minimum_percent,
        maximum_percent=norm.tolerance.maximum_percent,
    )

    assert status == ComplianceStatus.UNDER


def test_regular_groups_allow_a_ten_percent_net_portion_deviation() -> None:
    norm = get_norm(
        MealType.BREAKFAST,
        AgeGroup.SIX_TO_ELEVEN,
        NormativeGroupCode.VEGETABLES,
    )
    assert norm is not None

    assert calculate_numeric_status(
        Decimal("90"),
        Decimal("100"),
        minimum_percent=norm.tolerance.minimum_percent,
        maximum_percent=norm.tolerance.maximum_percent,
    )[0] == ComplianceStatus.COMPLETE
    assert calculate_numeric_status(
        Decimal("110"),
        Decimal("100"),
        minimum_percent=norm.tolerance.minimum_percent,
        maximum_percent=norm.tolerance.maximum_percent,
    )[0] == ComplianceStatus.COMPLETE


def test_ready_portion_is_compared_with_the_appendix_portion_amount() -> None:
    norm = get_norm(
        MealType.BREAKFAST,
        AgeGroup.SIX_TO_ELEVEN,
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES,
    )
    assert norm is not None
    contribution = NormativeContributionSnapshot(
        group_code=NormativeGroupCode.CEREALS_GRAINS_LEGUMES,
        amount=Decimal("95"),
        unit=NormativeUnit.GRAM,
        portion_equivalent=Decimal("1"),
        source_type=NormativeContributionSource.PORTION_VARIANT,
        source_name="Каша вівсяна",
    )

    assert contribution_value(contribution, norm) == (Decimal("120"), Decimal("1"))


def test_section_reports_complete_row_and_stale_requirement() -> None:
    group, day, expected = _expected_fixture()
    requirement = _requirement_fixture(
        group,
        day,
        expected.weekly_menu_id,
        amount=Decimal("500"),
    )

    complete = _build_section(group.age_group, MealType.BREAKFAST, [requirement], [expected])
    vegetables = next(
        row for row in complete.rows if row.normative_group_code == NormativeGroupCode.VEGETABLES
    )
    assert vegetables.status == ComplianceStatus.COMPLETE
    assert vegetables.actual_amount == Decimal("500")
    assert vegetables.required_amount == Decimal("500")
    assert vegetables.required_portions == Decimal("5")

    requirement.source_day_hash = "0" * 64
    stale = _build_section(group.age_group, MealType.BREAKFAST, [requirement], [expected])
    stale_vegetables = next(
        row for row in stale.rows if row.normative_group_code == NormativeGroupCode.VEGETABLES
    )
    assert stale.stale_dates == [date(2026, 7, 6)]
    assert stale_vegetables.status == ComplianceStatus.STALE


def test_weekly_norms_are_not_prorated_by_available_days() -> None:
    group, day, expected = _expected_fixture()
    requirement = _requirement_fixture(
        group,
        day,
        expected.weekly_menu_id,
        amount=Decimal("100"),
    )

    section = _build_section(group.age_group, MealType.BREAKFAST, [requirement], [expected])
    juice = next(
        row for row in section.rows if row.normative_group_code == NormativeGroupCode.JUICES
    )

    assert juice.required_portions == Decimal("1")
    assert juice.required_amount == Decimal("200")


def test_section_reports_missing_and_unmapped_requirements() -> None:
    group, day, expected = _expected_fixture()
    missing = _build_section(group.age_group, MealType.BREAKFAST, [], [expected])
    assert missing.missing_dates == [date(2026, 7, 6)]
    assert all(row.status == ComplianceStatus.MISSING for row in missing.rows)

    requirement = _requirement_fixture(group, day, expected.weekly_menu_id, amount=None)
    unmapped = _build_section(
        group.age_group,
        MealType.BREAKFAST,
        [requirement],
        [expected],
    )
    assert unmapped.unmapped_items[0].item_name == "Овочевий салат"
    assert all(row.status == ComplianceStatus.UNMAPPED for row in unmapped.rows)


@pytest.mark.asyncio
async def test_school_user_cannot_read_norm_compliance() -> None:
    current_user = User.model_construct(
        id=PydanticObjectId(),
        role=UserRole.SCHOOL_USER,
        school_id=PydanticObjectId(),
    )

    with pytest.raises(NormComplianceAccessDeniedError, match="Norm compliance access denied"):
        await _get_accessible_school(current_user, current_user.school_id)


def test_report_range_must_be_one_monday_to_friday_week() -> None:
    _validate_range(date(2026, 7, 6), date(2026, 7, 10))

    with pytest.raises(NormComplianceValidationError, match="Monday-to-Friday"):
        _validate_range(date(2026, 7, 7), date(2026, 7, 11))

    with pytest.raises(NormComplianceValidationError, match="Monday-to-Friday"):
        _validate_range(date(2026, 7, 6), date(2026, 7, 9))


def test_report_requires_menu_requirements_for_all_five_weekdays() -> None:
    group, base_day, _expected = _expected_fixture()
    weekly_menu_id = PydanticObjectId()
    expected: list[ExpectedRequirement] = []
    requirements: list[MenuRequirement] = []

    for offset, weekday in enumerate(list(Weekday)[:5]):
        service_date = date(2026, 7, 6) + timedelta(days=offset)
        day = base_day.model_copy(
            update={"weekday": weekday, "date": service_date},
            deep=True,
        )
        expected_item = ExpectedRequirement(
            weekly_menu_id=weekly_menu_id,
            weekday=weekday,
            service_date=service_date,
            meal_type=MealType.BREAKFAST,
            school_group=group,
            day=day,
        )
        expected.append(expected_item)
        requirements.append(
            _requirement_fixture(
                group,
                day,
                weekly_menu_id,
                amount=Decimal("500"),
            )
        )

    _validate_complete_requirement_week(
        requirements,
        expected,
        date(2026, 7, 6),
        date(2026, 7, 10),
    )

    with pytest.raises(NormComplianceValidationError, match="all five weekdays"):
        _validate_complete_requirement_week(
            requirements[:4],
            expected,
            date(2026, 7, 6),
            date(2026, 7, 10),
        )

    with pytest.raises(NormComplianceValidationError, match="all five weekdays"):
        _validate_complete_requirement_week(
            requirements[:4],
            expected[:4],
            date(2026, 7, 6),
            date(2026, 7, 10),
        )


def test_builds_norm_compliance_workbook() -> None:
    group, day, expected = _expected_fixture()
    requirement = _requirement_fixture(
        group,
        day,
        expected.weekly_menu_id,
        amount=Decimal("500"),
    )
    section = _build_section(group.age_group, MealType.BREAKFAST, [requirement], [expected])
    report = NormComplianceReportResponse(
        school_id=PydanticObjectId(),
        school_name="Ліцей №1",
        date_from=date(2026, 7, 6),
        date_to=date(2026, 7, 10),
        status=section.status,
        groups=[
            ComplianceGroupResponse(
                school_group_id=group.id,
                school_group_name=group.name,
                age_group=group.age_group,
                status=section.status,
                sections=[section],
            )
        ],
    )

    workbook = openpyxl.load_workbook(BytesIO(build_norm_compliance_workbook(report)))
    sheet = workbook.active

    assert sheet["A1"].value == "ДОТРИМАННЯ НОРМ ХАРЧУВАННЯ"
    assert sheet["B2"].value == "Ліцей №1"
    vegetables = next(row for row in sheet.iter_rows() if row[0].value == "Овочі")
    assert vegetables[4].value == 500
    assert vegetables[5].value == 500
    assert vegetables[-1].value == "В нормі"


def _expected_fixture() -> tuple[SchoolGroup, DailyMenu, ExpectedRequirement]:
    group = SchoolGroup(name="6-11", age_group=AgeGroup.SIX_TO_ELEVEN)
    menu_item = DailyMenuItem(
        position=1,
        kind=MenuItemKind.PRODUCT,
        name="Овочевий салат",
        product_name_snapshot="Овочевий салат",
        portions=[MenuPortion(age_group=group.age_group, yield_amount="100")],
        servings=[
            MenuItemServingCount(
                school_group_id=group.id,
                age_group=group.age_group,
                children_count=20,
            )
        ],
    )
    day = DailyMenu(weekday=Weekday.MONDAY, date=date(2026, 7, 6), items=[menu_item])
    expected = ExpectedRequirement(
        weekly_menu_id=PydanticObjectId(),
        weekday=day.weekday,
        service_date=day.date,
        meal_type=MealType.BREAKFAST,
        school_group=group,
        day=day,
    )
    return group, day, expected


def _requirement_fixture(
    group: SchoolGroup,
    day: DailyMenu,
    weekly_menu_id: PydanticObjectId,
    *,
    amount: Decimal | None,
) -> MenuRequirement:
    item = day.items[0]
    contributions = (
        [
            NormativeContributionSnapshot(
                group_code=NormativeGroupCode.VEGETABLES,
                amount=amount,
                unit=NormativeUnit.GRAM,
                source_type=NormativeContributionSource.PRODUCT,
                source_name="Овочевий салат",
            )
        ]
        if amount is not None
        else []
    )
    return MenuRequirement.model_construct(
        id=PydanticObjectId(),
        school_id=PydanticObjectId(),
        weekly_menu_id=weekly_menu_id,
        menu_title="Тижневе меню",
        meal_type=MealType.BREAKFAST,
        weekday=day.weekday,
        service_date=day.date,
        school_group_id=group.id,
        school_group_name=group.name,
        age_group=group.age_group,
        dishes=[
            MenuRequirementDish(
                menu_item_id=item.id,
                position=1,
                kind=MenuItemKind.PRODUCT,
                name=item.name,
                yield_amount="100",
                children_count=20,
                normative_contributions=contributions,
            )
        ],
        source_day_hash=hash_daily_menu(day),
        generated_by=PydanticObjectId(),
    )
