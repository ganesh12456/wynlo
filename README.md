# Wind Window — January 2026 decision replay

A read-only pilot for a UK utility's day-ahead wind procurement team. Pick a January 2026 purchase decision date and a **user-chosen London-time cutoff** to see the Elexon wind forecast values available at that instant for the following delivery day. A separate retrospective view compares those values with Elexon FUELHH WIND generation and shows coverage, MAE, RMSE, and signed bias. This is a historical analysis, not a live trading signal or a purchase recommendation.

## Run it

**Docker** (single app on port 8000):

```sh
docker compose up --build
```

Open `http://localhost:8000`. Docker builds the React app and serves it with the Python API. The container uses the committed frozen data snapshot; it does not fetch Elexon at request time.

**Local development** (Python 3.12 and Node 22):

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt pytest httpx
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`; Vite proxies `/api` to the Python server. API documentation is at `http://localhost:8000/api/docs`.

## What it does

1. `scripts/build_snapshot.py` retrieves [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) forecasts by publication window and [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) actuals for WIND by settlement date. The raw responses and a compact, deterministic snapshot are committed for repeatability.
2. For each delivery hour on the **next London calendar day**, the API selects the latest WINDFOR `publishTime` **at or before** the chosen decision cutoff. Each target can have a different vintage; the UI warns when this happens. A missing or conflicting latest publication is shown as missing, never silently replaced with future knowledge.
3. Only on the retrospective view (or after a deliberate toggle) are actuals revealed. Two complete FUELHH half-hours are averaged into a UTC hourly MW value. An incomplete or conflicting pair is excluded from the error metrics.
4. Error is `actual MW − forecast MW`. MAE is mean absolute error, RMSE is root mean squared error, and signed bias is the mean error. Each metric uses only matched hours; coverage always uses the full expected delivery-hour denominator. The CSV export contains the exact paired rows and their publication timestamps.
5. **Cutoff comparison** replays one delivery day at two London decision times, showing which hourly forecast values and publication vintages changed. The audit table and CSV include both timestamps, values, and missing/conflicting states. This view never uses later actual generation.
6. The accuracy view also groups provisional MAE, bias, and coverage by London delivery hour, with an exact 24-hour table. It helps locate time-of-day differences without treating them as a calibrated forecast-risk band.

The 09:00 London default is an **illustrative decision cutoff**, not a claim about a market gate closure. Change it to the team's actual decision time. January 1–31 decisions cover January 2–February 1 delivery. All timestamps have an explicit UTC or Europe/London interpretation.

### Interpretation and limitations

The comparison assumes a WINDFOR hourly MW figure can be compared to the arithmetic mean of the two corresponding FUELHH half-hour MW figures. **The equivalence of the two series' generation populations has not been established**; large differences may be coverage or definition differences rather than forecast error. Do not turn the observed errors into a risk band, reserve requirement, or procurement quantity without validating the mapping with Elexon and the client. No demand, market prices, contracted position, bids, or non-wind generation are included.

This snapshot (`ca2d9d53a06147b6`) has 18,688 forecast records and 1,488 WIND actual half-hours. At 09:00 London for all 31 decisions, the implementation matches 744 of 744 expected hourly targets. The *provisional comparison under the stated assumption* gives MAE 2,038.9 MW, RMSE 2,504.8 MW and signed bias −1,747.9 MW. Those numbers are descriptive of the frozen data and alignment, not validated predictive skill. A refetch may change them if Elexon revises data.

## Data provenance and rebuild

The source request URLs, source response SHA-256 hashes, record counts and snapshot build time live in `backend/data/snapshot.json.gz` under `meta`; `/api/meta` exposes the non-hash fields. Source response hashes in this commit:

| Source | SHA-256 of uncompressed response |
| --- | --- |
| FUELHH WIND | `65402b5dde43a2bd28bb71edd345371a06006247e0e134ccba20c8ecfec93ba3` |
| WINDFOR | `f7531f5a839ead3516c4c713a9f8e310abd6bd3fc83b6f0f5ecb2e27d1cb53b2` |

Rebuild from the committed raw responses, without network access:

```sh
python scripts/build_snapshot.py --from-files
```

To fetch fresh copies of the two public Elexon streams and rebuild, run `python scripts/build_snapshot.py`. Review any changed row counts, snapshot ID, and metrics before committing. This pilot's snapshots are an attributed copy of Elexon BMRS data; review Elexon's applicable data terms before redistributing beyond the assignment.

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/src/App.tsx`, `styles.css` | React decision replay, accuracy, source trace and methodology views |
| `frontend/package.json`, `vite.config.ts` | Vite build and local API proxy |
| `backend/app/service.py` | Pure cutoff selection, cutoff comparison, interval alignment and metrics |
| `backend/app/main.py` | FastAPI endpoints and Docker static app serving |
| `backend/tests/` | Decision-time, conflict, completeness and API checks |
| `backend/data/snapshot.json.gz` | Frozen compact API dataset and provenance |
| `data/raw/` | Original Elexon JSON response bodies, gzip-compressed |
| `scripts/build_snapshot.py` | Reproducible source retrieval and snapshot transform |
| `Dockerfile`, `compose.yaml` | Container build and local launch |
| `vercel.json` | One-domain React + FastAPI deployment via Vercel Services |
| `.github/workflows/ci.yml` | Backend tests, frontend build and Docker build |

## API and checks

Endpoints: `GET /api/meta`, `/api/forecast?decision_date=2026-01-15&cutoff_local=09:00`, `/api/cutoff-impact?decision_date=2026-01-15&earlier_cutoff_local=07:00&later_cutoff_local=09:00`, `/api/cutoff-impact/export` with the same comparison parameters, `/api/accuracy?decision_from=2026-01-01&decision_to=2026-01-31&cutoff_local=09:00`, `/api/export` with the same range parameters, and `/api/health`. Invalid January dates, cutoffs, and reversed comparison cutoffs return 422.

```sh
PYTHONPATH=backend pytest -q backend/tests
cd frontend && npm ci && npm run build
```

The tests enforce no future-publication leakage, exact cutoff inclusion, missing and conflicting values, cutoff comparison, hourly aggregation, interval completeness, January bounds and both CSV exports. CI additionally builds the Docker image. Docker was not available in the author's current workspace, so its image is gated in GitHub Actions.

## Deployment and handoff

`vercel.json` uses Vercel Services beta to build `frontend/` as a Vite service and `backend/` as a Python FastAPI service with `/api/*` routing to the backend. Import this repository as a **new Vercel project with repository root as the project root**, then verify `/api/health`, a decision replay and the CSV export on the public production URL. The Docker deployment is independent of Vercel.

**Live app:** pending first deployment. Replace this line with the verified public Vercel URL before submission.

The assignment also requires a public, anonymously named GitHub repository; an unlisted YouTube video of at most 10 minutes with a client overview and technical handoff (each initial overview at most 5 minutes); and incognito verification of the repository, deployed app and video URLs before submitting the provided form. These external publication steps are not represented as complete here.

## AI assistance

AI tools were used to research the API and deployment shape, implement the React and Python code, draft this README, and propose tests. The Elexon data, source hashes and calculated metrics are from the actual retrieved responses; model-generated figures were not substituted for measurements.
