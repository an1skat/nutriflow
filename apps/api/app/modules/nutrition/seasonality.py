"""Select recipe alternatives before producing rows or contribution snapshots."""

import re
from collections import defaultdict
from collections.abc import Callable
from datetime import date

from app.modules.nutrition.domain import normalize_lookup_text

# Both the grouping and the date check must consume exactly the same suffix.
_SEASON = re.compile(
    r"\s+(?P<direction>до|з)\s+(?P<day>\d{2})\s*\.\s*(?P<month>\d{2})(?:\s*\.)?"
    r"(?:\s+по\s+(?P<end_day>\d{2})(?:\s*[-–—/]\s*(?P<last_day>\d{2}))?"
    r"\s*\.\s*(?P<end_month>\d{2})(?:\s*\.)?)?"
)


def _is_in_ingredient_season(name: str, service_date: date) -> bool:
    match = _SEASON.search(normalize_lookup_text(name))
    if match is None:
        return False
    current = (service_date.month, service_date.day)
    start = (int(match["month"]), int(match["day"]))
    if match["end_month"] is not None:
        end = (int(match["end_month"]), int(match["last_day"] or match["end_day"]))
        return start <= current <= end if start <= end else current >= start or current <= end
    return current < start if match["direction"] == "до" else current >= start


def select_seasonal_items[T](
    items: list[T], service_date: date, *, name: Callable[[T], str]
) -> list[T]:
    grouped: dict[str, list[T]] = defaultdict(list)
    for item in items:
        key = _SEASON.sub("", normalize_lookup_text(name(item)))
        key = key.replace("ґрунтові", "").replace("грунтові", "").replace("теплично-парникові", "")
        grouped[" ".join(key.split())].append(item)

    selected: list[T] = []
    for candidates in grouped.values():
        dated = [item for item in candidates if _SEASON.search(normalize_lookup_text(name(item)))]
        if dated:
            # A bounded range wins over an overlapping open-ended "з 01.03".
            dated.sort(
                key=lambda item: (
                    _SEASON.search(normalize_lookup_text(name(item)))["end_month"] is None
                )
            )
            matched = next(
                (item for item in dated if _is_in_ingredient_season(name(item), service_date)), None
            )
            if matched is not None:
                selected.append(matched)
        elif len(candidates) > 1 and any(
            "грунтові" in name(item).lower() or "ґрунтові" in name(item).lower()
            for item in candidates
        ):
            matched = next(
                (
                    item
                    for item in candidates
                    if ("грунтові" in name(item).lower() or "ґрунтові" in name(item).lower())
                    == (5 <= service_date.month <= 9)
                ),
                None,
            )
            if matched is not None:
                selected.append(matched)
        else:
            selected.extend(candidates)
    return selected
