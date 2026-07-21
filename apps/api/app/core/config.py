from functools import lru_cache
from typing import Literal

from pydantic import EmailStr, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "NutriFlow API"
    environment: str = "local"
    debug: bool = False

    api_v1_prefix: str = "/api/v1"
    docs_enabled: bool = False
    redoc_enabled: bool = False
    openapi_enabled: bool = False
    database_health_enabled: bool = False

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

    auth_cookie_secure: bool = True
    auth_cookie_samesite: Literal["lax", "strict"] = "lax"
    access_cookie_name: str = "nutriflow_access"
    refresh_cookie_name: str = "nutriflow_refresh"

    backend_cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    mail_enabled: bool = False
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65_535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_security: Literal["plain", "starttls", "ssl"] = "starttls"
    smtp_from_email: EmailStr | None = None
    web_app_url: str = "http://localhost:3000"

    trusted_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    max_request_body_bytes: int = Field(default=2 * 1024 * 1024, ge=1024)
    request_timeout_seconds: float = Field(default=15.0, ge=0.1, le=120.0)
    security_headers_enabled: bool = True
    hsts_max_age_seconds: int = Field(default=31536000, ge=0)

    rate_limit_enabled: bool = True
    rate_limit_requests: int = Field(default=600, ge=1)
    rate_limit_window_seconds: int = Field(default=60, ge=1)

    auth_rate_limit_enabled: bool = True
    auth_login_ip_requests: int = Field(default=10, ge=1)
    auth_login_subnet_requests: int = Field(default=80, ge=1)
    auth_login_window_seconds: int = Field(default=60, ge=1)
    auth_login_failure_limit: int = Field(default=5, ge=1)
    auth_login_failure_lock_seconds: int = Field(default=15 * 60, ge=1)
    auth_refresh_ip_requests: int = Field(default=30, ge=1)
    auth_refresh_subnet_requests: int = Field(default=180, ge=1)
    auth_refresh_window_seconds: int = Field(default=60, ge=1)
    auth_refresh_failure_limit: int = Field(default=10, ge=1)
    auth_refresh_failure_lock_seconds: int = Field(default=15 * 60, ge=1)

    menu_import_max_file_bytes: int = Field(default=5 * 1024 * 1024, ge=1024)
    menu_import_max_sheet_count: int = Field(default=12, ge=1, le=100)
    menu_import_max_rows_per_sheet: int = Field(default=1000, ge=10, le=20_000)
    menu_import_preview_ttl_minutes: int = Field(default=30, ge=1, le=24 * 60)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("trusted_hosts", "backend_cors_origins")
    @classmethod
    def reject_empty_string_values(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]

        if not cleaned:
            raise ValueError("must contain at least one value")

        return cleaned

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.mail_enabled:
            missing = [
                name
                for name, value in {
                    "SMTP_HOST": self.smtp_host,
                    "SMTP_USERNAME": self.smtp_username,
                    "SMTP_PASSWORD": self.smtp_password,
                    "SMTP_FROM_EMAIL": self.smtp_from_email,
                }.items()
                if value is None
            ]
            if missing:
                raise ValueError(f"Mail is enabled but settings are missing: {', '.join(missing)}")

        if self.environment.lower() in {"prod", "production"}:
            if self.debug:
                raise ValueError("DEBUG must be false in production")
            if not self.auth_cookie_secure:
                raise ValueError("AUTH_COOKIE_SECURE must be true in production")
            if self.docs_enabled or self.redoc_enabled or self.openapi_enabled:
                raise ValueError("API documentation must be disabled in production")
            if self.database_health_enabled:
                raise ValueError("DATABASE_HEALTH_ENABLED must be false in production")
            if "*" in self.trusted_hosts:
                raise ValueError("TRUSTED_HOSTS must not contain '*' in production")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
