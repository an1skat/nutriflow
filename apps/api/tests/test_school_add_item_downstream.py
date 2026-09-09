from datetime import date as Date
from io import BytesIO

import openpyxl
from beanie import PydanticObjectId
from fastapi.testclient import TestClient

from app.core.config import get_settings


def login(client: TestClient, identifier: str, password: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 204


def csrf_headers(client: TestClient) -> dict[str, str]:
    token = client.cookies.get(get_settings().csrf_cookie_name)
    assert token is not None
    return {"X-CSRF-Token": token}


def create_dish(
    client: TestClient,
    *,
    name: str,
    card_number: str,
    output_grams: str = "200",
    ingredient_name: str | None = None,
) -> tuple[str, str, str]:
    ing_name = ingredient_name or f"Інгредієнт {name}"
    ing_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": ing_name, "unit": "g"},
        headers=csrf_headers(client),
    )
    assert ing_resp.status_code == 201
    ing_id = ing_resp.json()["id"]

    card_resp = client.post(
        "/api/v1/recipes/dish-cards",
        json={"card_number": card_number, "name": name},
        headers=csrf_headers(client),
    )
    assert card_resp.status_code == 201
    card_id = card_resp.json()["id"]

    variant_id = PydanticObjectId()
    version_resp = client.post(
        f"/api/v1/recipes/dish-cards/{card_id}/versions",
        json={
            "portion_variants": [
                {
                    "id": str(variant_id),
                    "age_group": "6-11",
                    "output_grams": output_grams,
                    "nutrition": {"kcal": "100", "proteins": "5", "fats": "2", "carbs": "15"},
                }
            ],
            "ingredient_amounts": [
                {
                    "ingredient_id": ing_id,
                    "ingredient_name_snapshot": ing_name,
                    "gross_amount": "50",
                    "net_amount": "40",
                    "unit": "g",
                    "portion_variant_id": str(variant_id),
                }
            ],
        },
        headers=csrf_headers(client),
    )
    assert version_resp.status_code == 201
    version_id = version_resp.json()["id"]

    confirm_resp = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/confirm",
        headers=csrf_headers(client),
    )
    assert confirm_resp.status_code == 200
    return card_id, str(variant_id), ing_id


def test_school_add_item_downstream_lifecycle(seeded_client, monkeypatch) -> None:
    client, identities = seeded_client

    # =========================================================================
    # SCENARIO A: Template menu with 5 items published to School A and School B
    # =========================================================================
    login(client, identities.admin.username, identities.admin_password)

    # Create 5 dishes for the template
    dishes = []
    for i in range(1, 6):
        card_id, variant_id, ing_id = create_dish(
            client,
            name=f"Страва {i}",
            card_number=f"TK-{i}",
            output_grams=f"{150 + i * 10}",
        )
        dishes.append(
            {"card_id": card_id, "variant_id": variant_id, "ing_id": ing_id, "name": f"Страва {i}"}
        )

    template_items = [
        {
            "position": i + 1,
            "kind": "dish_card",
            "recipe_card_number": f"TK-{i + 1}",
            "dish_card_id": dishes[i]["card_id"],
            "name": dishes[i]["name"],
            "allergen_codes": [],
            "portions": [
                {
                    "age_group": "6-11",
                    "yield_amount": f"{150 + (i + 1) * 10}",
                    "dish_card_portion_variant_id": dishes[i]["variant_id"],
                    "nutrition": {},
                }
            ],
        }
        for i in range(5)
    ]

    create_tmpl_resp = client.post(
        "/api/v1/menus/weekly",
        json={
            "title": "Типове меню 5 страв",
            "meal_type": "lunch",
            "starts_on": "2026-07-06",
            "ends_on": "2026-07-10",
            "days": [
                {
                    "weekday": "monday",
                    "date": "2026-07-06",
                    "items": template_items,
                }
            ],
        },
        headers=csrf_headers(client),
    )
    assert create_tmpl_resp.status_code == 201
    template_id = create_tmpl_resp.json()["id"]

    school_a_id = str(identities.own_school.id)
    school_b_id = str(identities.other_school.id)

    pub_resp = client.post(
        f"/api/v1/menus/weekly/{template_id}/publish",
        json={"school_ids": [school_a_id, school_b_id]},
        headers=csrf_headers(client),
    )
    assert pub_resp.status_code == 200
    created_menu_ids = pub_resp.json()["created_menu_ids"]
    assert len(created_menu_ids) == 2

    menu_a_resp = client.get(f"/api/v1/menus/weekly/{created_menu_ids[0]}")
    menu_b_resp = client.get(f"/api/v1/menus/weekly/{created_menu_ids[1]}")
    assert menu_a_resp.status_code == 200
    assert menu_b_resp.status_code == 200

    menu_a_json = menu_a_resp.json()
    menu_b_json = menu_b_resp.json()
    menu_a = menu_a_json if menu_a_json["school_id"] == school_a_id else menu_b_json
    menu_b = menu_b_json if menu_b_json["school_id"] == school_b_id else menu_a_json

    assert len(menu_a["days"][0]["items"]) == 5
    assert len(menu_b["days"][0]["items"]) == 5
    assert all(item["is_school_added"] is False for item in menu_a["days"][0]["items"])
    assert all(item["is_school_added"] is False for item in menu_b["days"][0]["items"])

    # =========================================================================
    # SCENARIO B: School A adds product "Хліб" as 6th item -> save -> GET
    # =========================================================================
    # Create product ingredient
    bread_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Хліб пшеничний", "unit": "g"},
        headers=csrf_headers(client),
    )
    assert bread_resp.status_code == 201
    bread_id = bread_resp.json()["id"]

    # Login as School A user
    login(client, identities.school_user.username, identities.school_user_password)
    group_a_id = str(identities.own_school.groups[0].id)

    school_a_days = menu_a["days"]
    # Set children count for existing items
    for item in school_a_days[0]["items"]:
        item["servings"] = [
            {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
        ]

    # Add 6th item as product
    school_a_days[0]["items"].append(
        {
            "position": 6,
            "kind": "product",
            "product_ingredient_id": bread_id,
            "name": "Хліб пшеничний",
            "allergen_codes": [],
            "portions": [
                {
                    "age_group": "6-11",
                    "yield_amount": "30",
                    "nutrition": {},
                }
            ],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )

    save_a_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a['id']}",
        json={"days": school_a_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_a_resp.status_code == 200
    menu_a = save_a_resp.json()

    # Verify School A has 6 items, item 6 has is_school_added=True
    assert len(menu_a["days"][0]["items"]) == 6
    bread_item = menu_a["days"][0]["items"][5]
    assert bread_item["position"] == 6
    assert bread_item["name"] == "Хліб пшеничний"
    assert bread_item["is_school_added"] is True
    bread_item_id = bread_item["id"]

    # Verify Template and School B are untouched
    login(client, identities.admin.username, identities.admin_password)
    tmpl_get = client.get(f"/api/v1/menus/weekly/{template_id}").json()
    assert len(tmpl_get["days"][0]["items"]) == 5

    menu_b_get = client.get(f"/api/v1/menus/weekly/{menu_b['id']}").json()
    assert len(menu_b_get["days"][0]["items"]) == 5

    # =========================================================================
    # SCENARIO C: Edit yield on "Хліб" -> save again
    # =========================================================================
    login(client, identities.school_user.username, identities.school_user_password)
    school_a_days = menu_a["days"]
    school_a_days[0]["items"][5]["portions"][0]["yield_amount"] = "40"

    save_yield_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a['id']}",
        json={"days": school_a_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_yield_resp.status_code == 200
    menu_a = save_yield_resp.json()
    assert menu_a["days"][0]["items"][5]["portions"][0]["yield_amount"] == "40"
    assert menu_a["days"][0]["items"][5]["id"] == bread_item_id

    # =========================================================================
    # SCENARIO D: Generate MenuRequirement -> verify dishes, ingredient_rows,
    #             gross/net, servings, portions
    # =========================================================================
    gen_resp = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu_a["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert gen_resp.status_code == 200
    req = gen_resp.json()["items"][0]

    assert len(req["dishes"]) == 6
    req_bread_dish = next(d for d in req["dishes"] if d["name"] == "Хліб пшеничний")
    assert req_bread_dish["kind"] == "product"
    assert req_bread_dish["yield_amount"] == "40"
    assert req_bread_dish["children_count"] == 20

    # Verify ingredient_rows contains Хліб пшеничний
    bread_row = next(r for r in req["ingredient_rows"] if r["ingredient_id"] == bread_id)
    assert bread_row["ingredient_name"] == "Хліб пшеничний"
    assert bread_row["cells"][0]["net_per_person_g"] == "40"
    assert bread_row["cells"][0]["gross_per_person_g"] == "40"
    # 40g * 20 children = 800g
    assert bread_row["issue_total_rounded_g"] == 800
    assert bread_row["gross_issue_total_rounded_g"] == 800

    # =========================================================================
    # SCENARIO E: Verify norm compliance, reports, XLSX export
    # =========================================================================
    # 1. XLSX export
    xlsx_resp = client.get(f"/api/v1/menu-requirements/{req['id']}/export.xlsx")
    assert xlsx_resp.status_code == 200
    workbook = openpyxl.load_workbook(BytesIO(xlsx_resp.content))
    sheet = workbook.active
    assert any("Хліб пшеничний" in str(cell.value) for row in sheet.iter_rows() for cell in row)

    # 2. Daily Report
    report_resp = client.get(
        "/api/v1/menu-requirements/report",
        params={
            "school_id": school_a_id,
            "date_from": "2026-07-06",
            "date_to": "2026-07-06",
            "granularity": "day",
            "meal_type": "lunch",
            "school_group_id": group_a_id,
        },
    )
    assert report_resp.status_code == 200
    report_data = report_resp.json()
    assert len(report_data["groups"]) >= 1
    assert any(
        dish["name"] == "Хліб пшеничний"
        for dish in report_data["groups"][0]["dishes"]
    )

    # =========================================================================
    # SCENARIO F: Day close -> reopen -> GET
    # =========================================================================
    close_resp = client.post(
        f"/api/v1/menus/weekly/{menu_a['id']}/days/monday/close",
        headers=csrf_headers(client),
    )
    assert close_resp.status_code == 200
    closed_menu = close_resp.json()
    assert closed_menu["days"][0]["closed_at"] is not None

    # School user is forbidden from reopening daily menus
    school_reopen_resp = client.post(
        f"/api/v1/menus/weekly/{menu_a['id']}/days/monday/reopen",
        headers=csrf_headers(client),
    )
    assert school_reopen_resp.status_code == 403

    # Admin reopens the day
    monkeypatch.setattr(
        "app.modules.menus.day_closure._today_in_school_timezone",
        lambda: Date(2026, 7, 6),
    )
    login(client, identities.admin.username, identities.admin_password)
    reopen_resp = client.post(
        f"/api/v1/menus/weekly/{menu_a['id']}/days/monday/reopen",
        headers=csrf_headers(client),
    )
    assert reopen_resp.status_code == 200
    reopened_menu = reopen_resp.json()
    assert reopened_menu["days"][0]["closed_at"] is None
    assert len(reopened_menu["days"][0]["items"]) == 6
    assert reopened_menu["days"][0]["items"][5]["id"] == bread_item_id
    menu_a = reopened_menu

    # =========================================================================
    # SCENARIO G: Admin updates template:
    #             - edits an existing dish (Item 1 renamed/changed)
    #             - adds a 6th dish to template -> propagate
    # =========================================================================
    login(client, identities.admin.username, identities.admin_password)

    # Create 6th dish for template
    card_6, variant_6, ing_6 = create_dish(
        client,
        name="Компот з ягід",
        card_number="TK-6",
        output_grams="200",
    )
    # Create replacement dish for Item 1
    card_alt, variant_alt, ing_alt = create_dish(
        client,
        name="Борщ український",
        card_number="TK-ALT",
        output_grams="250",
    )

    tmpl_days = tmpl_get["days"]
    # Update Item 1 dish
    tmpl_days[0]["items"][0]["name"] = "Борщ український"
    tmpl_days[0]["items"][0]["dish_card_id"] = card_alt
    tmpl_days[0]["items"][0]["dish_card_version_id"] = None
    tmpl_days[0]["items"][0]["portions"][0]["yield_amount"] = "250"
    tmpl_days[0]["items"][0]["portions"][0]["dish_card_portion_variant_id"] = variant_alt

    # Add 6th dish to template at position 6
    tmpl_days[0]["items"].append(
        {
            "position": 6,
            "kind": "dish_card",
            "recipe_card_number": "TK-6",
            "dish_card_id": card_6,
            "name": "Компот з ягід",
            "allergen_codes": [],
            "portions": [
                {
                    "age_group": "6-11",
                    "yield_amount": "200",
                    "dish_card_portion_variant_id": variant_6,
                    "nutrition": {},
                }
            ],
        }
    )

    tmpl_update_resp = client.patch(
        f"/api/v1/menus/weekly/{template_id}",
        json={"days": tmpl_days, "revision": tmpl_get["revision"]},
        headers=csrf_headers(client),
    )
    assert tmpl_update_resp.status_code == 200, tmpl_update_resp.json()

    # Verify Template has 6 items
    tmpl_final = client.get(f"/api/v1/menus/weekly/{template_id}").json()
    assert len(tmpl_final["days"][0]["items"]) == 6

    # Verify School B has 6 items (pure template)
    menu_b_final = client.get(f"/api/v1/menus/weekly/{menu_b['id']}").json()
    assert len(menu_b_final["days"][0]["items"]) == 6
    assert menu_b_final["days"][0]["items"][0]["name"] == "Борщ український"
    assert menu_b_final["days"][0]["items"][5]["name"] == "Компот з ягід"
    assert menu_b_final["days"][0]["items"][5]["position"] == 6

    # Verify School A has 7 items:
    # 6 template items (with Item 1 updated to Borscht and Item 6 Kompot) +
    # the school-added "Хліб" preserved and shifted to position 7!
    menu_a_final = client.get(f"/api/v1/menus/weekly/{menu_a['id']}").json()
    assert len(menu_a_final["days"][0]["items"]) == 7

    assert menu_a_final["days"][0]["items"][0]["name"] == "Борщ український"
    assert menu_a_final["days"][0]["items"][0]["portions"][0]["yield_amount"] == "250"

    template_dish_6 = next(
        i for i in menu_a_final["days"][0]["items"] if i["name"] == "Компот з ягід"
    )
    assert template_dish_6["is_school_added"] is False

    school_bread = next(
        i for i in menu_a_final["days"][0]["items"] if i["name"] == "Хліб пшеничний"
    )
    assert school_bread["id"] == bread_item_id
    assert school_bread["is_school_added"] is True
    assert school_bread["position"] == 7
    assert school_bread["portions"][0]["yield_amount"] == "40"
    assert school_bread["servings"][0]["children_count"] == 20

    # Ensure all 7 positions are strictly unique and sequential 1..7
    positions = [i["position"] for i in menu_a_final["days"][0]["items"]]
    assert positions == [1, 2, 3, 4, 5, 6, 7]

    # =========================================================================
    # SCENARIO H: Historical MenuRequirement snapshot consistency & dish_card addition
    # =========================================================================
    login(client, identities.school_user.username, identities.school_user_password)

    # Old requirement preserved its historical 6-dish snapshot
    req_check = client.get(f"/api/v1/menu-requirements/{req['id']}").json()
    assert len(req_check["dishes"]) == 6

    # Report detects that Monday's requirement is stale due to menu update
    report_stale = client.get(
        "/api/v1/menu-requirements/report",
        params={
            "school_id": school_a_id,
            "date_from": "2026-07-06",
            "date_to": "2026-07-06",
            "granularity": "day",
            "meal_type": "lunch",
            "school_group_id": group_a_id,
        },
    ).json()
    assert "2026-07-06" in report_stale.get("stale_dates", [])

    # Set children count for all 7 items in School A (including newly propagated Kompot)
    school_a_days = menu_a_final["days"]
    for item in school_a_days[0]["items"]:
        item["servings"] = [
            {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
        ]
    save_7_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a['id']}",
        json={"days": school_a_days, "revision": menu_a_final["revision"]},
        headers=csrf_headers(client),
    )
    assert save_7_resp.status_code == 200
    menu_a_final = save_7_resp.json()

    # Regenerate requirement - now recalculates with all 7 dishes
    regen_resp = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu_a["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert regen_resp.status_code == 200
    new_req = regen_resp.json()["items"][0]
    assert len(new_req["dishes"]) == 7
    assert new_req["revision"] > req["revision"]
    assert new_req["source_day_hash"] != req["source_day_hash"]

    # Repeat verification for dish_card as school-added item (8th item)
    # Admin creates dish card in recipe catalog
    login(client, identities.admin.username, identities.admin_password)
    card_school_dish, variant_school_dish, _ = create_dish(
        client,
        name="Салат з капусти",
        card_number="TK-SCH-1",
        output_grams="100",
    )
    # School user adds the dish card to School A menu
    login(client, identities.school_user.username, identities.school_user_password)
    school_a_days = menu_a_final["days"]
    school_a_days[0]["items"].append(
        {
            "position": 8,
            "kind": "dish_card",
            "recipe_card_number": "TK-SCH-1",
            "dish_card_id": card_school_dish,
            "name": "Салат з капусти",
            "allergen_codes": [],
            "portions": [
                {
                    "age_group": "6-11",
                    "yield_amount": "100",
                    "dish_card_portion_variant_id": variant_school_dish,
                    "nutrition": {},
                }
            ],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )

    save_dish_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a['id']}",
        json={"days": school_a_days, "revision": menu_a_final["revision"]},
        headers=csrf_headers(client),
    )
    assert save_dish_resp.status_code == 200
    menu_a_8 = save_dish_resp.json()
    assert len(menu_a_8["days"][0]["items"]) == 8
    assert menu_a_8["days"][0]["items"][7]["name"] == "Салат з капусти"
    assert menu_a_8["days"][0]["items"][7]["is_school_added"] is True

    # Regenerate requirement with 8 items
    regen_8_resp = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu_a["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert regen_8_resp.status_code == 200
    assert len(regen_8_resp.json()["items"][0]["dishes"]) == 8
