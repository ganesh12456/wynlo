"""Fetch and freeze the two public Elexon streams used by the pilot.

Run from the repository root: python scripts/build_snapshot.py
For an offline rebuild from audited responses: python scripts/build_snapshot.py --from-files
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUTPUT = ROOT / "backend" / "data" / "snapshot.json.gz"
BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
QUERIES = {
    "fuelhh": ("FUELHH", {"settlementDateFrom": "2026-01-02", "settlementDateTo": "2026-02-01", "fuelType": "WIND"}),
    "windfor": ("WINDFOR", {"publishDateTimeFrom": "2025-12-31T00:00:00Z", "publishDateTimeTo": "2026-02-01T00:00:00Z"}),
}


def source_url(name: str) -> str:
    dataset, params = QUERIES[name]
    return f"{BASE}/{dataset}/stream?{urlencode(params)}"


def fetch(url: str) -> bytes:
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "wind-decision-replay/1.0"})
            with urllib.request.urlopen(req, timeout=90) as response:
                return response.read()
        except (TimeoutError, urllib.error.URLError) as exc:
            if attempt == 3:
                raise RuntimeError(f"Elexon retrieval failed: {url}") from exc
            time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def main(from_files: bool) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    rows = {}
    hashes = {}
    for name in ("fuelhh", "windfor"):
        path = RAW / f"{name}.json.gz"
        if from_files:
            with gzip.open(path, "rb") as file:
                payload = file.read()
        else:
            payload = fetch(source_url(name))
            with path.open("wb") as file:
                file.write(gzip.compress(payload, compresslevel=9, mtime=0))
        records = json.loads(payload)
        if not isinstance(records, list) or not records:
            raise ValueError(f"{name} response is empty or not a list")
        rows[name] = records
        hashes[name] = hashlib.sha256(payload).hexdigest()
    forecasts = [
        {key: row[key] for key in ("startTime", "publishTime", "generation")}
        for row in rows["windfor"] if row.get("dataset") == "WINDFOR"
    ]
    actuals = [
        {key: row[key] for key in ("startTime", "publishTime", "generation", "fuelType")}
        for row in rows["fuelhh"] if row.get("dataset") == "FUELHH" and row.get("fuelType") == "WIND"
    ]
    forecasts.sort(key=lambda row: (row["startTime"], row["publishTime"], row["generation"]))
    actuals.sort(key=lambda row: (row["startTime"], row["publishTime"], row["generation"]))
    canonical = json.dumps({"forecasts": forecasts, "actuals": actuals}, sort_keys=True, separators=(",", ":")).encode()
    snapshot_id = hashlib.sha256(canonical).hexdigest()[:16]
    snapshot = {
        "meta": {
            "snapshot_id": snapshot_id,
            "snapshot_built_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source_urls": {key: source_url(key) for key in QUERIES},
            "source_sha256": hashes,
            "counts": {"forecast_rows": len(forecasts), "actual_half_hours": len(actuals)},
            "note": "Public Elexon BMRS WINDFOR and FUELHH WIND. See README for licence and interval caveats.",
        },
        "forecasts": forecasts,
        "actuals": actuals,
    }
    OUTPUT.write_bytes(gzip.compress(json.dumps(snapshot, separators=(",", ":")).encode(), compresslevel=9, mtime=0))
    print(json.dumps({"path": str(OUTPUT), "snapshot_id": snapshot_id, "counts": snapshot["meta"]["counts"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-files", action="store_true", help="Use the already fetched gzip responses in data/raw")
    args = parser.parse_args()
    main(args.from_files)
