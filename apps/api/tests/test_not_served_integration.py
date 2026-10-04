from copy import deepcopy
from datetime import date, timedelta

import pytest
from beanie import PydanticObjectId
from pymongo import MongoClient

from app.core.config import get_settings
from app.modules.menu_requirements.utils import hash_daily_menu
from app.modules.menus.models import DailyMenu, Weekday
from tests.test_menu_requirement_reports import (
    assign_schools_to_community,
    create_confirmed_dish,
    publish_school_menu,
    set_school_menu_counts,
)
from tests.test_menu_requirements import csrf_headers, login


@pytest.fixture
def food_period(seeded_client, monkeypatch):
    client, identities = seeded_client
    monkeypatch.setattr(
        "app.modules.menus.day_closure._today_in_school_timezone", lambda: date(2026, 7, 31)
    )
    login(client, identities.admin.username, identities.admin_password)
    assign_schools_to_community(client, identities.own_school.id)
    _, card_id, variant_id = create_confirmed_dish(client)

    def make_week(monday=date(2026, 7, 6), meal_type="lunch"):
        login(client, identities.admin.username, identities.admin_password)
        menu = publish_school_menu(
            client,
            school_id=str(identities.own_school.id),
            card_id=card_id,
            variant_id=variant_id,
            days=[
                (weekday.value, (monday + timedelta(days=offset)).isoformat())
                for offset, weekday in enumerate(list(Weekday)[:5])
            ],
            starts_on=monday.isoformat(),
            ends_on=(monday + timedelta(days=4)).isoformat(),
        )
        if meal_type != "lunch":
            source = client.get(f"/api/v1/menus/weekly/{menu['source_menu_id']}").json()
            response = client.patch(
                f"/api/v1/menus/weekly/{source['id']}",
                json={"revision": source["revision"], "meal_type": meal_type},
                headers=csrf_headers(client),
            )
            assert response.status_code == 200, response.text
            menu = client.get(f"/api/v1/menus/weekly/{menu['id']}").json()
        login(client, identities.school_user.username, identities.school_user_password)
        menu = set_school_menu_counts(
            client,
            menu=menu,
            group_id=str(identities.own_school.groups[0].id),
            counts_by_weekday={weekday.value: 10 for weekday in list(Weekday)[:5]},
        )
        for day in menu["days"]:
            response = generate(client, menu, day)
            assert response.status_code == 200, response.text
        return menu

    settings = get_settings()
    assert settings.mongo_db == "nutriflow_test"
    with MongoClient(settings.mongo_uri, tz_aware=True) as mongo:
        yield client, identities, mongo[settings.mongo_db], make_week


def save_days(client, menu, days):
    response = client.patch(
        f"/api/v1/menus/weekly/{menu['id']}",
        json={"revision": menu["revision"], "days": days},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def generate(client, menu, day):
    return client.post(
        "/api/v1/menu-requirements/generate",
        json={
            "weekly_menu_id": menu["id"],
            "weekday": day["weekday"],
            "service_date": day["date"],
        },
        headers=csrf_headers(client),
    )


def mark_period(client, menus, scenario):
    for index, menu in enumerate(menus):
        days = deepcopy(menu["days"])
        for offset, day in enumerate(days):
            day["not_served"] = scenario == "all" or (
                scenario in {"mixed", "incomplete"}
                and (
                    (index == 0 and offset == 0)
                    or (len(menus) > 1 and index == len(menus) - 1 and offset == 4)
                )
            )
            if scenario == "incomplete" and index == 0 and offset == 1:
                day["not_served"] = False
                for item in day["items"]:
                    item["servings"] = []
        menus[index] = save_days(client, menu, days)
    return menus


def assert_no_consumption(report, not_served_dates):
    for group in report["groups"]:
        for row in group["ingredient_rows"]:
            for cell in row["cells"]:
                assert all(b["service_date"] not in not_served_dates for b in cell["breakdown"])


@pytest.mark.parametrize("granularity", ["week", "month"])
@pytest.mark.parametrize("scenario", ["normal", "mixed", "all", "incomplete"])
def test_real_school_and_community_period_completion(food_period, granularity, scenario):
    client, identities, db, make_week = food_period
    menus = [make_week()]
    if granularity == "month":
        menus.append(make_week(date(2026, 7, 13)))
    menus = mark_period(client, menus, scenario)
    no_food_dates = {d["date"] for menu in menus for d in menu["days"] if d["not_served"]}
    # Historical rows intentionally remain: reports must filter persisted day state themselves.
    assert db.menu_requirements.count_documents({}) == len(menus) * 5
    params = {
        "date_from": "2026-07-06" if granularity == "week" else "2026-07-01",
        "date_to": "2026-07-10" if granularity == "week" else "2026-07-31",
        "granularity": granularity,
        "meal_type": "lunch",
    }
    for user, password, is_owner in (
        (identities.school_user, identities.school_user_password, False),
        (identities.lower_admin, identities.lower_admin_password, False),
        (identities.admin, identities.admin_password, True),
    ):
        login(client, user.username, password)
        for path, extra in (
            ("/api/v1/menu-requirements/report", {"school_id": str(identities.own_school.id)}),
            (
                "/api/v1/menu-requirements/report",
                {
                    "school_id": str(identities.own_school.id),
                    "school_group_id": str(identities.own_school.groups[0].id),
                },
            ),
            ("/api/v1/menu-requirements/communities/obukhivska/report", {}),
        ):
            if user.school_id is not None and "communities" in path:
                continue
            response = client.get(path, params={**params, **extra})
            if scenario == "incomplete" and not is_owner:
                assert response.status_code == 400, response.text
                continue
            assert response.status_code == 200, response.text
            report = response.json()
            assert report["not_served"] == (scenario == "all")
            assert report["status"] == ("mixed" if scenario == "incomplete" else "complete")
            if scenario == "incomplete":
                assert report["missing_dates"] == ["2026-07-07"]
                assert report["stale_dates"] == ["2026-07-07"]
            assert_no_consumption(report, no_food_dates)
            if scenario == "all":
                assert report["groups"] == []
            if scenario != "incomplete":
                assert report["missing_dates"] == report["stale_dates"] == []
                for group in report["groups"]:
                    assert all(
                        dish["children_count_total"] == (len(menus) * 5 - len(no_food_dates)) * 10
                        for dish in group["dishes"]
                    )

        if granularity == "week" and user.school_id is None:
            response = client.get(
                "/api/v1/norm-compliance/report",
                params={"school_id": str(identities.own_school.id), **params},
            )
            if scenario == "incomplete" and not is_owner:
                assert response.status_code == 400, response.text
            else:
                assert response.status_code == 200, response.text
                report = response.json()
                if scenario == "all":
                    assert report["groups"] == []
                    assert report["status"] == "complete"
                for group in report["groups"]:
                    for section in group["sections"]:
                        assert not set(section["stale_dates"]) & no_food_dates
                        for row in section["rows"]:
                            assert all(
                                b["service_date"] not in no_food_dates for b in row["breakdown"]
                            )


def test_not_served_generation_cleanup_hash_and_empty_transition(food_period):
    client, identities, db, make_week = food_period
    menu = make_week()
    second_group = deepcopy(db.schools.find_one({"_id": identities.own_school.id})["groups"][0])
    second_group["id"] = PydanticObjectId()
    second_group["name"] = "Друга молодша група"
    db.schools.update_one({"_id": identities.own_school.id}, {"$push": {"groups": second_group}})
    days = deepcopy(menu["days"])
    days[0]["items"][0]["servings"].append(
        {"school_group_id": str(second_group["id"]), "age_group": "6-11", "children_count": 9}
    )
    menu = save_days(client, menu, days)
    assert generate(client, menu, menu["days"][0]).status_code == 200
    assert db.menu_requirements.count_documents({"weekday": "monday"}) == 2
    days = deepcopy(menu["days"])
    days[0]["not_served"] = True
    # Direct API contradiction across every school group must normalize to zero.
    days[0]["items"][0]["servings"] = [
        {"school_group_id": str(g.id), "age_group": g.age_group.value, "children_count": 30}
        for g in identities.own_school.groups
    ] + [{"school_group_id": str(second_group["id"]), "age_group": "6-11", "children_count": 30}]
    menu = save_days(client, menu, days)
    assert (
        client.patch(
            f"/api/v1/menus/weekly/{menu['id']}",
            json={"revision": menu["revision"] - 1, "days": days},
            headers=csrf_headers(client),
        ).status_code
        == 409
    )
    assert all(s["children_count"] == 0 for s in menu["days"][0]["items"][0]["servings"])
    login(client, identities.lower_admin.username, identities.lower_admin_password)

    def calendar_day():
        response = client.get(
            "/api/v1/menus/daily/month",
            params={"school_id": str(identities.own_school.id), "year": 2026, "month": 7},
        )
        assert response.status_code == 200, response.text
        return next(d for d in response.json()["items"] if d["weekday"] == "monday")

    assert calendar_day()["requirement_stale"] is True
    login(client, identities.school_user.username, identities.school_user_password)
    response = generate(client, menu, menu["days"][0])
    assert response.status_code == 200, response.text
    assert response.json()["items"] == []
    assert db.menu_requirements.count_documents({"weekday": "monday"}) == 0
    assert db.menu_requirements.count_documents({}) == 4
    menu = client.get(f"/api/v1/menus/weekly/{menu['id']}").json()
    stored = db.weekly_menus.find_one({"_id": PydanticObjectId(menu["id"])})
    marked_hash = hash_daily_menu(DailyMenu.model_validate(menu["days"][0]))
    assert stored["days"][0]["requirements_generated_hash"] == marked_hash
    assert generate(client, menu, menu["days"][0]).json()["items"] == []
    menu = client.get(f"/api/v1/menus/weekly/{menu['id']}").json()
    login(client, identities.lower_admin.username, identities.lower_admin_password)
    assert calendar_day()["requirement_stale"] is False

    login(client, identities.school_user.username, identities.school_user_password)
    days = deepcopy(menu["days"])
    days[0]["not_served"] = False
    menu = save_days(client, menu, days)
    assert hash_daily_menu(DailyMenu.model_validate(menu["days"][0])) != marked_hash
    assert generate(client, menu, menu["days"][0]).status_code == 400
    response = client.get(
        "/api/v1/menu-requirements/report",
        params={
            "school_id": str(identities.own_school.id),
            "date_from": "2026-07-06",
            "date_to": "2026-07-10",
            "granularity": "week",
        },
    )
    assert response.status_code == 400
    login(client, identities.lower_admin.username, identities.lower_admin_password)
    assert calendar_day()["requirement_stale"] is True
    login(client, identities.school_user.username, identities.school_user_password)
    days = deepcopy(menu["days"])
    days[0]["items"][0]["servings"][0]["children_count"] = 7
    menu = save_days(client, menu, days)
    assert generate(client, menu, menu["days"][0]).status_code == 200
    assert db.menu_requirements.count_documents({"weekday": "monday"}) == 1
    login(client, identities.lower_admin.username, identities.lower_admin_password)
    assert calendar_day()["requirement_stale"] is False


@pytest.mark.parametrize("school_not_served", [False, True])
def test_template_update_and_republish_persist_school_state(food_period, school_not_served):
    client, identities, db, make_week = food_period
    menu = make_week()
    days = deepcopy(menu["days"])
    days[0]["not_served"] = school_not_served
    menu = save_days(client, menu, days)
    login(client, identities.admin.username, identities.admin_password)
    source = client.get(f"/api/v1/menus/weekly/{menu['source_menu_id']}").json()
    days = deepcopy(source["days"])
    days[0]["not_served"] = not school_not_served
    source = save_days(client, source, days)

    def assert_stored_state():
        stored = db.weekly_menus.find_one({"_id": PydanticObjectId(menu["id"])})
        day = stored["days"][0]
        assert day["not_served"] == school_not_served
        assert all(
            s["children_count"] == (0 if school_not_served else 10)
            for item in day["items"]
            for s in item["servings"]
        )

    assert_stored_state()
    response = client.post(
        f"/api/v1/menus/weekly/{source['id']}/publish",
        json={"school_ids": [str(identities.own_school.id)], "replace_existing": True},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    assert_stored_state()


@pytest.mark.parametrize("automatic", [False, True])
def test_not_served_closes_reopens_and_enforces_closed_integrity(food_period, automatic):
    client, identities, db, make_week = food_period
    menu = mark_period(client, [make_week()], "all")[0]
    if automatic:
        response = client.post("/api/v1/menus/weekly/close-due-days", headers=csrf_headers(client))
        assert response.status_code == 200, response.text
        assert response.json()["closed_days"] == 5
        menu = client.get(f"/api/v1/menus/weekly/{menu['id']}").json()
    else:
        response = client.post(
            f"/api/v1/menus/weekly/{menu['id']}/days/monday/close", headers=csrf_headers(client)
        )
        assert response.status_code == 200, response.text
        menu = response.json()
    day = menu["days"][0]
    assert day["not_served"] is True
    assert day["closed_at"] is not None
    assert day["closed_by"] == str(identities.school_user.id)
    assert day["close_reason"] == ("automatic" if automatic else "manual")
    stored = db.weekly_menus.find_one({"_id": PydanticObjectId(menu["id"])})
    assert stored["days"][0]["close_notification_pending"] is True
    assert stored["days"][0]["close_notification_sent_at"] is None
    assert db.menu_requirements.count_documents({"weekday": "monday"}) == 0
    days = deepcopy(menu["days"])
    days[0]["not_served"] = False
    assert (
        client.patch(
            f"/api/v1/menus/weekly/{menu['id']}",
            json={"revision": menu["revision"], "days": days},
            headers=csrf_headers(client),
        ).status_code
        == 400
    )
    login(client, identities.lower_admin.username, identities.lower_admin_password)
    response = client.post(
        f"/api/v1/menus/weekly/{menu['id']}/days/monday/reopen", headers=csrf_headers(client)
    )
    assert response.status_code == 200, response.text
    day = response.json()["days"][0]
    assert day["not_served"] is True
    assert day["closed_at"] is None
    assert all(s["children_count"] == 0 for item in day["items"] for s in item["servings"])


def test_not_served_meal_isolation_and_cross_month_bounds(food_period):
    client, identities, _db, make_week = food_period
    make_week(meal_type="breakfast")
    lunch = mark_period(client, [make_week()], "incomplete")[0]
    make_week(date(2026, 6, 29))
    make_week(date(2026, 8, 3))
    login(client, identities.lower_admin.username, identities.lower_admin_password)
    for meal, status in (("breakfast", 200), ("lunch", 400)):
        response = client.get(
            "/api/v1/menu-requirements/report",
            params={
                "school_id": str(identities.own_school.id),
                "date_from": "2026-07-06",
                "date_to": "2026-07-10",
                "granularity": "week",
                "meal_type": meal,
            },
        )
        assert response.status_code == status, response.text
    assert (
        client.get(
            "/api/v1/norm-compliance/report",
            params={
                "school_id": str(identities.own_school.id),
                "date_from": "2026-07-06",
                "date_to": "2026-07-10",
            },
        ).status_code
        == 400
    )
    login(client, identities.school_user.username, identities.school_user_password)
    lunch = mark_period(client, [lunch], "all")[0]
    response = client.get(
        "/api/v1/menu-requirements/report",
        params={
            "school_id": str(identities.own_school.id),
            "date_from": "2026-07-01",
            "date_to": "2026-07-31",
            "granularity": "month",
            "meal_type": "lunch",
        },
    )
    assert response.status_code == 200, response.text
    for group in response.json()["groups"]:
        for row in group["ingredient_rows"]:
            for cell in row["cells"]:
                assert all(
                    "2026-07-01" <= b["service_date"] <= "2026-07-31" for b in cell["breakdown"]
                )
