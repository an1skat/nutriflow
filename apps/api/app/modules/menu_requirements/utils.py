import hashlib
import json
from datetime import date as Date
from datetime import timedelta

from beanie import PydanticObjectId

from app.modules.identity.models import SchoolGroup
from app.modules.menu_requirements.errors import MenuRequirementValidationError
from app.modules.menus.models import DailyMenu, Weekday, WeeklyMenu
from app.modules.recipe.models import normalize_lookup_text


def resolve_service_date(menu: WeeklyMenu, day: DailyMenu, requested_date: Date) -> Date:
    if day.date is not None:
        return day.date
    if menu.starts_on is not None:
        return menu.starts_on + timedelta(days=list(Weekday).index(day.weekday))
    return requested_date


def hash_daily_menu(day: DailyMenu) -> str:
    day_data = day.model_dump(mode="json")
    day_data.pop("closed_at", None)
    day_data.pop("closed_by", None)
    day_data.pop("close_reason", None)
    day_data.pop("close_notification_pending", None)
    day_data.pop("close_notification_sent_at", None)
    day_data.pop("dev_reopened_at", None)
    canonical = json.dumps(
        day_data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def ingredient_key(ingredient_id: PydanticObjectId | None, name: str) -> str:
    if ingredient_id is not None:
        return f"ingredient:{ingredient_id}"
    return f"snapshot:{normalize_lookup_text(name)}"


def select_eligible_groups(
    day: DailyMenu,
    groups_by_id: dict[PydanticObjectId, SchoolGroup],
) -> list[SchoolGroup]:
    eligible_ids: set[PydanticObjectId] = set()
    for item in day.items:
        for serving in item.servings:
            if serving.children_count <= 0:
                continue
            group = groups_by_id.get(serving.school_group_id)
            if group is None:
                raise MenuRequirementValidationError("School group not found")
            eligible_ids.add(group.id)
    return [group for group in groups_by_id.values() if group.id in eligible_ids]
