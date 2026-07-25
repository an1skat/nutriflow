import pytest

from app.scripts import close_due_days

pytestmark = pytest.mark.no_clean_database


async def test_runner_closes_mongo_after_processing(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def record(name: str, result=None):
        calls.append(name)
        return result

    monkeypatch.setattr(close_due_days, "connect_mongo", lambda: record("connect"))
    monkeypatch.setattr(close_due_days, "init_odm", lambda: record("init"))
    monkeypatch.setattr(
        close_due_days,
        "close_all_due_weekly_menu_days",
        lambda: record("close-days", (2, 0)),
    )
    monkeypatch.setattr(
        close_due_days,
        "send_pending_day_close_notifications",
        lambda: record("send-email", (2, 0)),
    )
    monkeypatch.setattr(close_due_days, "close_mongo", lambda: record("disconnect"))

    await close_due_days.run()

    assert calls == ["connect", "init", "close-days", "send-email", "disconnect"]


async def test_runner_fails_after_processing_errors_and_still_closes_mongo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    disconnected = False

    async def no_op():
        return None

    async def close_days():
        return 1, 1

    async def send_emails():
        return 0, 1

    async def disconnect():
        nonlocal disconnected
        disconnected = True

    monkeypatch.setattr(close_due_days, "connect_mongo", no_op)
    monkeypatch.setattr(close_due_days, "init_odm", no_op)
    monkeypatch.setattr(close_due_days, "close_all_due_weekly_menu_days", close_days)
    monkeypatch.setattr(close_due_days, "send_pending_day_close_notifications", send_emails)
    monkeypatch.setattr(close_due_days, "close_mongo", disconnect)

    with pytest.raises(RuntimeError, match="finished with failures"):
        await close_due_days.run()

    assert disconnected
