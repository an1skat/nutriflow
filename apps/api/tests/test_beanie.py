import pytest

from app.db.beanie import find_stale_menu_import_preview_index_names, init_odm

pytestmark = pytest.mark.no_clean_database


def test_find_stale_menu_import_preview_index_names_returns_legacy_non_ttl_indexes() -> None:
    index_information = {
        "_id_": {"key": [("_id", 1)], "v": 2},
        "ix_menu_import_preview_owner": {"key": [("owner_user_id", 1)], "v": 2},
        "ix_menu_import_preview_expires_at": {"key": [("expires_at", 1)], "v": 2},
        "legacy_preview_expiry": {"key": [("expires_at", 1)], "v": 2, "sparse": True},
        "ttl_refresh_expiry": {
            "key": [("expires_at", 1)],
            "v": 2,
            "expireAfterSeconds": 0,
        },
    }

    assert find_stale_menu_import_preview_index_names(index_information) == [
        "ix_menu_import_preview_expires_at",
        "legacy_preview_expiry",
    ]


def test_find_stale_menu_import_preview_index_names_ignores_matching_ttl_index() -> None:
    index_information = {
        "ix_menu_import_preview_expires_at": {
            "key": [("expires_at", 1)],
            "v": 2,
            "expireAfterSeconds": 0,
        }
    }

    assert find_stale_menu_import_preview_index_names(index_information) == []


@pytest.mark.asyncio
async def test_init_odm_drops_stale_indexes_before_initializing_beanie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    async def fake_drop_stale_menu_import_preview_indexes() -> None:
        calls.append("drop")

    async def fake_init_beanie(*, database, document_models) -> None:
        calls.append("init")

    monkeypatch.setattr(
        "app.db.beanie.drop_stale_menu_import_preview_indexes",
        fake_drop_stale_menu_import_preview_indexes,
    )
    monkeypatch.setattr("app.db.beanie.init_beanie", fake_init_beanie)
    monkeypatch.setattr("app.db.beanie.get_database", lambda: object())
    monkeypatch.setattr("app.db.beanie.get_document_models", lambda: [])

    await init_odm()

    assert calls == ["drop", "init"]
