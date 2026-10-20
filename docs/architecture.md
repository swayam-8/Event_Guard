# Architecture

## Process boundaries

The React/Vite client talks to an Express REST API. The API validates and persists resources in MongoDB, snapshots inputs for a test run, and publishes only the run ID to Kafka. A separate worker loads the persisted snapshot, executes deterministic checks, and writes an idempotent report. Redpanda provides the local Kafka-compatible broker.

## Trust and project isolation

Every child-resource query includes `projectId`; APIs first validate that the project exists. Mongoose schemas constrain required values and unique project-scoped records. JSON Schema payloads and requests are size limited. Consumer logic is selected by allowlisted handler IDs; invariant expressions contain only safe path/operator/value data and are never executed as code.

The API returns structured errors without stack traces and logs operational context without logging payloads. CORS is restricted to the configured UI origin. This local MVP has no identity boundary; do not expose it to untrusted users.

## Test-run lifecycle

`queued → running → completed` or `failed`; a queued run can also become `cancelled`. Outcome (`pass`, `warning`, `fail`) is separate from execution status. `inputSnapshot` contains schema documents, consumers, and historical fixture payloads, so later edits do not change an existing run. Kafka delivery is at least once; an atomic conditional status update claims a run once, preventing duplicate results. Transient processing errors return the run to `queued` for up to three attempts. Malformed messages are copied to `<topic>.dlq` and committed, preserving the original message. Results and errors are persisted before committing a successful broker offset.

## Deterministic engine

The pure worker engine is split into `compatibilityEngine.js`, `fixtureRunner.js`, `invariantChecker.js`, `reportBuilder.js`, and `handlers/handlerRegistry.js`. The shared registry remains the canonical handler allowlist for both Mongoose/API validation and execution. Inputs are ordinary objects; database reads remain in the server service. The synchronous preview endpoint preloads all event schemas, fixtures, and consumers for one project, then passes them to the pure runner without creating a queued record.

AJV uses JSON Schema Draft 2020-12 for schema documents and event payloads. Compatibility asks whether all old-valid values remain valid under the new schema. Proven validation failures are errors; unsupported constructs such as composition/reference keywords and incompletely analyzed constraints generate warnings and make `analysisComplete` false. Removed declarations are informational if the new schema still permits additional properties, because consumer reliance is a separate test. Findings sort by path, code, severity, and message.

Historical fixtures are checked against their declared schema and target version. Source-invalid fixtures are labeled pre-existing and do not count by themselves as target regressions. They can still produce confirmed consumer or invariant failures. Applicable enabled registered handlers and declarative invariants run sequentially; no user JavaScript, network requests, or AI decisions are involved. The runner rejects cross-project fixture input, skips missing source schemas with a finding, and never mutates payloads.

Reports identify project, event, schema versions, fixture IDs, and consumer IDs without copying payloads. Execution status is `completed` independently of outcome. Outcome is `fail` for confirmed compatibility/consumer failures, `warning` for incomplete analysis, skipped checks, or pre-existing invalid fixtures, and `pass` when applicable checks finish without findings. Repeated inputs produce the same ordered findings and results, apart from timestamps and measured duration.

## Operational limits

Docker Compose runs MongoDB, Redpanda, API, worker, and client. API and worker are independent processes and can be scaled separately later; no distributed locks, Redis, Kubernetes, GraphQL, or microservice-per-feature architecture is used. Before a public multi-user deployment, add authentication, authorization, tenant isolation, rate limiting, secrets management, audit logging, and deployment-level monitoring.
