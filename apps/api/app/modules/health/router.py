from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.db.mongo import get_mongo_client

router = APIRouter()
AppSettings = Annotated[Settings, Depends(get_settings)]


@router.get("")
async def health_check():
    return {"status": "ok"}


@router.get("/db")
async def database_health_check(settings: AppSettings):
    if not settings.database_health_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    client = get_mongo_client()
    await client.admin.command("ping")

    return {
        "status": "ok",
        "database": "mongodb",
    }
