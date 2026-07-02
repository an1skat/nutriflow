from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "NutriFlow API"
    environment: str = "local"
    debug: bool = True

    api_v1_prefix: str = "/api/v1"

    mongo_uri: str = Field(default="mongodb://localhost:27017")
    mongo_db: str = "nutriflow_dev"

    jwt_secret_key: SecretStr = Field(min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "nutriflow-api"
    jwt_audience: str = "nutriflow-web"
    access_token_ttl_minutes: int = Field(default=15, ge=5, le=60)

    refresh_token_pepper: SecretStr = Field(min_length=32)
    refresh_token_ttl_days: int = Field(default=30, ge=1, le=90)
    refresh_reuse_grace_seconds: int = Field(default=5, ge=0, le=30)
    csrf_cookie_name: str = "nutriflow_csrf"

    auth_cookie_secure: bool = False
    auth_cookie_samesite: Literal["lax", "strict"] = "lax"
    access_cookie_name: str = "nutriflow_access"
    refresh_cookie_name: str = "nutriflow_refresh"

    backend_cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
