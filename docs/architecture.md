# Architecture

Browser interactions call the same-origin `/api` namespace. Vercel routes those requests to the Python/FastAPI service. Next.js dynamically renders the page and owns the React presentation. There are no duplicate TypeScript analysis services or active Next.js API routes.

| Layer | Responsibility |
| --- | --- |
| `web/components` | Presentation and user interactions |
| `web/hooks/use-analysis.ts` | Request cancellation, loading/error states and retry |
| `web/infrastructure/analysis-client.ts` | Narrow replaceable HTTP client |
| `backend/app/main.py` | HTTP parameters, dependency injection, headers and response serialization |
| `backend/app/presentation.py` | Adapter between the Python analysis contract and frontend contract |
| `backend/app/service.py` | Immutable snapshot indexing, as-of selection, comparisons, interval alignment and metrics |

SOLID boundaries are practical: presentation does not access the data source; the HTTP adapter does not calculate metrics; the browser client does not implement backend rules. `StudioPresenter` depends on the read-only `WindAnalysis` protocol and FastAPI injects the presenter. Tests substitute a Python analysis implementation through the dependency boundary. The frontend request hook accepts an `AnalysisClient` contract.

`web/app/page.tsx` uses `force-dynamic`. FastAPI computes responses on request and sets `Cache-Control: no-store`; only the immutable source index is cached per Python instance. `/api/health` identifies the Python runtime. The historical dataset does not become a live feed merely because processing is dynamic.

Legacy parameter aliases remain available for the retained original Vite prototype. Presentation normalization supplies `daily[].date`, `hourly[].hour` and readable status labels used by the new interface. Actuals remain absent from the default replay and from publication comparison.

Vercel Services (beta) builds the Python and Next.js services independently and releases them together. `/api/*` routes to the backend before the frontend catch-all. During local development, Next.js proxies the same namespace to Uvicorn. Docker Compose supplies an equivalent two-service setup.

The pilot is read-only, uses public Elexon data and has no trade execution. Review notes are transient and there is no durable multi-user database. Source-population equivalence is unverified. Extending the January-only analysis across daylight-saving transitions requires local-day interval generation tests for 23/25-hour days.
