# Wynlo — dynamic Next.js + Python/FastAPI

Wynlo reconstructs the wind forecast available at a historical procurement decision time. The application now runs a **React/Next.js frontend** and a **Python/FastAPI backend**. No forecast calculation is performed by a Next.js API handler.

## Static or dynamic?

The earlier interface used a prerendered Next.js page with dynamic TypeScript API handlers. This version renders `/` dynamically (`force-dynamic`) and sends browser requests to FastAPI. Python selects publication vintages, aligns actual generation, computes metrics and creates CSV exports on request. API responses carry `X-Wynlo-Backend: python-fastapi` and `Cache-Control: no-store`.

The **data source remains historical**: a frozen January 2026 Elexon snapshot. Dynamic execution does not imply a live data feed. There is no database or durable multi-user state in this pilot; review notes remain transient browser state. No demand, positions, prices or trading actions are included.

## Run locally

Node.js 24 and Python 3.12 are supported.

```sh
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:3000`. Next.js forwards `/api/*` to FastAPI on port 8000 during local development. Interactive API documentation: `http://127.0.0.1:8000/api/docs`.

On Windows, use `.venv\Scripts\python.exe` to install the Python packages. The startup script recognizes that interpreter too. Alternatively, run the two services in separate terminals:

```sh
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
pnpm --dir web dev
```

Alternatively, `docker compose up --build` exposes the same Next.js frontend on port 3000 and FastAPI on port 8000.

## Verify

```sh
PYTHONPATH=backend .venv/bin/python -m pytest -q backend/tests
pnpm typecheck
pnpm test:integration
pnpm build
```

The Python suite verifies publication cutoffs, conflicts, interval completeness, metric parity, frontend API contracts, validation, CSV exports and dependency substitution. The Next.js build identifies `/` as a dynamic server-rendered route. CI tests the Python backend, type-checks/builds Next.js and builds both Docker images.

## Deployment

`vercel.json` uses **Vercel Services (beta)** to deploy `web/` and `backend/` together. Ordered routes send `/api/*` to FastAPI and all other paths to Next.js. Both services share the deployment origin, so browser requests need no cross-origin configuration or API keys. Source and backend deploy atomically from the same Git commit.

There are no database credentials or mandatory environment secrets. `FASTAPI_ORIGIN` is optional for local/custom reverse-proxy deployments; Vercel uses service routing. Do not set a preview API hostname in client source code.

## Experience

Set a decision date/cutoff → inspect the next-day hourly profile → compare publication times → inspect source timestamps → prepare a brief and download evidence. Use Performance review for a qualified retrospective comparison with actual output. The Guide storyboards the workflow; Data & methodology retains source counts, hashes and limitations.

## Source data and limits

- Snapshot: `ca2d9d53a06147b6`, with 18,688 WINDFOR records and 1,488 FUELHH WIND half-hours.
- Decisions: 1–31 January 2026; next-day delivery: 2 January–1 February.
- Exact-cutoff publications are included; future publications are excluded. A conflicting latest publication remains unavailable.
- Two complete, consistent half-hours form an hourly actual mean.
- Difference = actual MW − forecast MW. Metrics use matched hours; coverage includes every expected hour.
- WINDFOR/FUELHH population equivalence is unverified. Differences are provisional, not validated forecast skill or purchase recommendations.
- Source: public Elexon BMRS data. Review Elexon’s applicable terms before redistribution beyond the pilot.

## Repository map

| Path | Responsibility |
| --- | --- |
| `web/app/` | Dynamic Next.js page and application layout |
| `web/components/` | React workspace, charts, source audit, review and dialogs |
| `web/hooks/`, `web/infrastructure/` | Browser request lifecycle and typed HTTP client |
| `web/domain/types.ts` | Frontend API contracts only |
| `backend/app/main.py` | FastAPI routes, validation/error responses, exports and runtime headers |
| `backend/app/presentation.py` | Maps Python analysis results to the frontend contract |
| `backend/app/service.py` | Deterministic Python analysis and snapshot repository |
| `backend/data/` | Original compressed snapshot with provenance |
| `backend/tests/` | Domain and HTTP contract tests |
| `scripts/dev.mjs` | Starts both local services |
| `frontend/` | Retained original Vite reference; not deployed by this configuration |
| `docs/` | Architecture and business storyboard |

AI tools assisted implementation and documentation. Numeric values are calculated from the actual retained Elexon records; no business performance gains are claimed.
