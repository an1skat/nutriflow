from io import BytesIO

import openpyxl
import pytest

from app.modules.menus.models import MealType, MenuImportDiagnosticLevel, MenuItemKind, Weekday
from app.modules.menus.reference_resolver import card_number_candidates
from app.modules.menus.service import parse_weekly_menu_workbook, preview_weekly_menu_workbook

pytestmark = pytest.mark.no_clean_database


def build_menu_workbook() -> openpyxl.Workbook:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "І тиждень"

    sheet["A1"] = "Збірник рецептур, № розкладки"
    sheet["B1"] = "Алергени"
    sheet["C1"] = "Найменування страв"
    sheet["D1"] = "Енергетична цінність для дітей\n6-11 р."
    sheet["I1"] = "Енергетична цінність для дітей 11-14 р."
    sheet["N1"] = "Енергетична цінність для дітей\n14-18 р."
    sheet["D2"] = "Вихід, г"
    sheet["I2"] = "Вихід, г"
    sheet["N2"] = "Вихід, г"
    sheet["C3"] = "1-й тиждень"
    sheet["C5"] = "Понеділок"

    sheet["A6"] = "ТК № 1.54"
    sheet["B6"] = "ГЦ"
    sheet["C6"] = "Салат з пекінської капусти"
    sheet["D6"] = 100
    sheet["E6"] = 46
    sheet["F6"] = 1.29
    sheet["G6"] = 1.27
    sheet["H6"] = 7.02
    sheet["I6"] = 120
    sheet["J6"] = 55
    sheet["K6"] = 1.54
    sheet["L6"] = 1.52
    sheet["M6"] = 8.42
    sheet["N6"] = 120
    sheet["O6"] = 55
    sheet["P6"] = 1.54
    sheet["Q6"] = 1.52
    sheet["R6"] = 8.42

    sheet["A7"] = "пром. вироб."
    sheet["B7"] = "ЗП,Г"
    sheet["C7"] = "Хліб цільнозерновий з тв.сиром"
    sheet["D7"] = "30/15"
    sheet["E7"] = 123.28
    sheet["F7"] = 5.75
    sheet["G7"] = 5.75
    sheet["H7"] = 10.3
    sheet["I7"] = "30/15"
    sheet["J7"] = 123.28
    sheet["K7"] = 5.75
    sheet["L7"] = 5.75
    sheet["M7"] = 10.3
    sheet["N7"] = "30/15"
    sheet["O7"] = 123.28
    sheet["P7"] = 5.75
    sheet["Q7"] = 5.75
    sheet["R7"] = 10.3
    sheet["A8"] = "Всього"

    return workbook


def workbook_bytes(workbook: openpyxl.Workbook) -> bytes:
    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def test_weekly_menu_parser_reads_sheet_day_items_and_product_rows() -> None:
    workbook = build_menu_workbook()

    menu, sheet_name = parse_weekly_menu_workbook(
        workbook_bytes(workbook),
        filename="menu.xlsx",
        meal_type=MealType.LUNCH,
    )

    assert sheet_name == "І тиждень"
    assert menu.cycle_week == 1
    assert menu.meal_type == MealType.LUNCH
    assert menu.days[0].weekday == Weekday.MONDAY
    assert len(menu.days[0].items) == 2

    dish = menu.days[0].items[0]
    assert dish.kind == MenuItemKind.DISH_CARD
    assert dish.recipe_card_number == "1.54"
    assert dish.allergen_codes == ["ГЦ"]
    assert dish.portions[0].yield_amount == "100"
    assert dish.portions[0].nutrition.kcal == 46

    product = menu.days[0].items[1]
    assert product.kind == MenuItemKind.PRODUCT
    assert product.recipe_card_number is None
    assert product.product_name_snapshot == "Хліб цільнозерновий з тв.сиром"
    assert product.allergen_codes == ["Г", "ЗП"]
    assert product.portions[0].yield_amount == "30/15"


def test_weekly_menu_preview_reports_exact_invalid_cell() -> None:
    workbook = build_menu_workbook()
    sheet = workbook.active
    sheet["E6"] = "oops"

    preview = preview_weekly_menu_workbook(
        workbook_bytes(workbook),
        filename="menu.xlsx",
        meal_type=MealType.LUNCH,
    )

    assert preview.available_sheet_names == ["І тиждень"]
    assert preview.selected_sheet_name == "І тиждень"
    assert preview.commit_ready is False
    assert preview.menu is not None
    assert len(preview.diagnostics) == 1

    diagnostic = preview.diagnostics[0]
    assert diagnostic.level == MenuImportDiagnosticLevel.ERROR
    assert diagnostic.code == "invalid_numeric_value"
    assert diagnostic.sheet_name == "І тиждень"
    assert diagnostic.row_number == 6
    assert diagnostic.column_letter == "E"
    assert diagnostic.cell == "E6"


def test_card_number_candidates_accepts_final_separator_variant() -> None:
    assert card_number_candidates("2.11.1") == ["2.11.1", "2.11_1"]
    assert card_number_candidates("2.11_1") == ["2.11_1", "2.11.1"]
