from datetime import UTC, date, datetime

import pytest
from beanie import PydanticObjectId

from app.core.config import Settings
from app.modules.identity.models import AgeGroup
from app.modules.menus.models import (
    DailyMenu,
    DailyMenuItem,
    DayCloseReason,
    MealType,
    MenuChangeRequest,
    MenuFieldChange,
    MenuPortion,
    Weekday,
    WeeklyMenu,
)
from app.modules.menus.notifications import build_day_close_email, build_menu_change_email

pytestmark = pytest.mark.no_clean_database


def test_builds_menu_change_email_with_date_and_deep_link() -> None:
    item = DailyMenuItem(
        position=1,
        name="Каша гречана",
        portions=[MenuPortion(age_group=AgeGroup.SIX_TO_ELEVEN, yield_amount="200")],
    )
    request_id = PydanticObjectId()
    request = MenuChangeRequest.model_construct(
        id=request_id,
        menu_id=PydanticObjectId(),
        school_id=PydanticObjectId(),
        submitted_by=PydanticObjectId(),
        menu_title="Меню на тиждень",
        meal_type=MealType.LUNCH,
        days_snapshot=[DailyMenu(weekday=Weekday.MONDAY, date=date(2026, 7, 13), items=[item])],
        changes=[
            MenuFieldChange(
                weekday=Weekday.MONDAY,
                item_id=item.id,
                position=1,
                field="name",
                before_value="Каша",
                after_value="Каша гречана",
            )
        ],
        created_at=datetime(2026, 7, 13, 10, 30, tzinfo=UTC),
        updated_at=datetime(2026, 7, 13, 10, 30, tzinfo=UTC),
    )
    settings = Settings(
        _env_file=None,
        jwt_secret_key="j" * 32,
        refresh_token_pepper="r" * 32,
        mail_enabled=True,
        smtp_host="smtp.example.com",
        smtp_username="notifications@example.com",
        smtp_password="smtp-secret",
        smtp_from_email="notifications@example.com",
        web_app_url="https://app.example.com",
    )

    message = build_menu_change_email(
        request,
        school_name="Школа Трата",
        recipients=["technologist@example.com"],
        settings=settings,
    )

    assert message["Subject"] == ("Школа «Школа Трата» внесла зміни до денного меню — 13.07.2026")
    assert message["To"] == "technologist@example.com"
    plain_body = message.get_body(preferencelist=("plain",))
    assert plain_body is not None
    assert (
        f"https://app.example.com/admin/menu-changes?requestId={request_id}"
        in plain_body.get_content()
    )


def test_builds_day_close_email_for_assigned_administrator() -> None:
    closed_at = datetime(2026, 7, 13, 15, 0, tzinfo=UTC)
    menu = WeeklyMenu.model_construct(
        id=PydanticObjectId(),
        title="Меню на тиждень",
        school_id=PydanticObjectId(),
        meal_type=MealType.LUNCH,
        days=[
            DailyMenu.model_construct(
                weekday=Weekday.MONDAY,
                date=date(2026, 7, 13),
                items=[],
                closed_at=closed_at,
                close_reason=DayCloseReason.AUTOMATIC,
            )
        ],
    )
    settings = Settings(
        _env_file=None,
        jwt_secret_key="j" * 32,
        refresh_token_pepper="r" * 32,
        mail_enabled=True,
        smtp_host="smtp.example.com",
        smtp_username="notifications@example.com",
        smtp_password="smtp-secret",
        smtp_from_email="notifications@example.com",
    )

    message = build_day_close_email(
        menu,
        weekday=Weekday.MONDAY,
        school_name="Школа Трата",
        recipients=["admin@example.com"],
        settings=settings,
    )

    assert message["Subject"] == "Школа «Школа Трата» закрила день — 13.07.2026"
    assert message["To"] == "admin@example.com"
    assert str(menu.id) in message["Message-ID"]
    plain_body = message.get_body(preferencelist=("plain",))
    assert plain_body is not None
    assert "закрила денне меню" in plain_body.get_content()
