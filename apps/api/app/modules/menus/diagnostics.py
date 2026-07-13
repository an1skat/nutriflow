from openpyxl.utils import get_column_letter

from app.modules.menus.models import (
    MenuImportDiagnostic,
    MenuImportDiagnosticLevel,
)


def build_import_diagnostic(
    *,
    level: MenuImportDiagnosticLevel,
    code: str,
    message: str,
    sheet_name: str,
    row_number: int | None = None,
    column_number: int | None = None,
) -> MenuImportDiagnostic:
    column_letter = get_column_letter(column_number) if column_number is not None else None
    cell = (
        f"{column_letter}{row_number}"
        if column_letter is not None and row_number is not None
        else None
    )
    return MenuImportDiagnostic(
        level=level,
        code=code,
        message=message,
        sheet_name=sheet_name,
        row_number=row_number,
        column_letter=column_letter,
        cell=cell,
    )
