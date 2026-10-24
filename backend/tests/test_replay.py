"""Decision-time behaviour and alignment checks with deliberately small fixtures."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.service import ReplayService, get_service, load_snapshot


def fixture_service(forecasts=(), actuals=()):
    return ReplayService({
        "meta": {"snapshot_id": "fixture"},
        "forecasts": [
            {"startTime": target, "publishTime": published, "generation": value}
            for target, published, value in forecasts
        ],
        "actuals": [
            {"startTime": target, "generation": value, "fuelType": "WIND"}
            for target, value in actuals
        ],
    })


def test_forecast_uses_latest_eligible_publication_and_exact_cutoff():
    target = "2026-01-16T00:00:00Z"
    service = fixture_service(forecasts=[
        (target, "2026-01-15T08:59:00Z", 200),
        (target, "2026-01-15T09:00:00Z", 300),
        (target, "2026-01-15T09:01:00Z", 900),
    ])
    row = service.replay("2026-01-15")["rows"][0]
    assert row["forecast_mw"] == 300
    assert row["publish_time"] == "2026-01-15T09:00:00Z"
    assert row["age_minutes"] == 0
    assert service.replay("2026-01-15", "08:59")["rows"][0]["forecast_mw"] == 200


def test_missing_forecast_and_future_publication_stay_missing():
    service = fixture_service(forecasts=[
        ("2026-01-16T00:00:00Z", "2026-01-15T10:00:00Z", 100),
    ])
    replay = service.replay("2026-01-15")
    assert replay["forecast_count"] == 0
    assert replay["rows"][0]["status"] == "no eligible forecast"


def test_mixed_vintages_and_incomplete_actual_are_reported():
    service = fixture_service(
        forecasts=[
            ("2026-01-16T00:00:00Z", "2026-01-15T08:00:00Z", 100),
            ("2026-01-16T01:00:00Z", "2026-01-15T08:30:00Z", 120),
        ],
        actuals=[
            ("2026-01-16T00:00:00Z", 80),
            ("2026-01-16T00:30:00Z", 100),
            ("2026-01-16T01:00:00Z", 130),
        ],
    )
    replay = service.replay("2026-01-15", include_actuals=True)
    assert replay["mixed_vintages"] is True
    assert replay["rows"][0]["actual_mw"] == 90
    assert replay["rows"][0]["error_mw"] == -10
    assert replay["rows"][1]["actual_mw"] is None
    result = service.accuracy("2026-01-15", "2026-01-15")
    assert result["matched_count"] == 1
    assert result["mae_mw"] == 10
    assert result["bias_mw"] == -10


def test_conflicting_latest_revision_is_not_silently_replaced():
    target = "2026-01-16T00:00:00Z"
    service = fixture_service(forecasts=[
        (target, "2026-01-15T07:00:00Z", 100),
        (target, "2026-01-15T08:00:00Z", 200),
        (target, "2026-01-15T08:00:00Z", 300),
    ])
    row = service.replay("2026-01-15")["rows"][0]
    assert row["forecast_mw"] is None
    assert row["status"] == "conflicting latest forecast"


@pytest.mark.parametrize("decision", ["2026-02-01", "2025-12-31", "20260115", "nonsense"])
def test_out_of_scope_decisions_rejected(decision):
    with pytest.raises(ValueError):
        fixture_service().replay(decision)


def test_real_snapshot_has_complete_january_replay_and_no_future_leakage():
    snapshot = load_snapshot()
    service = ReplayService(snapshot)
    result = service.accuracy("2026-01-01", "2026-01-31")
    assert result["expected_count"] == 744
    assert result["matched_count"] == 744
    assert result["mae_mw"] > 0
    for row in result["rows"]:
        assert row["publish_time"] is not None
        cutoff = service.replay(row["decision_date"])["cutoff_utc"]
        assert datetime.fromisoformat(row["publish_time"].replace("Z", "+00:00")) <= datetime.fromisoformat(cutoff.replace("Z", "+00:00"))


def test_api_smoke_and_export():
    client = TestClient(app)
    assert client.get("/api/health").status_code == 200
    response = client.get("/api/forecast", params={"decision_date": "2026-01-15"})
    assert response.status_code == 200
    assert response.json()["expected_count"] == 24
    assert client.get("/api/forecast", params={"decision_date": "2026-02-01"}).status_code == 422
    csv_response = client.get("/api/export", params={"decision_from": "2026-01-15", "decision_to": "2026-01-15"})
    assert csv_response.status_code == 200
    assert len(csv_response.text.splitlines()) == 25
