# Architecture

## Process boundaries

The React/Vite client talks to an Express REST API. The API validates and persists resources in MongoDB, snapshots inputs for a test run, and publishes only the run ID to Kafka. A separate worker loads the persisted snapshot, executes deterministic checks, and writes an idempotent report. Redpanda provides the local Kafka-compatible broker.

## Trust and project isolation

Every child-resource query includes `projectId`; APIs first validate that the project exists. Mongoose schemas constrain required values and unique project-scoped records. JSON Schema payloads and requests are size limited. Consumer logic is selected by allowlisted handler IDs; invariant expressions contain only safe path/operator/value data and are never executed as code.

The API returns structured errors without stack traces and logs operational context without logging payloads. CORS is restricted to the configured UI origin. This local MVP has no identity boundary; do not expose it to untrusted users.

## Test-run lifecycle

`queued → running → completed` or `failed`; a queued run can also become `cancelled`. Outcome (`pass`, `warning`, `fail`) is separate from execution status. `inputSnapshot` contains schema documents, consumers, and historical fixture payloads, so later edits do not change an existing run. Kafka delivery is at least once; an atomic conditional status update claims a run once, preventing duplicate results. Transient processing errors return the run to `queued` for up to three attempts. Malformed messages are copied to `<topic>.dlq` and committed, preserving the original message. Results and errors are persisted before committing a successful broker offset.

## Deterministic engine

AJV validates schema documents and event payloads. Schema comparison reports heuristics for newly required fields, removed properties, and narrowed types, with paths and explanations. These findings are not proof of application compatibility. Historical fixtures are checked against their declared schema and target version, then each applicable enabled consumer handler and declarative invariant is run. Reports capture exact fixture/consumer IDs, schema versions, findings, counts, outcome, execution status, and duration.

## Operational limits

Docker Compose runs MongoDB, Redpanda, API, worker, and client. API and worker are independent processes and can be scaled separately later; no distributed locks, Redis, Kubernetes, GraphQL, or microservice-per-feature architecture is used. Before a public multi-user deployment, add authentication, authorization, tenant isolation, rate limiting, secrets management, audit logging, and deployment-level monitoring.
