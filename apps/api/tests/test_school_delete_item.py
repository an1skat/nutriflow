from copy import deepcopy

from fastapi.testclient import TestClient

from tests.conftest import SeededIdentities
from tests.test_school_add_item_downstream import create_dish, csrf_headers, login


def _setup_template_and_schools(
    client: TestClient,
    identities: SeededIdentities,
) -> tuple[str, str, str, list[str]]:
    login(client, identities.admin.username, identities.admin_password)

    template_items = []
    template_card_ids = []
    for pos in range(1, 6):
        card_id, variant_id, _ = create_dish(
            client,
            name=f"Страва {pos}",
            card_number=f"TK-DEL-{pos}",
            output_grams="150",
        )
        template_card_ids.append(card_id)
        template_items.append(
            {
                "position": pos,
                "kind": "dish_card",
                "recipe_card_number": f"TK-DEL-{pos}",
                "dish_card_id": card_id,
                "name": f"Страва {pos}",
                "allergen_codes": [],
                "portions": [
                    {
                        "age_group": "6-11",
                        "yield_amount": "150",
                        "dish_card_portion_variant_id": variant_id,
                        "nutrition": {},
                    }
                ],
            }
        )

    create_tmpl_resp = client.post(
        "/api/v1/menus/weekly",
        json={
            "title": "Типове меню для тесту видалення",
            "meal_type": "lunch",
            "starts_on": "2026-07-06",
            "ends_on": "2026-07-10",
            "days": [{"weekday": "monday", "date": "2026-07-06", "items": template_items}],
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

    menu_a_resp = client.get(f"/api/v1/menus/weekly/{created_menu_ids[0]}")
    menu_b_resp = client.get(f"/api/v1/menus/weekly/{created_menu_ids[1]}")
    menu_a_json = menu_a_resp.json()
    menu_b_json = menu_b_resp.json()
    menu_a_id = menu_a_json["id"] if menu_a_json["school_id"] == school_a_id else menu_b_json["id"]
    menu_b_id = menu_b_json["id"] if menu_b_json["school_id"] == school_b_id else menu_a_json["id"]

    return template_id, menu_a_id, menu_b_id, template_card_ids


def test_persisted_school_added_item_can_be_deleted(seeded_client):
    client, identities = seeded_client
    template_id, menu_a_id, menu_b_id, _ = _setup_template_and_schools(client, identities)

    # 1. School A adds "Хліб" (6th item)
    bread_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Хліб пшеничний", "unit": "g"},
        headers=csrf_headers(client),
    )
    assert bread_resp.status_code == 201
    bread_id = bread_resp.json()["id"]

    login(client, identities.school_user.username, identities.school_user_password)
    group_a_id = str(identities.own_school.groups[0].id)

    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()
    orig_template_item_ids = [item["id"] for item in menu_a["days"][0]["items"]]
    assert len(orig_template_item_ids) == 5

    school_a_days = deepcopy(menu_a["days"])
    school_a_days[0]["items"].append(
        {
            "position": 6,
            "kind": "product",
            "product_ingredient_id": bread_id,
            "name": "Хліб пшеничний",
            "portions": [{"age_group": "6-11", "yield_amount": "30"}],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )

    save_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": school_a_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_resp.status_code == 200
    menu_a = save_resp.json()
    assert len(menu_a["days"][0]["items"]) == 6
    bread_item_id = menu_a["days"][0]["items"][5]["id"]

    # 2. Reload School A
    reload_resp = client.get(f"/api/v1/menus/weekly/{menu_a_id}")
    assert reload_resp.status_code == 200
    menu_a_reloaded = reload_resp.json()
    assert len(menu_a_reloaded["days"][0]["items"]) == 6

    # 3. School A deletes persisted "Хліб" -> save
    school_a_delete_days = deepcopy(menu_a_reloaded["days"])
    deleted_item = school_a_delete_days[0]["items"].pop()
    assert deleted_item["id"] == bread_item_id
    assert len(school_a_delete_days[0]["items"]) == 5

    delete_save_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": school_a_delete_days, "revision": menu_a_reloaded["revision"]},
        headers=csrf_headers(client),
    )
    assert delete_save_resp.status_code == 200

    # 4. GET and verify counts and IDs
    menu_a_final = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()
    assert len(menu_a_final["days"][0]["items"]) == 5
    final_template_item_ids = [item["id"] for item in menu_a_final["days"][0]["items"]]
    assert final_template_item_ids == orig_template_item_ids

    # Verify Template = 5
    login(client, identities.admin.username, identities.admin_password)
    tmpl_final = client.get(f"/api/v1/menus/weekly/{template_id}").json()
    assert len(tmpl_final["days"][0]["items"]) == 5

    # Verify School B = 5
    menu_b_final = client.get(f"/api/v1/menus/weekly/{menu_b_id}").json()
    assert len(menu_b_final["days"][0]["items"]) == 5


def test_template_item_cannot_be_deleted(seeded_client):
    client, identities = seeded_client
    _, menu_a_id, _, _ = _setup_template_and_schools(client, identities)

    login(client, identities.school_user.username, identities.school_user_password)
    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()
    orig_revision = menu_a["revision"]

    # Try removing template item 0
    malicious_days = deepcopy(menu_a["days"])
    malicious_days[0]["items"].pop(0)

    reject_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": malicious_days, "revision": orig_revision},
        headers=csrf_headers(client),
    )
    assert reject_resp.status_code == 400
    assert (
        reject_resp.json()["detail"]
        == "School users cannot remove, replace, or reorder existing dishes"
    )

    # Verify menu is completely unchanged
    menu_after = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()
    assert len(menu_after["days"][0]["items"]) == 5
    assert menu_after["revision"] == orig_revision


def test_cannot_forge_deletion_permission(seeded_client):
    client, identities = seeded_client
    _, menu_a_id, _, _ = _setup_template_and_schools(client, identities)

    login(client, identities.school_user.username, identities.school_user_password)
    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()

    # Attempt to forge is_school_added=True on template item, then delete it
    malicious_days = deepcopy(menu_a["days"])
    malicious_days[0]["items"][0]["is_school_added"] = True

    # Save attempt with is_school_added=True (server will ignore client value)
    patch_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": malicious_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert patch_resp.status_code == 200
    menu_a = patch_resp.json()
    # Confirm server kept is_school_added as False
    assert menu_a["days"][0]["items"][0]["is_school_added"] is False

    # Now attempt to delete this template item
    del_days = deepcopy(menu_a["days"])
    del_days[0]["items"].pop(0)

    del_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": del_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert del_resp.status_code == 400
    assert (
        del_resp.json()["detail"]
        == "School users cannot remove, replace, or reorder existing dishes"
    )


def test_delete_one_of_multiple_local_items_resequences_positions(seeded_client):
    client, identities = seeded_client
    _, menu_a_id, _, _ = _setup_template_and_schools(client, identities)

    # Create bread and apple products
    bread_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Хліб пшеничний", "unit": "g"},
        headers=csrf_headers(client),
    )
    apple_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Яблуко свіже", "unit": "g"},
        headers=csrf_headers(client),
    )
    bread_id = bread_resp.json()["id"]
    apple_id = apple_resp.json()["id"]

    login(client, identities.school_user.username, identities.school_user_password)
    group_a_id = str(identities.own_school.groups[0].id)

    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()
    orig_template_ids = [item["id"] for item in menu_a["days"][0]["items"]]

    # Add bread (pos 6) and apple (pos 7)
    days_with_2 = deepcopy(menu_a["days"])
    days_with_2[0]["items"].append(
        {
            "position": 6,
            "kind": "product",
            "product_ingredient_id": bread_id,
            "name": "Хліб пшеничний",
            "portions": [{"age_group": "6-11", "yield_amount": "30"}],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )
    days_with_2[0]["items"].append(
        {
            "position": 7,
            "kind": "product",
            "product_ingredient_id": apple_id,
            "name": "Яблуко свіже",
            "portions": [{"age_group": "6-11", "yield_amount": "100"}],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )

    save_2_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": days_with_2, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_2_resp.status_code == 200
    menu_a = save_2_resp.json()
    assert len(menu_a["days"][0]["items"]) == 7
    assert menu_a["days"][0]["items"][5]["id"] is not None
    apple_persisted_id = menu_a["days"][0]["items"][6]["id"]

    # Delete bread (item at index 5)
    days_del_bread = deepcopy(menu_a["days"])
    days_del_bread[0]["items"].pop(5)
    assert len(days_del_bread[0]["items"]) == 6
    # Apple is now at index 5 in the list
    assert days_del_bread[0]["items"][5]["id"] == apple_persisted_id

    save_del_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": days_del_bread, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_del_resp.status_code == 200
    menu_a_after = save_del_resp.json()

    # Verify apple remains, apple ID is preserved, position is 6
    assert len(menu_a_after["days"][0]["items"]) == 6
    apple_item = menu_a_after["days"][0]["items"][5]
    assert apple_item["id"] == apple_persisted_id
    assert apple_item["name"] == "Яблуко свіже"
    assert apple_item["position"] == 6

    # Verify positions are contiguous 1..6
    positions = [item["position"] for item in menu_a_after["days"][0]["items"]]
    assert positions == [1, 2, 3, 4, 5, 6]

    # Verify template items are unchanged
    template_ids_after = [item["id"] for item in menu_a_after["days"][0]["items"][:5]]
    assert template_ids_after == orig_template_ids


def test_menu_change_request_records_item_removed(seeded_client):
    client, identities = seeded_client
    _, menu_a_id, _, _ = _setup_template_and_schools(client, identities)

    bread_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Хліб пшеничний", "unit": "g"},
        headers=csrf_headers(client),
    )
    bread_id = bread_resp.json()["id"]

    login(client, identities.school_user.username, identities.school_user_password)
    group_a_id = str(identities.own_school.groups[0].id)

    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()

    # Add bread
    days_with_bread = deepcopy(menu_a["days"])
    days_with_bread[0]["items"].append(
        {
            "position": 6,
            "kind": "product",
            "product_ingredient_id": bread_id,
            "name": "Хліб пшеничний",
            "portions": [{"age_group": "6-11", "yield_amount": "30"}],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )
    save_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": days_with_bread, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_resp.status_code == 200
    menu_a = save_resp.json()
    bread_item_id = menu_a["days"][0]["items"][5]["id"]

    # Delete bread
    days_without_bread = deepcopy(menu_a["days"])
    days_without_bread[0]["items"].pop(5)

    delete_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": days_without_bread, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert delete_resp.status_code == 200

    # Admin checks change requests
    login(client, identities.admin.username, identities.admin_password)
    cr_list_resp = client.get("/api/v1/menus/change-requests")
    assert cr_list_resp.status_code == 200
    cr_items = cr_list_resp.json()["items"]
    assert len(cr_items) >= 2

    # The latest change request must have item_removed
    latest_cr = cr_items[0]
    removed_changes = [c for c in latest_cr["changes"] if c["field"] == "item_removed"]
    assert len(removed_changes) == 1
    rem_change = removed_changes[0]
    assert rem_change["weekday"] == "monday"
    assert rem_change["item_id"] == bread_item_id
    assert rem_change["position"] == 6
    assert rem_change["before_value"] == "Хліб пшеничний"
    assert rem_change["after_value"] is None


def test_legacy_menu_change_requests_deserialize(seeded_client):
    client, identities = seeded_client
    _, menu_a_id, _, _ = _setup_template_and_schools(client, identities)

    login(client, identities.school_user.username, identities.school_user_password)
    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()

    # Modify portion yield on existing template item (standard change)
    school_days = deepcopy(menu_a["days"])
    school_days[0]["items"][0]["portions"][0]["yield_amount"] = "200"

    save_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": school_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_resp.status_code == 200

    login(client, identities.admin.username, identities.admin_password)
    cr_list_resp = client.get("/api/v1/menus/change-requests")
    assert cr_list_resp.status_code == 200
    for item in cr_list_resp.json()["items"]:
        assert item["id"] is not None
        assert len(item["changes"]) >= 1


def test_requirement_stale_and_regenerate_after_removal(seeded_client):
    client, identities = seeded_client
    _, menu_a_id, _, _ = _setup_template_and_schools(client, identities)

    bread_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Хліб пшеничний", "unit": "g"},
        headers=csrf_headers(client),
    )
    bread_id = bread_resp.json()["id"]

    login(client, identities.school_user.username, identities.school_user_password)
    group_a_id = str(identities.own_school.groups[0].id)

    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()
    school_a_days = deepcopy(menu_a["days"])
    # Set servings for template items
    for item in school_a_days[0]["items"]:
        item["servings"] = [
            {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
        ]
    # Add bread
    school_a_days[0]["items"].append(
        {
            "position": 6,
            "kind": "product",
            "product_ingredient_id": bread_id,
            "name": "Хліб пшеничний",
            "portions": [{"age_group": "6-11", "yield_amount": "30"}],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )
    save_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": school_a_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_resp.status_code == 200
    menu_a = save_resp.json()

    # 1. Generate requirement with 6 items
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
    req_6 = gen_resp.json()["items"][0]
    assert len(req_6["dishes"]) == 6
    hash_6 = req_6["source_day_hash"]

    # 2. Delete bread
    school_a_del_days = deepcopy(menu_a["days"])
    school_a_del_days[0]["items"].pop(5)
    save_del_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": school_a_del_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_del_resp.status_code == 200
    menu_a_after = save_del_resp.json()
    assert len(menu_a_after["days"][0]["items"]) == 5

    # 3. Re-generate requirement
    regen_resp = client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu_a_after["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )
    assert regen_resp.status_code == 200
    req_5 = regen_resp.json()["items"][0]
    # Must have 5 dishes and no bread
    assert len(req_5["dishes"]) == 5
    dish_names = [d["name"] for d in req_5["dishes"]]
    assert "Хліб пшеничний" not in dish_names
    assert req_5["source_day_hash"] != hash_6


def test_closed_day_blocks_item_removal(seeded_client):
    client, identities = seeded_client
    _, menu_a_id, _, _ = _setup_template_and_schools(client, identities)

    bread_resp = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Хліб пшеничний", "unit": "g"},
        headers=csrf_headers(client),
    )
    bread_id = bread_resp.json()["id"]

    login(client, identities.school_user.username, identities.school_user_password)
    group_a_id = str(identities.own_school.groups[0].id)

    menu_a = client.get(f"/api/v1/menus/weekly/{menu_a_id}").json()
    school_a_days = deepcopy(menu_a["days"])
    for item in school_a_days[0]["items"]:
        item["servings"] = [
            {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
        ]
    school_a_days[0]["items"].append(
        {
            "position": 6,
            "kind": "product",
            "product_ingredient_id": bread_id,
            "name": "Хліб пшеничний",
            "portions": [{"age_group": "6-11", "yield_amount": "30"}],
            "servings": [
                {"school_group_id": group_a_id, "age_group": "6-11", "children_count": 20}
            ],
        }
    )
    save_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": school_a_days, "revision": menu_a["revision"]},
        headers=csrf_headers(client),
    )
    assert save_resp.status_code == 200
    menu_a = save_resp.json()

    # Generate requirement
    client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu_a["id"],
            "weekday": "monday",
            "service_date": "2026-07-06",
        },
        headers=csrf_headers(client),
    )

    # Close day
    close_resp = client.post(
        f"/api/v1/menus/weekly/{menu_a_id}/days/monday/close",
        json={"service_date": "2026-07-06"},
        headers=csrf_headers(client),
    )
    assert close_resp.status_code == 200
    menu_closed = close_resp.json()
    assert menu_closed["days"][0]["closed_at"] is not None

    # Attempt to delete bread from closed day
    del_days = deepcopy(menu_closed["days"])
    del_days[0]["items"].pop(5)

    del_closed_resp = client.patch(
        f"/api/v1/menus/weekly/{menu_a_id}",
        json={"days": del_days, "revision": menu_closed["revision"]},
        headers=csrf_headers(client),
    )
    assert del_closed_resp.status_code == 400
    assert del_closed_resp.json()["detail"] == "Closed daily menus cannot be changed"
