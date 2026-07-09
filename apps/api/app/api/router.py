from fastapi import APIRouter

from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.health.router import router as health_router
from app.modules.imports.router import router as imports_router
from app.modules.menu_requirements.router import router as menu_requirements_router
from app.modules.menus.router import router as menus_router
from app.modules.recipe.router import router as recipe_router
from app.modules.school.router import router as school_router

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
api_router.include_router(
    recipe_router,
    prefix="/recipes",
    tags=["recipes"],
)
api_router.include_router(
    menus_router,
    prefix="/menus",
    tags=["menus"],
)
api_router.include_router(
    menu_requirements_router,
    prefix="/menu-requirements",
    tags=["menu-requirements"],
)
api_router.include_router(
    school_router,
    prefix="/school",
    tags=["school"],
)
