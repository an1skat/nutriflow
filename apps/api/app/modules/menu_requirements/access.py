from beanie import PydanticObjectId

from app.modules.identity.models import School, User, UserRole
from app.modules.menu_requirements.errors import MenuRequirementAccessDeniedError


async def allowed_school_ids(current_user: User) -> list[PydanticObjectId] | None:
    if current_user.role == UserRole.SCHOOL_USER:
        if current_user.school_id is None:
            raise MenuRequirementAccessDeniedError("School access denied")
        return [current_user.school_id]
    if current_user.role == UserRole.ADMIN:
        schools = await School.find(School.admin_owner_id == current_user.id).to_list()
        return [school.id for school in schools]
    if current_user.role in {UserRole.OWNER, UserRole.TECHNOLOGIST}:
        return None
    raise MenuRequirementAccessDeniedError("Menu requirement access denied")


async def can_access_school(current_user: User, school_id: PydanticObjectId) -> bool:
    school_ids = await allowed_school_ids(current_user)
    return school_ids is None or school_id in school_ids
