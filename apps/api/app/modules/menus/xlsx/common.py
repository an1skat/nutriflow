import re
from io import BytesIO
from typing import Any

from app.modules.identity.models import AgeGroup
from app.modules.menus.models import Weekday


class XlsxMenuError(ValueError):
    """The XLSX workbook cannot be parsed or generated safely."""


AGE_GROUPS_BY_BLOCK = [
    AgeGroup.SIX_TO_ELEVEN,
    AgeGroup.ELEVEN_TO_FOURTEEN,
    AgeGroup.FOURTEEN_TO_EIGHTEEN,
]

VISIBLE_MAX_COLUMN = 18
HEADER_GROUP_ROW = 1
HEADER_SUBHEADER_ROW = 2
WEEK_TITLE_ROW = 3
FIRST_CONTENT_ROW = 5
SCHEMA_VERSION = 1
META_SHEET_NAME = "_meta"
TEMPLATE_SHEET_TITLES = [
    "І тиждень",
    "ІІ тиждень",
    "ІІІ тиждень",
    "ІV тиждень",
]

BASE_HEADERS = [
    "Збірник рецептур, № розкладки",
    "Алергени",
    "Найменування страв",
]
AGE_GROUP_HEADERS = [
    "Енергетична цінність для дітей 6-11 р.",
    "Енергетична цінність для дітей 11-14 р.",
    "Енергетична цінність для дітей 14-18 р.",
]
PORTION_SUBHEADERS = [
    "Вихід, г",
    "Енерго-цінність, ккал",
    "Білки, г",
    "Жири, г",
    "Вуглеводи, г",
]
OFFICIAL_PORTION_BLOCK_STARTS = [4, 9, 14]
DAY_TOTAL_LABEL = "Всього"

DAY_LABELS = {
    Weekday.MONDAY: "Понеділок",
    Weekday.TUESDAY: "Вівторок",
    Weekday.WEDNESDAY: "Середа",
    Weekday.THURSDAY: "Четвер",
    Weekday.FRIDAY: "П'ятниця",
    Weekday.SATURDAY: "Субота",
    Weekday.SUNDAY: "Неділя",
}


def school_weekdays() -> list[Weekday]:
    return [
        Weekday.MONDAY,
        Weekday.TUESDAY,
        Weekday.WEDNESDAY,
        Weekday.THURSDAY,
        Weekday.FRIDAY,
    ]


def normalize_text(value: Any) -> str:
    text = cell_text(value).lower().replace("’", "'").replace("`", "'")
    return re.sub(r"\s+", " ", text)


def cell_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def save_workbook(workbook) -> bytes:
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def import_openpyxl():
    try:
        import openpyxl
    except ModuleNotFoundError as exc:
        raise XlsxMenuError("openpyxl is required for menu workbooks") from exc
    return openpyxl
