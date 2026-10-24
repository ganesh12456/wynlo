"""Dynamic Python/FastAPI backend for the Wynlo React/Next.js interface."""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .presentation import StudioPresenter
from .service import get_service

app = FastAPI(title="Wynlo Wind Analysis API", version="2.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")


def presenter() -> StudioPresenter:
    return StudioPresenter(get_service())


Studio = Annotated[StudioPresenter, Depends(presenter)]


def guard(action):
    try:
        return action()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def choose(current, legacy, default):
    if current is not None and legacy is not None and current != legacy:
        raise HTTPException(status_code=422, detail="Conflicting values supplied for the same selection.")
    return current if current is not None else legacy if legacy is not None else default


def csv_response(rows: list[dict], filename: str, fields: list[str] | None = None):
    buffer = io.StringIO(newline="")
    columns = fields or (list(rows[0]) if rows else [])
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return Response(buffer.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.middleware("http")
async def identify_backend(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Wynlo-Backend"] = "python-fastapi"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, error: HTTPException):
    return JSONResponse({"error": str(error.detail), "detail": error.detail}, status_code=error.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    return JSONResponse({"error": "Invalid request parameters.", "detail": str(error)}, status_code=422)


@app.get("/api/health")
def health(studio: Studio):
    return {"status": "ok", "backend": "python-fastapi", "analysis_mode": "request_time", "data_mode": "historical_snapshot", "snapshot_id": studio.analysis.meta["snapshot_id"]}


@app.get("/api/meta")
def meta(studio: Studio):
    return studio.metadata()


@app.get("/api/forecast")
def forecast(studio: Studio, date: str | None = None, cutoff: str | None = None, actuals: bool | None = None,
             decision_date: str | None = None, cutoff_local: str | None = None, include_actuals: bool | None = None):
    day = choose(date, decision_date, "2026-01-15")
    clock = choose(cutoff, cutoff_local, "09:00")
    reveal = choose(actuals, include_actuals, False)
    return guard(lambda: studio.replay(day, clock, reveal))


@app.get("/api/comparison")
def comparison(studio: Studio, date: str = "2026-01-15", earlier: str = "07:00", later: str = "09:00"):
    return guard(lambda: studio.comparison(date, earlier, later))


@app.get("/api/cutoff-impact")
def legacy_comparison(studio: Studio, decision_date: str, earlier_cutoff_local: str = "07:00", later_cutoff_local: str = "09:00"):
    return guard(lambda: studio.analysis.compare_cutoffs(decision_date, earlier_cutoff_local, later_cutoff_local))


@app.get("/api/accuracy")
def accuracy(studio: Studio, first: Annotated[str | None, Query(alias="from")] = None, to: str | None = None, cutoff: str | None = None,
             decision_from: str | None = None, decision_to: str | None = None, cutoff_local: str | None = None):
    first = choose(first, decision_from, "2026-01-01")
    last = choose(to, decision_to, "2026-01-31")
    clock = choose(cutoff, cutoff_local, "09:00")
    return guard(lambda: studio.accuracy(first, last, clock, include_rows=decision_from is not None))


@app.get("/api/cutoff-impact/export")
def legacy_comparison_export(studio: Studio, decision_date: str, earlier_cutoff_local: str = "07:00", later_cutoff_local: str = "09:00"):
    result = guard(lambda: studio.analysis.compare_cutoffs(decision_date, earlier_cutoff_local, later_cutoff_local))
    fields = ["snapshot_id", "decision_date", "delivery_date", "earlier_cutoff_local", "later_cutoff_local", "target_start", "target_local", "earlier_forecast_mw", "later_forecast_mw", "delta_mw", "earlier_publish_time", "later_publish_time", "earlier_status", "later_status", "change_status"]
    return csv_response([{**result, **row} for row in result["rows"]], "wind-cutoff-comparison.csv", fields)


@app.get("/api/export")
def export(request: Request, studio: Studio, view: str | None = None, date: str = "2026-01-15", cutoff: str = "09:00", actuals: bool = False,
           earlier: str = "07:00", later: str | None = None, to: str = "2026-01-31",
           decision_from: str | None = None, decision_to: str | None = None, cutoff_local: str | None = None):
    if view not in (None, "replay", "compare", "accuracy"):
        raise HTTPException(status_code=422, detail="Choose replay, compare or accuracy for export.")
    clock = choose(request.query_params.get("cutoff"), cutoff_local, "09:00")
    if view == "compare":
        result = guard(lambda: studio.comparison(date, earlier, later or clock))
        rows = [{"snapshot_id": studio.analysis.meta["snapshot_id"], "decision_date": date, "delivery_date": result["delivery_date"], "earlier_cutoff": earlier, "later_cutoff": later or clock, **row} for row in result["rows"]]
        return csv_response(rows, "wynlo-publication-comparison.csv")
    if view == "accuracy":
        result = guard(lambda: studio.accuracy(request.query_params.get("from", "2026-01-01"), to, clock))
        return csv_response(result["daily"], "wynlo-accuracy-review.csv")
    if decision_from is not None:
        result = guard(lambda: studio.analysis.accuracy(decision_from, decision_to or decision_from, clock))
        rows = [{"snapshot_id": result["snapshot_id"], **row} for row in result["rows"]]
        return csv_response(rows, "wind-forecast-comparison.csv")
    result = guard(lambda: studio.replay(date, clock, actuals))
    rows = [{"snapshot_id": result["snapshot_id"], "decision_date": date, "delivery_date": result["delivery_date"], "cutoff_utc": result["cutoff_utc"], **row} for row in result["rows"]]
    return csv_response(rows, "wynlo-decision-evidence.csv")


# Optional reference Vite build for the retained original Docker workflow only.
static_path = Path(__file__).resolve().parent / "static"
if static_path.exists():
    app.mount("/", StaticFiles(directory=static_path, html=True), name="reference-frontend")
