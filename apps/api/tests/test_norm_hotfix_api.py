from copy import deepcopy
from decimal import Decimal

import pytest
from bson import json_util
from pymongo import MongoClient
from test_menu_import import build_menu_workbook, workbook_bytes
from test_menus_api import csrf_headers, login

from app.core.config import get_settings
from app.scripts.repair_norm_requirements import apply_entry, main


def test_composite_import_commit_publish_copy_requirement_and_report(
    seeded_client, tmp_path, monkeypatch
):
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    workbook = build_menu_workbook()
    workbook.active.delete_rows(6)  # Only the real composite PRODUCT row.
    response = client.post(
        "/api/v1/menus/weekly/import-preview?meal_type=lunch",
        files={
            "file": (
                "menu.xlsx",
                workbook_bytes(workbook),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers=csrf_headers(client),
    )
    assert response.status_code == 202, response.text
    preview = response.json()
    assert preview["commit_ready"]
    components = preview["menu"]["days"][0]["items"][0]["portions"][0]["normative_contributions"]
    assert [(c["group_code"], Decimal(c["amount"])) for c in components] == [
        ("bread", 30),
        ("dairy", 15),
    ]
    assert components[1]["product_variant"] == "hard_cheese"
    response = client.post(
        "/api/v1/menus/weekly/import-commit",
        json={"preview_id": preview["preview_id"]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    template = response.json()["menu"]
    assert template["days"][0]["items"][0]["portions"][0]["normative_contributions"] == components
    response = client.post(
        f"/api/v1/menus/weekly/{template['id']}/publish",
        json={"school_ids": [str(identities.own_school.id)]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    menu_id = response.json()["created_menu_ids"][0]
    login(client, identities.school_user.username, identities.school_user_password)
    menu = client.get(f"/api/v1/menus/weekly/{menu_id}").json()
    assert menu["days"][0]["items"][0]["portions"][0]["normative_contributions"] == components
    # Two school groups deliberately create two distinct requirements.
    menu["days"][0]["items"][0]["servings"] = [
        {"school_group_id": str(group.id), "age_group": group.age_group.value, "children_count": 10}
        for group in identities.own_school.groups[:2]
    ]
    response = client.patch(
        f"/api/v1/menus/weekly/{menu_id}",
        json={"days": menu["days"], "revision": menu["revision"]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    response = client.post(
        "/api/v1/menu-requirements/generate",
        json={"weekly_menu_id": menu_id, "weekday": "monday", "service_date": "2026-09-14"},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    requirements = response.json()["items"]
    assert len(requirements) == 2
    assert len({r["id"] for r in requirements}) == 2
    for req in requirements:
        assert [
            (c["group_code"], Decimal(c["amount"]))
            for c in req["dishes"][0]["normative_contributions"]
        ] == [("bread", 30), ("dairy", 15)]
    login(client, identities.admin.username, identities.admin_password)
    params = {
        "school_id": str(identities.own_school.id),
        "date_from": "2026-09-14",
        "date_to": "2026-09-18",
    }
    response = client.get("/api/v1/norm-compliance/report", params=params)
    assert response.status_code == 200, response.text
    for group in response.json()["groups"]:
        section = group["sections"][0]
        assert section["unmapped_items"] == []
        amounts = {r["normative_group_code"]: Decimal(r["actual_amount"]) for r in section["rows"]}
        assert amounts["bread"] == 30
        assert amounts["dairy"] == 1

    # Regression: repair old persisted records, then read through the real API.
    settings = get_settings()
    with MongoClient(settings.mongo_uri, tz_aware=True) as mongo:
        collection = mongo[settings.mongo_db].menu_requirements
        for before in collection.find({}):
            collection.update_one(
                {"_id": before["_id"]}, {"$set": {"dishes.0.normative_contributions": []}}
            )
        originals = list(collection.find({}).sort("_id", 1))
        plan_path = tmp_path / "repair-plan.json"
        monkeypatch.setattr(
            "sys.argv",
            [
                "repair_norm_requirements",
                "--school-id",
                str(identities.own_school.id),
                "--date-from",
                "2026-09-14",
                "--date-to",
                "2026-09-18",
                "--plan",
                str(plan_path),
            ],
        )
        main()
        assert list(collection.find({}).sort("_id", 1)) == originals
        plan = json_util.loads(
            plan_path.read_text(), json_options=json_util.JSONOptions(tz_aware=True)
        )
        assert len(plan["entries"]) == 2
        for entry, before in zip(plan["entries"], originals, strict=True):
            assert entry["before"] == before
        monkeypatch.setattr(
            "sys.argv", ["repair_norm_requirements", "--apply-plan", str(plan_path)]
        )
        main()
        main()  # Safe retry of the same reviewed plan.
        for entry in plan["entries"]:
            before = entry["before"]
            stored = collection.find_one({"_id": before["_id"]})
            assert stored["revision"] == before["revision"] + 1
            assert stored["source_day_hash"] == before["source_day_hash"]
            assert stored["ingredient_rows"] == before["ingredient_rows"]
        stale = deepcopy(entry)
        collection.update_one({"_id": before["_id"]}, {"$inc": {"revision": 1}})
        with pytest.raises(RuntimeError, match="Concurrent change"):
            apply_entry(collection, stale)
    response = client.get("/api/v1/norm-compliance/report", params=params)
    assert response.status_code == 200
    assert all(
        not section["unmapped_items"]
        for group in response.json()["groups"]
        for section in group["sections"]
    )
