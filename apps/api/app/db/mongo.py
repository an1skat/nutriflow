from typing import Any

from pymongo import AsyncMongoClient

from app.core.config import get_settings

_client: AsyncMongoClient[dict[str, Any]] | None = None


async def connect_mongo() -> None:
    global _client

    settings = get_settings()
    _client = AsyncMongoClient(settings.mongo_uri, tz_aware=True)

    await _client.admin.command("ping")


def get_mongo_client() -> AsyncMongoClient[dict[str, Any]]:
    if _client is None:
        raise RuntimeError("MongoDB client is not initialized")

    return _client


def get_database():
    settings = get_settings()
    return get_mongo_client()[settings.mongo_db]


async def close_mongo() -> None:
    global _client

    if _client is not None:
        await _client.close()
        _client = None
