"""Presentation adapters for the React/Next.js contract; calculations remain in Python."""
from typing import Any, Protocol

from .service import ALIGNMENT_NOTE


class WindAnalysis(Protocol):
    """Read-only analysis port consumed by the HTTP presentation layer."""
    meta: dict

    def replay(self, decision_date: str, cutoff_local: str = "09:00", include_actuals: bool = False) -> dict: ...
    def compare_cutoffs(self, decision_date: str, earlier_cutoff_local: str = "07:00", later_cutoff_local: str = "09:00") -> dict: ...
    def accuracy(self, decision_from: str, decision_to: str, cutoff_local: str = "09:00") -> dict: ...


class StudioPresenter:
    def __init__(self, analysis: WindAnalysis):
        self.analysis = analysis

    def metadata(self) -> dict:
        return {
            **self.analysis.meta,
            "alignment_note": ALIGNMENT_NOTE,
            "timezone": "Europe/London",
            "unit": "MW",
            "backend": "python-fastapi",
            "data_mode": "historical_snapshot",
            "analysis_mode": "request_time",
        }

    def replay(self, day: str, cutoff: str, actuals: bool = False) -> dict:
        result = self.analysis.replay(day, cutoff, actuals)
        return {**result, "rows": [{**row, "status": "Available" if row["status"] == "ok" else row["status"]} for row in result["rows"]]}

    def comparison(self, day: str, earlier: str, later: str) -> dict:
        result = self.analysis.compare_cutoffs(day, earlier, later)
        return {**result, "rows": [{**row, "change_status": row["change_status"].capitalize()} for row in result["rows"]]}

    def accuracy(self, first: str, last: str, cutoff: str, include_rows: bool = False) -> dict:
        result = self.analysis.accuracy(first, last, cutoff)
        return {
            **{key: value for key, value in result.items() if key != "rows"},
            "daily": [{**day, "date": day["delivery_date"]} for day in result["daily"]],
            "hourly": [{**hour, "hour": hour["hour_local"]} for hour in result["hourly"]],
            **({"rows": result["rows"]} if include_rows else {}),
        }
