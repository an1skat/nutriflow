import asyncio
import logging
import smtplib
import ssl
from datetime import UTC, datetime
from email.message import EmailMessage
from html import escape
from zoneinfo import ZoneInfo

from beanie import PydanticObjectId

from app.core.config import Settings, get_settings
from app.modules.identity.models import School, User, UserRole
from app.modules.menu_requirements.utils import resolve_service_date
from app.modules.menus.models import (
    DayCloseReason,
    MenuChangeRequest,
    Weekday,
    WeeklyMenu,
)

logger = logging.getLogger(__name__)


async def send_menu_change_request_notification(request_id: PydanticObjectId) -> None:
    settings = get_settings()
    if not settings.mail_enabled:
        return

    try:
        request = await MenuChangeRequest.get(request_id)
        if request is None:
            logger.warning("Menu change email skipped: request %s was not found", request_id)
            return

        school = await School.get(request.school_id)
        technologists = await User.find(
            {
                "role": UserRole.TECHNOLOGIST.value,
                "is_active": True,
                "email": {"$type": "string"},
            }
        ).to_list()
        recipients = sorted({str(user.email) for user in technologists if user.email is not None})
        if not recipients:
            logger.info("Menu change email skipped: no active technologist recipients")
            return

        message = build_menu_change_email(
            request,
            school_name=school.name if school is not None else "Невідома школа",
            recipients=recipients,
            settings=settings,
        )
        await asyncio.to_thread(_send_message, message, recipients, settings)
    except Exception:
        logger.exception("Failed to send menu change notification for request %s", request_id)


async def send_pending_day_close_notifications() -> tuple[int, int]:
    settings = get_settings()
    if not settings.mail_enabled:
        return 0, 0

    menus = await WeeklyMenu.find(
        {"days": {"$elemMatch": {"close_notification_pending": True}}}
    ).to_list()
    sent = 0
    failed = 0
    for menu in menus:
        for day in menu.days:
            if not day.close_notification_pending:
                continue
            if await _send_day_close_notification(menu, day.weekday, settings):
                sent += 1
            else:
                failed += 1
    return sent, failed


async def _send_day_close_notification(
    menu: WeeklyMenu,
    weekday: Weekday,
    settings: Settings,
) -> bool:
    day = next((candidate for candidate in menu.days if candidate.weekday == weekday), None)
    if (
        menu.id is None
        or menu.school_id is None
        or day is None
        or day.closed_at is None
        or day.close_reason is None
    ):
        logger.error("Invalid pending day-close notification for menu %s, %s", menu.id, weekday)
        return False

    school = await School.get(menu.school_id)
    if school is None:
        logger.error("Day-close email skipped: school %s was not found", menu.school_id)
        return False
    recipients = await _day_close_recipients(school)
    if not recipients:
        logger.error("Day-close email skipped: school %s has no active administrator", school.id)
        return False

    message = build_day_close_email(
        menu,
        weekday=weekday,
        school_name=school.name,
        recipients=recipients,
        settings=settings,
    )
    try:
        await asyncio.to_thread(_send_message, message, recipients, settings)
    except Exception:
        logger.exception("Failed to send day-close notification for menu %s, %s", menu.id, weekday)
        return False

    sent_at = datetime.now(UTC)
    result = await WeeklyMenu.get_pymongo_collection().update_one(
        {
            "_id": menu.id,
            "days": {
                "$elemMatch": {
                    "weekday": weekday.value,
                    "close_notification_pending": True,
                    "closed_at": day.closed_at,
                }
            },
        },
        {
            "$set": {
                "days.$.close_notification_pending": False,
                "days.$.close_notification_sent_at": sent_at,
            }
        },
    )
    return result.modified_count == 1


async def _day_close_recipients(school: School) -> list[str]:
    if school.admin_owner_id is not None:
        administrator = await User.get(school.admin_owner_id)
        if (
            administrator is not None
            and administrator.is_active
            and administrator.email is not None
        ):
            return [str(administrator.email)]

    owners = await User.find(
        {
            "role": UserRole.OWNER.value,
            "is_active": True,
            "email": {"$type": "string"},
        }
    ).to_list()
    return sorted({str(owner.email) for owner in owners if owner.email is not None})


def build_day_close_email(
    menu: WeeklyMenu,
    *,
    weekday: Weekday,
    school_name: str,
    recipients: list[str],
    settings: Settings,
) -> EmailMessage:
    if menu.id is None or settings.smtp_from_email is None:
        raise RuntimeError("Persisted menu and sender email are required")

    day = next((candidate for candidate in menu.days if candidate.weekday == weekday), None)
    if day is None or day.closed_at is None or day.close_reason is None:
        raise RuntimeError("Closed daily menu is required")

    closed_date = day.closed_at.astimezone(ZoneInfo("Europe/Kyiv")).date()
    service_date = resolve_service_date(menu, day, closed_date)
    date_label = service_date.strftime("%d.%m.%Y")
    reason_label = (
        "автоматично"
        if day.close_reason == DayCloseReason.AUTOMATIC
        else "користувачем школи"
    )
    subject = f"Школа «{school_name}» закрила день — {date_label}"
    text = f"Школа «{school_name}» закрила денне меню за {date_label} {reason_label}."
    safe_school_name = escape(school_name)
    safe_date_label = escape(date_label)
    safe_reason_label = escape(reason_label)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = str(settings.smtp_from_email)
    message["To"] = ", ".join(recipients)
    sender_domain = str(settings.smtp_from_email).rsplit("@", maxsplit=1)[-1]
    message["Message-ID"] = (
        f"<day-close-{menu.id}-{weekday.value}-{int(day.closed_at.timestamp())}@{sender_domain}>"
    )
    message.set_content(text)
    message.add_alternative(
        f"""
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
          <h2 style="margin:0 0 12px;color:#166534">День закрито</h2>
          <p>Школа <strong>«{safe_school_name}»</strong> закрила денне меню
             за <strong>{safe_date_label}</strong> {safe_reason_label}.</p>
        </div>
        """,
        subtype="html",
    )
    return message


def build_menu_change_email(
    request: MenuChangeRequest,
    *,
    school_name: str,
    recipients: list[str],
    settings: Settings,
) -> EmailMessage:
    if request.id is None or settings.smtp_from_email is None:
        raise RuntimeError("Persisted request and sender email are required")

    date_label = _changed_dates_label(request)
    details_url = f"{settings.web_app_url.rstrip('/')}/admin/menu-changes?requestId={request.id}"
    subject = f"Школа «{school_name}» внесла зміни до денного меню — {date_label}"
    text = (
        f"Школа «{school_name}» внесла зміни до денного меню за {date_label}.\n\n"
        f"Натисніть, щоб переглянути зміни:\n{details_url}"
    )
    safe_school_name = escape(school_name)
    safe_date_label = escape(date_label)
    safe_details_url = escape(details_url, quote=True)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = str(settings.smtp_from_email)
    message["To"] = ", ".join(recipients)
    message.set_content(text)
    message.add_alternative(
        f"""
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
          <h2 style="margin:0 0 12px;color:#166534">Зміни денного меню</h2>
          <p>Школа <strong>«{safe_school_name}»</strong> внесла зміни до денного меню
             за <strong>{safe_date_label}</strong>.</p>
          <p style="margin:24px 0">
            <a href="{safe_details_url}"
               style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;
                      padding:11px 18px;font-weight:700">
              Переглянути зміни
            </a>
          </p>
          <p style="font-size:12px;color:#64748b">Для перегляду потрібно увійти в NutriFlow.</p>
        </div>
        """,
        subtype="html",
    )
    return message


def _changed_dates_label(request: MenuChangeRequest) -> str:
    changed_weekdays = {change.weekday for change in request.changes}
    dates = sorted(
        day.date for day in request.days_snapshot if day.weekday in changed_weekdays and day.date
    )
    if dates:
        return ", ".join(date.strftime("%d.%m.%Y") for date in dates)
    if request.starts_on is not None:
        return request.starts_on.strftime("%d.%m.%Y")
    return request.created_at.strftime("%d.%m.%Y")


def _send_message(message: EmailMessage, recipients: list[str], settings: Settings) -> None:
    if (
        settings.smtp_host is None
        or settings.smtp_username is None
        or settings.smtp_password is None
    ):
        raise RuntimeError("SMTP settings are incomplete")

    smtp_class = smtplib.SMTP_SSL if settings.smtp_security == "ssl" else smtplib.SMTP
    with smtp_class(settings.smtp_host, settings.smtp_port, timeout=15) as client:
        if settings.smtp_security == "starttls":
            client.starttls(context=ssl.create_default_context())
        client.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        client.send_message(message, to_addrs=recipients)
