import asyncio
import logging

from app.db.beanie import init_odm
from app.db.mongo import close_mongo, connect_mongo
from app.modules.menus.day_closure import close_all_due_weekly_menu_days
from app.modules.menus.notifications import send_pending_day_close_notifications

logger = logging.getLogger(__name__)


async def run() -> None:
    try:
        await connect_mongo()
        await init_odm()
        closed_days, failed_menus = await close_all_due_weekly_menu_days()
        sent_emails, failed_emails = await send_pending_day_close_notifications()
        logger.info(
            "Day closure finished: closed=%d, close_failures=%d, emails_sent=%d, email_failures=%d",
            closed_days,
            failed_menus,
            sent_emails,
            failed_emails,
        )
        if failed_menus or failed_emails:
            raise RuntimeError("Day closure finished with failures")
    finally:
        await close_mongo()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())


if __name__ == "__main__":
    main()
