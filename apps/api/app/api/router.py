from fastapi import APIRouter

from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.health.router import router as health_router
from app.modules.imports.router import router as imports_router

api_router = APIRouter()

api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(imports_router, prefix="/imports", tags=["imports"])
api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["auth"],
)
api_router.include_router(
    admin_router,
    prefix="/admin",
    tags=["admin"],
)
