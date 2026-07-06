import argparse
import asyncio
import getpass

from pydantic import ValidationError

from app.db.beanie import init_odm
from app.db.mongo import close_mongo, connect_mongo
from app.modules.auth.service import (
    FirstAdminAlreadyExistsError,
    create_first_admin,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the first NutriFlow owner")
    parser.add_argument(
        "--username",
        required=True,
        help="Administrator username",
    )
    parser.add_argument(
        "--email",
        required=True,
        help="Administrator email",
    )
    return parser.parse_args()


async def run(
    username: str,
    email: str,
    password: str,
) -> None:
    await connect_mongo()

    try:
        await init_odm()

        admin = await create_first_admin(
            username=username,
            email=email,
            password=password,
        )

        print(f"Created owner: {admin.username}")
    finally:
        await close_mongo()


def main() -> None:
    args = parse_args()

    password = getpass.getpass("Password (minimum 12 characters): ")
    confirmation = getpass.getpass("Confirm password: ")

    if password != confirmation:
        raise SystemExit("Passwords do not match")

    try:
        asyncio.run(
            run(
                username=args.username,
                email=args.email,
                password=password,
            )
        )
    except (
        FirstAdminAlreadyExistsError,
        ValidationError,
    ) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
