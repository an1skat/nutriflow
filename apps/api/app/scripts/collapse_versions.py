"""Collapse each dish card to a single confirmed version numbered v1.

Removes all archived/preview/draft versions left over from the import+repair
runs, keeps only the current confirmed version, and renumbers it to version 1
so future edits start cleanly from v2. `dish_card.current_version_id` already
points at the surviving version; this script only deletes siblings and patches
the version number.

One-shot cleanup script (not committed).
"""

from __future__ import annotations

import asyncio
import sys

from app.db.beanie import init_odm
from app.db.mongo import close_mongo, connect_mongo
from app.modules.recipe.models import DishCard, DishCardVersion


async def collapse_card(dish_card: DishCard) -> dict:
    if dish_card.current_version_id is None:
        return {"card": dish_card.card_number, "status": "no-current"}

    current = await DishCardVersion.get(dish_card.current_version_id)
    if current is None:
        return {"card": dish_card.card_number, "status": "current-missing"}

    siblings = await DishCardVersion.find(DishCardVersion.dish_card_id == dish_card.id).to_list()
    deleted = 0
    for sibling in siblings:
        if sibling.id == current.id:
            continue
        await sibling.delete()
        deleted += 1

    # Renumber the survivor to version 1.
    if current.version != 1:
        current.version = 1
        await current.save()

    return {"card": dish_card.card_number, "status": "collapsed", "deleted": deleted}


async def main_async() -> int:
    await connect_mongo()
    try:
        await init_odm()
        cards = await DishCard.find_all().sort("card_number").to_list()
        total_deleted = 0
        for dish_card in cards:
            result = await collapse_card(dish_card)
            icon = {"collapsed": "✓", "no-current": "?", "current-missing": "!"}.get(
                result["status"], "!"
            )
            deleted = result.get("deleted", 0)
            total_deleted += deleted
            print(
                f"  {icon} {dish_card.card_number:>8} -> {result['status']} (deleted {deleted})",
                file=sys.stderr,
            )
        before = await DishCardVersion.count()
        print(
            f"\nDeleted {total_deleted} stale versions; {before} versions remain.", file=sys.stderr
        )
        return 0
    finally:
        await close_mongo()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_async()))
