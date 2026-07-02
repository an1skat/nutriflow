from fastapi import APIRouter

from app.db.mongo import get_mongo_client

router = APIRouter()


@router.get("")
async def health_check():
    return {"status": "ok"}


@router.get("/db")
async def database_health_check():
    client = get_mongo_client()
    await client.admin.command("ping")

    return {
        "status": "ok",
        "database": "mongodb",
    }
