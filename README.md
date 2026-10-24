# Wynlo — Wind Decision Studio

A purpose-built UK energy procurement interface for replaying the wind outlook that was available at a historical decision time. This is a working full-stack design implementation, backed by the original frozen Elexon snapshot, rather than fabricated dashboard figures.

## Experience

1. Choose a January 2026 decision date and London cutoff in **Decision workspace**. The outlook covers the following calendar day.
2. Inspect the hourly forecast, peak and average output. Actual generation is hidden by default.
3. Use **Publication comparison** to inspect movement between two decision times. It never includes actual generation.
4. Open the source trace and export each hourly value with its publication time.
5. Prepare a **Decision brief**, add reviewer context and print or save a PDF through the browser. Source evidence is available as CSV. Notes are held only while the dialog is open; this pilot has no collaboration or persistent notes service.
6. Use **Performance review** after delivery to inspect MAE, RMSE, signed difference and matched-hour coverage. These are provisional comparisons because source population equivalence is unverified.

The built-in **Guide** storyboards the workflow for customers and reviewers. See [design storyboard](docs/design-storyboard.md) and [architecture](docs/architecture.md).

## Run and verify

Install the pinned pnpm version through Corepack, then use the checked-in lockfile:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

Node 22.13+ is required. The production build uses the Next.js App Router on Vercel’s Node.js runtime. No external database, credentials or live Elexon requests are required. API routes run server-side.

## Source data and business limits

- Original snapshot ID: `ca2d9d53a06147b6`.
- 18,688 WINDFOR forecast records; 1,488 FUELHH WIND half-hours.
- Decision window: 1–31 January 2026; delivery window: 2 January–1 February.
- Data imported unchanged from the existing pilot snapshot, with its metadata and SHA-256 source hashes retained.
- Exact-cutoff publications are included; future publications are excluded.
- A conflicting latest forecast remains unavailable. There is no fallback to an older or future publication.
- Actuals require two complete, consistent half-hours. Their mean forms the hourly value.
- Difference = actual MW − forecast MW. Metrics use matched hours only; coverage uses every expected delivery hour.
- WINDFOR and FUELHH generation populations may differ. Their equivalence has not been established. These statistics are not validated predictive skill, a calibrated risk band or a purchase recommendation.
- No demand, contracted position, prices, bids or non-wind generation is included. No trading execution is available.
- Public Elexon BMRS data: review applicable Elexon data terms before redistribution beyond the pilot.

## API

| Endpoint | Parameters | Result |
| --- | --- | --- |
| `/api/meta` | — | Snapshot metadata, sources, hashes and limitations |
| `/api/forecast` | `date`, `cutoff`, `actuals=true` (optional) | Hourly decision replay |
| `/api/comparison` | `date`, `earlier`, `later` | Cutoff comparison without actuals |
| `/api/accuracy` | `from`, `to`, `cutoff` | Retrospective metrics, daily and hourly summaries |
| `/api/export` | Replay parameters; or `view=compare`; or `view=accuracy` | Source CSV or daily metric CSV |

Validation returns a clear 422 error. No API has a write or execution action.

## Checks

Nine domain tests verify parity against the existing Python implementation for the default replay, cutoff comparison and full-month/hourly metrics; exact-cutoff inclusion; missing/conflicting source handling; complete actuals; default exclusion of actuals; January/date/time bounds; and substituted repository behavior. Browser QA covers replay, chart inspection, source trace, actuals toggle, comparison, brief, guide, performance, methodology and mobile navigation. Temporary responsive fixtures are removed before deployment.

The TypeScript model/metadata and real API outputs supply UI values. AI tools assisted implementation and documentation. No operational impact or business performance improvement is claimed.

## Vercel deployment

Deploy this branch from the repository root. `vercel.json` selects Next.js and runs the root build. The original Python backend and Vite frontend remain in `backend/` and `frontend/` as the reference implementation; Vercel serves the new root `app/` implementation on this branch.

`next.config.ts` includes `backend/data/snapshot.json.gz` in every API function’s file trace. The server decompresses the original committed snapshot once per runtime instance. No Elexon API key or database is needed. Confirm `/api/meta`, a replay and CSV export on the resulting deployment URL.
