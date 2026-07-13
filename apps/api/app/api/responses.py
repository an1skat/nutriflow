import re
from collections.abc import Iterator
from urllib.parse import quote

from fastapi.responses import StreamingResponse
from pydantic import BaseModel

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class PaginatedResponse[ResponseItem](BaseModel):
    items: list[ResponseItem]
    total: int
    offset: int
    limit: int


def xlsx_response(filename: str, content: bytes) -> StreamingResponse:
    return attachment_response(
        filename,
        content,
        media_type=XLSX_MEDIA_TYPE,
        fallback_filename="export.xlsx",
    )


def attachment_response(
    filename: str,
    content: bytes,
    *,
    media_type: str,
    fallback_filename: str,
) -> StreamingResponse:
    safe_fallback = _ascii_filename(filename) or fallback_filename
    encoded_filename = quote(filename)
    return StreamingResponse(
        content=_single_chunk(content),
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f"attachment; filename={safe_fallback}; filename*=UTF-8''{encoded_filename}"
            )
        },
    )


def _single_chunk(content: bytes) -> Iterator[bytes]:
    yield content


def _ascii_filename(filename: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip("-.")
