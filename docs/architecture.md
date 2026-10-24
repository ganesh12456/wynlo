# Architecture and maintainability

## Boundaries

The React interface calls same-origin route controllers. Controllers validate through application services, which depend on small repository ports. An immutable indexed snapshot adapter supplies source records from the original compressed Elexon snapshot, loaded by `infrastructure/load-snapshot.ts`. The existing Python pilot is retained as an independent reference; the Next.js App Router runs the new TypeScript services on the Vercel Node.js runtime.

| Layer | Files | Responsibility |
| --- | --- | --- |
| Domain | `domain/types.ts`, `domain/time.ts` | Small contracts, business data types, date/cutoff rules, target hours and declared limitations |
| Application | `application/forecast-service.ts` | Reconstruct forecasts available at a cutoff; optionally reveal complete actuals |
| Application | `application/comparison-service.ts` | Compare two independently reconstructed forecast profiles |
| Application | `application/accuracy-service.ts` | Aggregate matched retrospective differences by day/hour |
| Infrastructure | `infrastructure/snapshot-repository.ts` | Index the immutable Elexon records; enforce conflicts and completeness at the source boundary |
| Composition | `infrastructure/services.ts` | Inject the snapshot adapter into services once per runtime |
| HTTP | `app/api/*/route.ts`, `infrastructure/http.ts` | Thin request/response adapters and consistent CSV/error serialization |
| Frontend data | `infrastructure/analysis-client.ts`, `hooks/use-analysis.ts` | Narrow transport contract, cancellation, loading, retry, stale-result protection |
| Presentation | `components/*`, `app/page.tsx` | Scoped workspace, review, provenance, chart and accessible dialog components |

## SOLID applied to the code

- **Single responsibility:** the HTTP adapter does not calculate forecast metrics; the chart does not fetch data; the data hook handles request lifecycle; individual analysis services own separate use cases.
- **Open/closed:** a future database or HTTP adapter can implement the existing repository ports. The services and chart do not need source-specific edits. The frontend client can be replaced without changing loading-state behavior.
- **Liskov substitution:** the application tests inject a minimal alternate forecast and actual repository. Results obey the same missing-value and unit contracts. No inheritance hierarchy is introduced merely to demonstrate the principle.
- **Interface segregation:** `ForecastRepository` exposes only `select`; `ActualRepository` exposes only `hour`; `AnalysisClient` exposes only `get`. Comparison/accuracy receive only the replay operation they use.
- **Dependency inversion:** application services accept ports instead of importing the concrete data source. A composition root owns the real adapter. The hook accepts a client contract instead of embedding the transport implementation in views.

## Data integrity

The actuals toggle changes a server request; the default replay response contains no actual values. The publication-comparison service calls replay without actuals. Source conflicts at the latest eligible publication are unavailable instead of silently replaced. A legitimate zero is a value, not a missing record. Numeric metrics use only matched values; their coverage denominator includes all expected hours.

The January-only time model is explicit: Europe/London is UTC+00:00 for the complete decision/delivery window. Extending the pilot into daylight-saving transitions requires timezone-aware local-day interval generation and tests for 23/25-hour days; simply changing date validation is insufficient.

## Privacy, scope and deployment

The dataset is a frozen copy of public Elexon records. There are no uploaded documents, personal data, external writes or trading actions. Decision notes are transient browser state. Collaboration, durable notes and live ingestion are outside this design implementation.

The redesign lives on `feat/wynlo-decision-studio`, based on the existing GitHub main branch. The original Python/Vite source files are retained for reproducibility. The branch root contains the new Next.js application and Vercel configuration. Deployment uses the exact branch commit without merging main. Runtime access continues to follow the existing Vercel project settings.
