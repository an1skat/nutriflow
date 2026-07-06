import argparse
import asyncio
from datetime import UTC, datetime

from app.db.beanie import init_odm
from app.db.mongo import close_mongo, connect_mongo
from app.modules.identity.models import User, UserRole


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Promote an existing administrator to NutriFlow owner"
    )
    parser.add_argument(
        "--username",
        required=True,
        help="Existing administrator username",
    )
    return parser.parse_args()


async def run(username: str) -> None:
    await connect_mongo()

    try:
        await init_odm()

        user = await User.find_one(User.username == username.strip().lower())

        if user is None:
            raise SystemExit("User not found")
        if user.role == UserRole.SCHOOL_USER:
            raise SystemExit("School user cannot be promoted to owner")
        if user.email is None:
            raise SystemExit("Owner account must have email")

        user.role = UserRole.OWNER
        user.school_id = None
        user.permissions = []
        user.auth_version += 1
        user.updated_at = datetime.now(UTC)
        await user.save()

        print(f"Promoted owner: {user.username}")
    finally:
        await close_mongo()


def main() -> None:
    args = parse_args()
    asyncio.run(run(args.username))


if __name__ == "__main__":
    main()
