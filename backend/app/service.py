"""Deterministic historical selection and comparison over a frozen Elexon snapshot."""

from __future__ import annotations

import gzip
import json
import math
import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc
FIRST_DECISION = date(2026, 1, 1)
LAST_DECISION = date(2026, 1, 31)
DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "snapshot.json.gz"
ALIGNMENT_NOTE = (
    "FUELHH WIND half-hours are averaged into complete UTC hours. WINDFOR's "
    "hourly value is compared under an hourly-mean assumption; the population "
    "equivalence of these series is unverified. Errors may reflect coverage differences."
)


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Source timestamp has no timezone")
    return parsed.astimezone(UTC)


def parse_decision(value: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("decision date must be YYYY-MM-DD")
    try:
        day = date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("decision date must be YYYY-MM-DD") from exc
    if not FIRST_DECISION <= day <= LAST_DECISION:
        raise ValueError("decision date must be in January 2026")
    return day


def cutoff_for(day: date, cutoff_local: str) -> datetime:
    try:
        clock = time.fromisoformat(cutoff_local)
    except (TypeError, ValueError) as exc:
        raise ValueError("cutoff_local must be HH:MM") from exc
    if len(cutoff_local) != 5 or clock.tzinfo is not None:
        raise ValueError("cutoff_local must be HH:MM")
    local = datetime.combine(day, clock, tzinfo=LONDON)
    return local.astimezone(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


@lru_cache(maxsize=1)
def load_snapshot(path: str | None = None) -> dict:
    location = Path(path) if path else DATA_PATH
    with gzip.open(location, "rt", encoding="utf-8") as handle:
        snapshot = json.load(handle)
    if not isinstance(snapshot.get("forecasts"), list) or not isinstance(snapshot.get("actuals"), list):
        raise ValueError("Invalid snapshot structure")
    return snapshot


class ReplayService:
    def __init__(self, snapshot: dict):
        self.meta = snapshot["meta"]
        self.forecasts: dict[datetime, list[tuple[datetime, float]]] = defaultdict(list)
        self.actual_half_hours: dict[datetime, float] = {}
        conflicted_forecasts: set[tuple[datetime, datetime]] = set()
        seen_forecasts: dict[tuple[datetime, datetime], float] = {}
        conflicted_actuals: set[datetime] = set()
        for row in snapshot["forecasts"]:
            target, published = parse_utc(row["startTime"]), parse_utc(row["publishTime"])
            key = (target, published)
            value = float(row["generation"])
            if key in seen_forecasts and seen_forecasts[key] != value:
                conflicted_forecasts.add(key)
            else:
                seen_forecasts[key] = value
        for (target, published), value in seen_forecasts.items():
            if (target, published) not in conflicted_forecasts:
                self.forecasts[target].append((published, value))
        self.conflicted_forecasts = conflicted_forecasts
        for rows in self.forecasts.values():
            rows.sort(key=lambda item: item[0])
        for row in snapshot["actuals"]:
            if row.get("fuelType") != "WIND":
                continue
            target = parse_utc(row["startTime"])
            value = float(row["generation"])
            if target in self.actual_half_hours and self.actual_half_hours[target] != value:
                conflicted_actuals.add(target)
            else:
                self.actual_half_hours[target] = value
        for target in conflicted_actuals:
            self.actual_half_hours.pop(target, None)
        self.conflicted_actuals = conflicted_actuals

    def actual_hour(self, target: datetime) -> tuple[float | None, str | None]:
        next_half = target + timedelta(minutes=30)
        if target in self.conflicted_actuals or next_half in self.conflicted_actuals:
            return None, "conflicting actual revision"
        first, second = self.actual_half_hours.get(target), self.actual_half_hours.get(next_half)
        if first is None or second is None:
            return None, "incomplete actual hour"
        return (first + second) / 2, None

    def replay(self, decision_date: str, cutoff_local: str = "09:00", include_actuals: bool = False) -> dict:
        day = parse_decision(decision_date)
        cutoff = cutoff_for(day, cutoff_local)
        delivery = day + timedelta(days=1)
        local_start = datetime.combine(delivery, time.min, tzinfo=LONDON)
        local_end = datetime.combine(delivery + timedelta(days=1), time.min, tzinfo=LONDON)
        target = local_start.astimezone(UTC)
        end = local_end.astimezone(UTC)
        rows = []
        vintages = set()
        while target < end:
            candidates = [item for item in self.forecasts.get(target, []) if item[0] <= cutoff]
            eligible_conflicts = [published for conflict_target, published in self.conflicted_forecasts if conflict_target == target and published <= cutoff]
            latest_clean = max(candidates, key=lambda item: item[0]) if candidates else None
            latest_conflict = max(eligible_conflicts) if eligible_conflicts else None
            if latest_conflict and (not latest_clean or latest_conflict >= latest_clean[0]):
                published, forecast, status = None, None, "conflicting latest forecast"
            elif latest_clean:
                published, forecast, status = *latest_clean, "ok"
            else:
                published, forecast, status = None, None, "no eligible forecast"
            row = {
                "target_start": iso(target),
                "target_local": target.astimezone(LONDON).isoformat(),
                "forecast_mw": forecast,
                "publish_time": iso(published) if published else None,
                "age_minutes": round((cutoff - published).total_seconds() / 60) if published else None,
                "status": status,
            }
            if published:
                vintages.add(published)
            if include_actuals:
                actual, issue = self.actual_hour(target)
                row["actual_mw"] = actual
                row["error_mw"] = (actual - forecast) if actual is not None and forecast is not None else None
                row["actual_status"] = issue or "ok"
            rows.append(row)
            target += timedelta(hours=1)
        present = sum(row["forecast_mw"] is not None for row in rows)
        warnings = []
        if present != len(rows):
            warnings.append(f"{len(rows) - present} delivery hours have no eligible forecast.")
        if len(vintages) > 1:
            warnings.append("The selected hourly values combine more than one publication vintage.")
        return {
            "decision_date": day.isoformat(),
            "delivery_date": delivery.isoformat(),
            "cutoff_local": cutoff_local,
            "cutoff_utc": iso(cutoff),
            "snapshot_id": self.meta["snapshot_id"],
            "expected_count": len(rows),
            "forecast_count": present,
            "mixed_vintages": len(vintages) > 1,
            "warnings": warnings,
            "rows": rows,
        }

    def compare_cutoffs(self, decision_date: str, earlier_cutoff_local: str = "07:00", later_cutoff_local: str = "09:00") -> dict:
        """Compare two decision-time profiles without exposing later actuals."""
        day = parse_decision(decision_date)
        earlier_time = cutoff_for(day, earlier_cutoff_local)
        later_time = cutoff_for(day, later_cutoff_local)
        if earlier_time >= later_time:
            raise ValueError("earlier_cutoff_local must precede later_cutoff_local")

        earlier = self.replay(decision_date, earlier_cutoff_local)
        later = self.replay(decision_date, later_cutoff_local)
        rows = []
        comparable_changes = []
        revised = changed = newly_available = became_unavailable = 0
        for before, after in zip(earlier["rows"], later["rows"], strict=True):
            old, new = before["forecast_mw"], after["forecast_mw"]
            delta = new - old if old is not None and new is not None else None
            vintage_updated = (old is not None and new is not None
                               and before["publish_time"] != after["publish_time"])
            if vintage_updated:
                revised += 1
            if old is None and new is not None:
                newly_available += 1
                change_status = "newly available"
            elif old is not None and new is None:
                became_unavailable += 1
                change_status = "became unavailable"
            elif old is None:
                change_status = "unavailable at both cutoffs"
            else:
                comparable_changes.append(abs(delta))
                if delta != 0:
                    changed += 1
                change_status = "value changed" if delta != 0 else ("vintage updated" if vintage_updated else "unchanged")
            rows.append({
                "target_start": before["target_start"],
                "target_local": before["target_local"],
                "earlier_forecast_mw": old,
                "later_forecast_mw": new,
                "delta_mw": delta,
                "earlier_publish_time": before["publish_time"],
                "later_publish_time": after["publish_time"],
                "earlier_status": before["status"],
                "later_status": after["status"],
                "change_status": change_status,
            })
        return {
            "decision_date": decision_date,
            "delivery_date": earlier["delivery_date"],
            "earlier_cutoff_local": earlier_cutoff_local,
            "later_cutoff_local": later_cutoff_local,
            "earlier_cutoff_utc": iso(earlier_time),
            "later_cutoff_utc": iso(later_time),
            "snapshot_id": self.meta["snapshot_id"],
            "expected_count": earlier["expected_count"],
            "earlier_forecast_count": earlier["forecast_count"],
            "later_forecast_count": later["forecast_count"],
            "comparable_count": len(comparable_changes),
            "revised_vintage_count": revised,
            "value_changed_count": changed,
            "newly_available_count": newly_available,
            "became_unavailable_count": became_unavailable,
            "mean_absolute_change_mw": sum(comparable_changes) / len(comparable_changes) if comparable_changes else None,
            "max_absolute_change_mw": max(comparable_changes) if comparable_changes else None,
            "rows": rows,
        }

    def accuracy(self, decision_from: str, decision_to: str, cutoff_local: str = "09:00") -> dict:
        start, end = parse_decision(decision_from), parse_decision(decision_to)
        if end < start:
            raise ValueError("decision_to must not precede decision_from")
        paired_rows = []
        daily = []
        expected = present = actual_complete = 0
        current = start
        while current <= end:
            replay = self.replay(current.isoformat(), cutoff_local, include_actuals=True)
            rows = replay["rows"]
            expected += len(rows)
            present += replay["forecast_count"]
            actual_complete += sum(row["actual_mw"] is not None for row in rows)
            paired_rows.extend({"decision_date": current.isoformat(), "delivery_date": replay["delivery_date"], **row} for row in rows)
            errors = [row["error_mw"] for row in rows if row["error_mw"] is not None]
            daily.append({
                "decision_date": current.isoformat(),
                "delivery_date": replay["delivery_date"],
                "expected": len(rows), "matched": len(errors),
                "mae_mw": sum(abs(e) for e in errors) / len(errors) if errors else None,
                "bias_mw": sum(errors) / len(errors) if errors else None,
            })
            current += timedelta(days=1)
        errors = [row["error_mw"] for row in paired_rows if row["error_mw"] is not None]
        count = len(errors)
        hourly_groups = {hour: {"expected": 0, "forecast": 0, "actual": 0, "errors": []} for hour in range(24)}
        for row in paired_rows:
            group = hourly_groups[datetime.fromisoformat(row["target_local"]).hour]
            group["expected"] += 1
            group["forecast"] += row["forecast_mw"] is not None
            group["actual"] += row["actual_mw"] is not None
            if row["error_mw"] is not None:
                group["errors"].append(row["error_mw"])
        hourly = []
        for hour, group in hourly_groups.items():
            hour_errors = group["errors"]
            hourly.append({
                "hour_local": f"{hour:02d}:00", "expected": group["expected"],
                "forecast": group["forecast"], "actual": group["actual"],
                "matched": len(hour_errors),
                "mae_mw": sum(abs(e) for e in hour_errors) / len(hour_errors) if hour_errors else None,
                "bias_mw": sum(hour_errors) / len(hour_errors) if hour_errors else None,
            })
        return {
            "decision_from": start.isoformat(), "decision_to": end.isoformat(),
            "cutoff_local": cutoff_local, "snapshot_id": self.meta["snapshot_id"],
            "alignment_note": ALIGNMENT_NOTE,
            "expected_count": expected, "forecast_count": present,
            "actual_count": actual_complete, "matched_count": count,
            "forecast_coverage": present / expected if expected else 0,
            "matched_coverage": count / expected if expected else 0,
            "mae_mw": sum(abs(e) for e in errors) / count if count else None,
            "rmse_mw": math.sqrt(sum(e * e for e in errors) / count) if count else None,
            "bias_mw": sum(errors) / count if count else None,
            "daily": daily, "hourly": hourly, "rows": paired_rows,
        }


@lru_cache(maxsize=1)
def get_service() -> ReplayService:
    return ReplayService(load_snapshot())
