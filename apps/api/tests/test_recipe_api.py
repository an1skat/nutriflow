from decimal import Decimal

import pytest
from beanie import PydanticObjectId
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.modules.recipe.models import (
    DishCard,
    DishCardVersion,
    DishCardVersionStatus,
    IngredientAmount,
    PortionVariant,
)


def login(client: TestClient, identifier: str, password: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 204


def csrf_headers(client: TestClient) -> dict[str, str]:
    csrf_token = client.cookies.get(get_settings().csrf_cookie_name)
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token}


def portion_payload(output_grams: str, variant_id: PydanticObjectId) -> dict:
    return {
        "id": str(variant_id),
        "portion_grams": output_grams,
        "output_grams": output_grams,
        "nutrition": {
            "kcal": "82.8",
            "proteins": "1.18",
            "fats": "4.27",
            "carbs": "11.03",
        },
    }


def amount_payload(
    *,
    name: str,
    gross: str,
    net: str,
    variant_id: PydanticObjectId,
    group_key: str | None = None,
    alternative_label: str | None = None,
) -> dict:
    payload = {
        "ingredient_name_snapshot": name,
        "gross_amount": gross,
        "net_amount": net,
        "unit": "g",
        "portion_variant_id": str(variant_id),
    }
    if group_key is not None:
        payload["group_key"] = group_key
    if alternative_label is not None:
        payload["alternative_label"] = alternative_label
    return payload


@pytest.fixture
def admin_client(seeded_client) -> tuple[TestClient, object]:
    client, identities = seeded_client
    login(client, identities.admin.username, identities.admin_password)
    return client, identities


@pytest.fixture
def school_client(seeded_client) -> tuple[TestClient, object]:
    client, identities = seeded_client
    login(client, identities.school_user.username, identities.school_user_password)
    return client, identities


def test_dish_card_version_round_trips_decimal_through_api(admin_client):
    """Regression: Decimal128 stored by Mongo must come back as Decimal on read.

    Creates a dish card + confirmed version through the API (the flow the admin
    upload form will use), then re-reads it and asserts exact decimal precision
    on the wire (string, not float) and in the parsed response.
    """
    client, _ = admin_client
    variant_id, version_id = _prepare_simple_confirmed_card(
        client, number="98.01", gross=Decimal("106.08"), net=Decimal("84")
    )

    response = client.get(f"/api/v1/recipes/dish-card-versions/{version_id}")
    assert response.status_code == 200
    version = response.json()

    assert version["status"] == DishCardVersionStatus.CONFIRMED.value
    variant = version["portion_variants"][0]
    # Decimal serialized as string on the wire, precision intact (no float).
    assert variant["portion_grams"] == "120"
    assert variant["nutrition"]["kcal"] == "82.8"
    assert variant["nutrition"]["proteins"] == "1.18"

    amount = version["ingredient_amounts"][0]
    assert amount["gross_amount"] == "106.08"
    assert amount["net_amount"] == "84"
    assert amount["portion_variant_id"] == str(variant_id)


def test_dish_card_version_defaults_missing_nutrition_to_zero(admin_client):
    client, _ = admin_client
    variant_id = PydanticObjectId()
    dish_card_id = _create_dish_card(client, number="98.02")

    response = client.post(
        f"/api/v1/recipes/dish-cards/{dish_card_id}/versions",
        json={
            "portion_variants": [
                {
                    "id": str(variant_id),
                    "portion_grams": "120",
                    "output_grams": "120",
                }
            ],
            "ingredient_amounts": [
                amount_payload(
                    name="Морква",
                    gross="35",
                    net="30",
                    variant_id=variant_id,
                )
            ],
        },
        headers=csrf_headers(client),
    )

    assert response.status_code == 201
    nutrition = response.json()["portion_variants"][0]["nutrition"]
    assert nutrition == {
        "kcal": "0",
        "proteins": "0",
        "fats": "0",
        "carbs": "0",
    }


def test_calculate_ingredients_keeps_decimal_precision_and_scales_by_servings(admin_client):
    client, _ = admin_client
    variant_id, version_id = _prepare_simple_confirmed_card(
        client, number="99.01", gross=Decimal("103.2")
    )

    response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/calculate",
        json={"portion_variant_id": str(variant_id), "servings_count": 10},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["servings_count"] == 10
    assert len(data["items"]) == 1
    line = data["items"][0]
    # Decimal arithmetic, not float: 103.2 * 10 == 1032.0, serialized as string.
    assert line["gross_per_portion"] == "103.2"
    assert line["gross_total"] == "1032.0"
    assert line["net_per_portion"] == "84"
    assert line["net_total"] == "840"


def test_gross_and_net_are_calculated_separately(admin_client):
    client, _ = admin_client
    variant_id, version_id = _prepare_simple_confirmed_card(
        client, number="99.06", gross=Decimal("50"), net=Decimal("20")
    )

    response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/calculate",
        json={"portion_variant_id": str(variant_id), "servings_count": 3},
    )

    assert response.status_code == 200
    line = response.json()["items"][0]
    assert line["gross_total"] == "150"
    assert line["net_total"] == "60"
    assert line["gross_total"] != line["net_total"]


def test_calculation_includes_all_alternative_group_options(admin_client):
    client, _ = admin_client
    variant_id, version_id = _prepare_alternative_group_card(client)

    response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/calculate",
        json={"portion_variant_id": str(variant_id), "servings_count": 10},
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 2
    assert [item["ingredient_name_snapshot"] for item in items] == [
        "Морква свіжа до 01.01",
        "Морква свіжа з 01.01",
    ]
    assert [item["gross_total"] for item in items] == ["1032.0", "1060.80"]


def test_unknown_selected_alternatives_field_is_ignored(admin_client):
    client, _ = admin_client
    variant_id, version_id = _prepare_alternative_group_card(client)

    response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/calculate",
        json={
            "portion_variant_id": str(variant_id),
            "servings_count": 10,
            "selected_alternatives": {"carrot-season": "after-jan"},
        },
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 2
    assert [item["ingredient_name_snapshot"] for item in items] == [
        "Морква свіжа до 01.01",
        "Морква свіжа з 01.01",
    ]
    assert [item["gross_total"] for item in items] == ["1032.0", "1060.80"]


def test_confirmed_version_cannot_be_edited(admin_client):
    client, _ = admin_client
    _variant_id, version_id = _prepare_simple_confirmed_card(
        client, number="99.07", gross=Decimal("10")
    )

    response = client.patch(
        f"/api/v1/recipes/dish-card-versions/{version_id}",
        json={"technology_text": "Updated technology"},
        headers=csrf_headers(client),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Confirmed or archived version cannot be changed"


def test_preview_with_warnings_does_not_auto_confirm(admin_client):
    client, _ = admin_client
    variant_id = PydanticObjectId()
    version_id = _create_preview(
        client,
        number="99.02",
        recognized_warnings=["Gross for sauce was '-' in the source PDF."],
        variant_id=variant_id,
        amounts=[amount_payload(name="Соус", gross="7", net="7", variant_id=variant_id)],
    )

    fetched = client.get(f"/api/v1/recipes/dish-card-versions/{version_id}").json()
    # Warnings alone never flip the status; it stays import_preview until explicit confirm.
    assert fetched["status"] == DishCardVersionStatus.IMPORT_PREVIEW.value
    assert fetched["recognized_warnings"]

    validation = client.get(f"/api/v1/recipes/dish-card-versions/{version_id}/validation").json()
    assert validation["can_confirm"] is True
    assert validation["warnings"]
    assert not validation["blocking_errors"]


def test_preview_with_blocking_errors_cannot_be_confirmed(admin_client):
    client, _ = admin_client
    version_id = _create_preview(
        client,
        number="99.03",
        recognition_errors=["Could not reliably read the ingredient table."],
        variant_id=PydanticObjectId(),
        amounts=[],
        portions=False,
    )

    validation = client.get(f"/api/v1/recipes/dish-card-versions/{version_id}/validation").json()
    assert validation["can_confirm"] is False
    assert validation["blocking_errors"]

    confirm_response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/confirm",
        headers=csrf_headers(client),
    )
    assert confirm_response.status_code == 400
    assert confirm_response.json()["detail"] == "Dish card version has blocking validation errors"


def test_confirm_sets_current_version_and_makes_immutable(admin_client):
    client, _ = admin_client
    variant_id = PydanticObjectId()
    dish_card_id = _create_dish_card(client, number="99.04")
    version_id = _create_version(
        client,
        dish_card_id=dish_card_id,
        variant_id=variant_id,
        amounts=[amount_payload(name="Морква", gross="100", net="80", variant_id=variant_id)],
    )

    confirm_response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/confirm",
        headers=csrf_headers(client),
    )
    assert confirm_response.status_code == 200
    assert confirm_response.json()["status"] == DishCardVersionStatus.CONFIRMED.value

    card = client.get(f"/api/v1/recipes/dish-cards/{dish_card_id}").json()
    assert card["current_version_id"] == version_id

    # Now immutable.
    edit_response = client.patch(
        f"/api/v1/recipes/dish-card-versions/{version_id}",
        json={"technology_text": "Too late"},
        headers=csrf_headers(client),
    )
    assert edit_response.status_code == 403


def test_admin_endpoints_require_authentication(seeded_client):
    client, _ = seeded_client
    # No login -> every recipe endpoint must reject.
    assert client.get("/api/v1/recipes/ingredients").status_code == 401
    assert client.get("/api/v1/recipes/allergens").status_code == 401
    assert client.get("/api/v1/recipes/dish-cards").status_code == 401


def test_admin_endpoints_require_csrf_token(admin_client):
    client, _ = admin_client
    response = client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Без CSRF", "unit": "g"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF validation failed"


def test_school_user_cannot_mutate_recipe_catalog(school_client):
    client, _ = school_client

    assert client.post(
        "/api/v1/recipes/ingredients",
        json={"name": "Шкільний інгредієнт", "unit": "g"},
        headers=csrf_headers(client),
    ).status_code == 403

    assert client.post(
        "/api/v1/recipes/dish-cards",
        json={"card_number": "99.05", "name": "Шкільна страва"},
        headers=csrf_headers(client),
    ).status_code == 403

    assert client.post(
        "/api/v1/recipes/dish-cards/6a4700000000000000000000/versions",
        json={"portion_variants": [], "ingredient_amounts": []},
        headers=csrf_headers(client),
    ).status_code == 403


def test_school_user_can_read_recipe_catalog(school_client):
    """Schools need read-only catalog access to replace daily menu dishes."""
    client, _ = school_client
    assert client.get("/api/v1/recipes/ingredients").status_code == 200
    assert client.get("/api/v1/recipes/dish-cards").status_code == 200


def _create_dish_card(client: TestClient, *, number: str) -> str:
    response = client.post(
        "/api/v1/recipes/dish-cards",
        json={
            "card_number": number,
            "name": f"Карточка {number}",
            "category": "холодні страви",
        },
        headers=csrf_headers(client),
    )
    assert response.status_code == 201
    return response.json()["id"]


def _create_version(
    client: TestClient,
    *,
    dish_card_id: str,
    variant_id: PydanticObjectId,
    amounts: list[dict],
) -> str:
    response = client.post(
        f"/api/v1/recipes/dish-cards/{dish_card_id}/versions",
        json={
            "portion_variants": [portion_payload("120", variant_id)],
            "ingredient_amounts": amounts,
        },
        headers=csrf_headers(client),
    )
    assert response.status_code == 201
    return response.json()["id"]


def _create_preview(
    client: TestClient,
    *,
    number: str,
    variant_id: PydanticObjectId,
    amounts: list[dict],
    recognized_warnings: list[str] | None = None,
    recognition_errors: list[str] | None = None,
    portions: bool = True,
) -> str:
    dish_card_id = _create_dish_card(client, number=number)
    payload: dict = {
        "source_file_name": "scan.pdf",
        "source_page": 1,
        "recognized_warnings": recognized_warnings or [],
        "recognition_errors": recognition_errors or [],
        "portion_variants": [portion_payload("120", variant_id)] if portions else [],
        "ingredient_amounts": amounts,
    }
    response = client.post(
        f"/api/v1/recipes/dish-cards/{dish_card_id}/versions/preview",
        json=payload,
        headers=csrf_headers(client),
    )
    assert response.status_code == 202
    return response.json()["id"]


def _prepare_simple_confirmed_card(
    client: TestClient,
    *,
    number: str,
    gross: Decimal,
    net: Decimal = Decimal("84"),
) -> tuple[PydanticObjectId, str]:
    variant_id = PydanticObjectId()
    dish_card_id = _create_dish_card(client, number=number)
    version_id = _create_version(
        client,
        dish_card_id=dish_card_id,
        variant_id=variant_id,
        amounts=[
            amount_payload(
                name="Морква",
                gross=str(gross),
                net=str(net),
                variant_id=variant_id,
            )
        ],
    )
    confirm_response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/confirm",
        headers=csrf_headers(client),
    )
    assert confirm_response.status_code == 200
    return variant_id, version_id


def _prepare_alternative_group_card(client: TestClient) -> tuple[PydanticObjectId, str]:
    variant_id = PydanticObjectId()
    dish_card_id = _create_dish_card(client, number="99.10")
    version_id = _create_version(
        client,
        dish_card_id=dish_card_id,
        variant_id=variant_id,
        amounts=[
            amount_payload(
                name="Морква свіжа до 01.01",
                gross="103.2",
                net="84",
                variant_id=variant_id,
                group_key="carrot-season",
                alternative_label="before-jan",
            ),
            amount_payload(
                name="Морква свіжа з 01.01",
                gross="106.08",
                net="84",
                variant_id=variant_id,
                group_key="carrot-season",
                alternative_label="after-jan",
            ),
        ],
    )
    confirm_response = client.post(
        f"/api/v1/recipes/dish-card-versions/{version_id}/confirm",
        headers=csrf_headers(client),
    )
    assert confirm_response.status_code == 200
    return variant_id, version_id


@pytest.mark.asyncio
async def test_decimal_round_trip_via_beanie_preserves_precision():
    """Direct model round-trip: insert Decimal, read back, expect Decimal (not Decimal128/float)."""
    from app.db.beanie import init_odm
    from app.db.mongo import close_mongo, connect_mongo

    await connect_mongo()
    try:
        await init_odm()
        dish_card = DishCard(
            card_number="ZZ.T",
            name="Roundtrip probe",
            category="test",
            source="test",
        )
        await dish_card.insert()
        variant = PortionVariant(portion_grams=Decimal("120"), output_grams=Decimal("120"))
        version = DishCardVersion(
            dish_card_id=dish_card.id,
            version=997,
            status=DishCardVersionStatus.CONFIRMED,
            portion_variants=[variant],
            ingredient_amounts=[
                IngredientAmount(
                    ingredient_name_snapshot="Морква",
                    gross_amount=Decimal("103.2"),
                    net_amount=Decimal("84"),
                    unit="g",
                    portion_variant_id=variant.id,
                )
            ],
        )
        await version.insert()
        try:
            loaded = await DishCardVersion.get(version.id)
            assert isinstance(loaded.ingredient_amounts[0].gross_amount, Decimal)
            assert loaded.ingredient_amounts[0].gross_amount == Decimal("103.2")
            assert isinstance(loaded.portion_variants[0].output_grams, Decimal)
            assert loaded.portion_variants[0].output_grams == Decimal("120")
        finally:
            await version.delete()
            await dish_card.delete()
    finally:
        await close_mongo()
