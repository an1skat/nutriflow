from pydantic import BaseModel


class ImportPreviewResponse(BaseModel):
    filename: str
    status: str
    message: str
