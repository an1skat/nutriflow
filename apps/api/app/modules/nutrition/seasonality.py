"""Select recipe alternatives before producing rows or contribution snapshots."""

import re
from collections import defaultdict
from collections.abc import Callable
from datetime import date

from app.modules.nutrition.domain import normalize_lookup_text

# Both the grouping and the date check must consume exactly the same suffix.
_SEASON = re.compile(
    r"\s+(?P<direction>до|з)\s+(?P<day>\d{1,2})\s*\.\s*(?P<month>\d{1,2})(?:\s*\.)?"
    r"(?:\s+по\s+(?P<end_day>\d{1,2})(?:\s*[-–—/]\s*(?P<last_day>\d{1,2}))?"
    r"\s*\.\s*(?P<end_month>\d{1,2})(?:\s*\.)?)?"
)


def _is_in_ingredient_season(name: str, service_date: date) -> bool:
    norm = normalize_lookup_text(name)
    match = _SEASON.search(norm)
    if match is None:
        return False
    current = (service_date.month, service_date.day)
    start = (int(match["month"]), int(match["day"]))
    if match["end_month"] is not None:
        end = (int(match["end_month"]), int(match["last_day"] or match["end_day"]))
        return start <= current <= end if start <= end else current >= start or current <= end
    # Single-date annual boundary: root crops before/from 1 January (e.g. "до 1.01", "з 1.01").
    # Autumn harvest runs until 1 January; stored root crops run from 1 January until next autumn.
    if start == (1, 1):
        return current >= (9, 1) if match["direction"] == "до" else current < (9, 1)
    if match["direction"] == "до":
        if "молода" in norm or "молодий" in norm:
            return (6, 1) <= current < start
        return current < start
    return current >= start


def select_seasonal_items[T](
    items: list[T], service_date: date, *, name: Callable[[T], str]
) -> list[T]:
    grouped: dict[str, list[T]] = defaultdict(list)
    for item in items:
        norm = normalize_lookup_text(name(item))
        key = _SEASON.sub("", norm)
        key = key.replace("ґрунтові", "").replace("грунтові", "").replace("теплично-парникові", "")
        key = (
            key.replace("молода", "")
            .replace("молодий", "")
            .replace("свіжа", "")
            .replace("свіжий", "")
            .replace("свіжі", "")
            .replace("столова", "")
            .replace("столовий", "")
        )
        grouped[" ".join(key.split())].append(item)

    selected: list[T] = []
    for candidates in grouped.values():
        dated = [item for item in candidates if _SEASON.search(normalize_lookup_text(name(item)))]
        if dated:
            # Specific bounded ranges and targeted "до" deadlines win over
            # generic open-ended "з 01.03".
            dated.sort(
                key=lambda item: (
                    0
                    if _SEASON.search(normalize_lookup_text(name(item)))["end_month"] is not None
                    else 1
                    if _SEASON.search(normalize_lookup_text(name(item)))["direction"] == "до"
                    else 2
                )
            )
            matched = next(
                (item for item in dated if _is_in_ingredient_season(name(item), service_date)), None
            )
            if matched is not None:
                selected.append(matched)
            else:
                selected.extend(candidates)
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
