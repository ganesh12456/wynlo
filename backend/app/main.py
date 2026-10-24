"""Public, read-only API for the January 2026 Elexon decision replay."""

from __future__ import annotations

import csv
import io
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .service import ALIGNMENT_NOTE, get_service

app = FastAPI(title="UK Wind Decision Replay", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")


def guard(action):
    try:
        return action()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/health")
def health():
    return {"status": "ok", "snapshot_id": get_service().meta["snapshot_id"]}


@app.get("/api/meta")
def meta():
    source = get_service().meta
    return {
        "snapshot_id": source["snapshot_id"], "snapshot_built_at": source["snapshot_built_at"],
        "first_decision": "2026-01-01", "last_decision": "2026-01-31",
        "default_cutoff_local": "09:00", "timezone": "Europe/London", "unit": "MW",
        "source_urls": source["source_urls"], "counts": source["counts"],
        "alignment_note": ALIGNMENT_NOTE,
    }


@app.get("/api/forecast")
def forecast(decision_date: str, cutoff_local: str = "09:00", include_actuals: bool = False):
    return guard(lambda: get_service().replay(decision_date, cutoff_local, include_actuals))


@app.get("/api/accuracy")
def accuracy(decision_from: str, decision_to: str, cutoff_local: str = "09:00"):
    return guard(lambda: get_service().accuracy(decision_from, decision_to, cutoff_local))


@app.get("/api/export")
def export(decision_from: str, decision_to: str, cutoff_local: str = "09:00"):
    result = guard(lambda: get_service().accuracy(decision_from, decision_to, cutoff_local))
    buffer = io.StringIO()
    fields = ["snapshot_id", "decision_date", "delivery_date", "target_start", "target_local", "publish_time", "age_minutes", "forecast_mw", "actual_mw", "error_mw", "status", "actual_status"]
    writer = csv.DictWriter(buffer, fieldnames=fields)
    writer.writeheader()
    for row in result["rows"]:
        writer.writerow({key: result["snapshot_id"] if key == "snapshot_id" else row.get(key) for key in fields})
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="wind-forecast-comparison.csv"'})


# Docker packages the React build here. Vercel routes to its separate frontend service.
static_path = Path(__file__).resolve().parent / "static"
if static_path.exists():
    app.mount("/", StaticFiles(directory=static_path, html=True), name="frontend")
