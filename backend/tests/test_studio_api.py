"""Frontend contracts exercised against the Python/FastAPI runtime."""
import csv
import io
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import app, presenter
from app.presentation import StudioPresenter

client = TestClient(app)
REFERENCE = json.loads((Path(__file__).parent / "studio_reference.json").read_text())


def test_identity_metadata_and_no_response_caching():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["x-wynlo-backend"] == "python-fastapi"
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["analysis_mode"] == "request_time"
    meta = client.get("/api/meta").json()
    assert meta["backend"] == "python-fastapi"
    assert len(meta["source_sha256"]["windfor"]) == 64
    assert meta["counts"]["forecast_rows"] == 18688


def test_replay_contract_request_time_changes_and_explicit_actuals():
    result = client.get("/api/forecast", params={"date": "2026-01-15", "cutoff": "09:00"}).json()
    assert result["delivery_date"] == "2026-01-16"
    assert result["forecast_count"] == 24
    assert [r["forecast_mw"] for r in result["rows"]] == [r["forecast_mw"] for r in REFERENCE["replay"]["rows"]]
    assert all(r["status"] == "Available" and "actual_mw" not in r for r in result["rows"])
    actuals = client.get("/api/forecast", params={"date": "2026-01-15", "actuals": True}).json()
    assert all("actual_mw" in r for r in actuals["rows"])
    changed = client.get("/api/forecast", params={"date": "2026-01-15", "cutoff": "07:00"}).json()
    assert changed["rows"][0]["forecast_mw"] != result["rows"][0]["forecast_mw"]


def test_comparison_and_accuracy_match_the_existing_frontend_contract():
    comparison = client.get("/api/comparison").json()
    assert comparison["value_changed_count"] == 24
    assert comparison["rows"][0]["delta_mw"] == -450
    assert comparison["rows"][0]["change_status"] == "Value changed"
    assert all("actual_mw" not in r for r in comparison["rows"])
    review = client.get("/api/accuracy", params={"from": "2026-01-01", "to": "2026-01-31"}).json()
    assert review["matched_count"] == review["expected_count"] == 744
    for key in ["mae_mw", "rmse_mw", "bias_mw"]:
        assert review[key] == pytest.approx(REFERENCE["accuracy"][key])
    assert review["daily"][0]["date"] == "2026-01-02"
    assert review["hourly"][0]["hour"] == "00:00"
    assert "rows" not in review
    day = client.get("/api/accuracy", params={"from": "2026-01-15", "to": "2026-01-15"}).json()
    assert day["expected_count"] == 24


@pytest.mark.parametrize("path,params", [
    ("/api/forecast", {"date": "2026-01-32"}),
    ("/api/forecast", {"date": "2026-01-15", "cutoff": "25:00"}),
    ("/api/forecast", {"date": "2026-01-15", "decision_date": "2026-01-16"}),
    ("/api/comparison", {"earlier": "09:00", "later": "07:00"}),
    ("/api/accuracy", {"from": "2026-01-31", "to": "2026-01-01"}),
    ("/api/export", {"view": "unknown"}),
])
def test_invalid_inputs_return_actionable_errors(path, params):
    response = client.get(path, params=params)
    assert response.status_code == 422
    assert response.json()["error"]


@pytest.mark.parametrize("view,expected", [("replay", 24), ("compare", 24), ("accuracy", 31)])
def test_evidence_exports(view, expected):
    response = client.get("/api/export", params={"view": view, "date": "2026-01-15", "cutoff": "09:00"})
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == expected
    if view == "replay":
        assert rows[0]["forecast_mw"] == "7398.0"
        assert "actual_mw" not in rows[0]
    if view == "compare":
        assert rows[0]["delta_mw"] == "-450.0"


def test_dependency_boundary_accepts_a_substituted_python_analysis():
    class Fixture:
        meta = {"snapshot_id": "fixture"}
        def replay(self, day, cutoff, actuals=False):
            return {"rows": [{"status": "ok", "forecast_mw": 123}]}
    app.dependency_overrides[presenter] = lambda: StudioPresenter(Fixture())
    try:
        assert client.get("/api/forecast").json()["rows"][0]["forecast_mw"] == 123
    finally:
        app.dependency_overrides.clear()


def test_openapi_exposes_the_python_api_and_reserved_query_alias():
    spec = client.get("/api/openapi.json").json()
    assert spec["info"]["title"] == "Wynlo Wind Analysis API"
    assert any(p["name"] == "from" for p in spec["paths"]["/api/accuracy"]["get"]["parameters"])
