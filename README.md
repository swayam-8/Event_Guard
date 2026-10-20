# EventGuard

EventGuard is a local developer platform for finding potentially unsafe changes to event-driven backend systems before deployment. Register versioned JSON Schemas, consumers using a safe handler registry, and historical event fixtures. Queue deterministic checks through Redpanda, replay saved events in a separate worker, and inspect persisted reports before shipping a schema change.

> EventGuard is a local development MVP. It is not production-ready for multiple untrusted customers. Do not expose it publicly without authentication, authorization, tenant isolation, rate limiting, secure secret management, and audit logging.

## Prerequisites

- Node.js 20 or newer and npm
- Docker Desktop with Docker Compose

## Start the full local stack

```sh
docker compose up --build -d
npm install
npm run seed
```

Open the dashboard at <http://localhost:5173>. The API is at <http://localhost:4000/api> and the health endpoint is <http://localhost:4000/api/health>.

The demo seed is safe to run more than once. It creates synthetic schemas, consumers, and historical events for compatible optional-field additions, newly required fields, removed consumer fields, invalid payments, invalid inventory quantities, and a pre-existing invalid fixture. A few demo fixtures are intentionally invalid and are inserted by the seed to demonstrate replay classification; the REST fixture-create endpoint still rejects invalid payloads.

To stop the stack, run `docker compose down`. Use `docker compose down -v` only when you intentionally want to remove local MongoDB and Redpanda data.

### Run services directly with Node

Start infrastructure first:

```sh
docker compose up -d mongodb redpanda
npm install
npm run seed
npm run dev
```

`npm run dev` starts the API, Kafka worker, and Vite client. Copy `.env.example` to `.env` to override the local defaults. The web UI only accepts the configured CORS origin (`CORS_ORIGIN`, default `http://localhost:5173`).

### Run only the core REST API

The Projects, Event schemas, Consumers, and Historical fixtures APIs require MongoDB but do not require Redpanda or the worker:

```sh
docker compose up -d mongodb
npm install
npm run dev:server
```

The API listens at `http://localhost:4000/api`; check database readiness with `GET /api/health`. Run `npm test` and `npm run lint` from the repository root. API tests use isolated mocked persistence by default. For the opt-in real MongoDB persistence test, set `MONGODB_TEST_URI` to a separate test database (its database name must contain `test`); see [docs/testing.md](docs/testing.md). Full containerized verification requires Docker Desktop to be running.

## Architecture

```text
React / Vite ── REST/JSON ──> Express API ──> MongoDB
                                      │
                                      └── KafkaJS ──> Redpanda
                                                        │
                                                        v
                                               EventGuard worker
                                                        │
                                                        └──> MongoDB report
```

- **API:** validates input, scopes every resource query to its project, persists immutable run inputs, and publishes a versioned run/project message through a Mongo-backed outbox.
- **MongoDB:** stores projects, schemas, consumers, fixtures, run snapshots, and reports. Indexes enforce schema version and resource uniqueness.
- **Worker:** validates a versioned job envelope, claims queued runs atomically, reuses the Phase 3 engine, executes built-in handlers, checks declarative invariants, and persists detailed results before acknowledging Kafka.
- **Broker:** Kafka-compatible Redpanda transports jobs. The Mongo-backed outbox retries publications after failure or API restart. Processing is idempotent for duplicate delivery; execution retries are bounded by `WORKER_MAX_ATTEMPTS` (default three). Malformed jobs are preserved in the `.dlq` topic.
- **Frontend:** provides project, schema, consumer, fixture, and test-run workflows using live API data. It polls queued/running runs and displays execution status separately from test outcome.

Schema comparison findings are deterministic heuristics, not proof of application compatibility. Payload validity and registered handler outcomes are deterministic.

See [architecture](docs/architecture.md), [API guide](docs/api.md), and [testing guide](docs/testing.md).

## Demonstration workflow

1. Open **Projects** and select `EventGuard Demo`.
2. Open **Event schemas** and confirm `order.created` versions 1 and 2 are present.
3. Open **Consumers** and confirm the `Order fulfillment` consumer.
4. Open **Historical fixtures** and inspect the v1 and v2 events.
5. Preview `order.created` with versions `1` and `2` to inspect the new required `currency` field and the old decimal event failing v2 validation.
6. Preview `order.note` versions `1` and `2` for the compatible optional-field case, or `order.updated` versions `1` and `2` to see the older consumer's missing `customerId` invariant fail.

For a direct API check:

```sh
curl -s http://localhost:4000/api/health
curl -s http://localhost:4000/api/projects
curl -s -X POST http://localhost:4000/api/projects/PROJECT_ID/test-runs/preview -H "Content-Type: application/json" -d '{"eventName":"order.created","fromVersion":1,"toVersion":2}'
```

API responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": ..., "message": ... } }`. List endpoints accept `page` and `limit` (maximum 100).

## Development commands

| Command          | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `npm run dev`    | API, worker, and client in watch mode; start MongoDB and Redpanda first |
| `npm run dev:server` | API only |
| `npm run dev:worker` | Background worker only |
| `npm run dev:client` | Vite frontend only |
| `npm run build`  | Production build of the React dashboard                                 |
| `npm test`       | Vitest unit and API integration suites                                  |
| `npm run lint`   | ESLint across API, tests, and client                                    |
| `npm run format` | Format project files with Prettier                                      |
| `npm run seed`   | Idempotently seed the local demonstration project                       |

## API overview

- `GET /api/health`
- Projects: `POST/GET /api/projects`, `GET/PATCH/DELETE /api/projects/:projectId`
- Schemas: create/list/get under `/api/projects/:projectId/schemas`; validate with `POST .../:schemaId/validate`; compare with `POST .../compare`
- Consumers: create/list/get/patch/delete under `/api/projects/:projectId/consumers`
- Fixtures: create/list/get/delete under `/api/projects/:projectId/fixtures`
- Test runs: create/list/get under `/api/projects/:projectId/test-runs`; results at `/:runId/results`; cancel queued runs at `/:runId/cancel`
- Synchronous engine preview: `POST /api/projects/:projectId/test-runs/preview` (MongoDB only; no Kafka job is created)

All child-resource operations are scoped to the requested project. Test-run outcomes (`pass`, `warning`, `fail`) are distinct from execution statuses (`queued`, `running`, `completed`, `failed`, `cancelled`). A completed run with findings has completed execution status and a fail or warning outcome.

## Current limitations

- Local development only: there is no authentication, authorization, multi-tenant isolation, rate limiting, or durable audit log.
- Consumer handlers are predefined; users cannot upload code. Invariants use the explicit safe allowlist documented in [the API guide](docs/api.md).
- Compatibility analysis proves only selected JSON Schema changes; warnings mark unsupported constructs and the engine does not prove consumer behavior beyond registered handlers and invariants.
- Worker execution is at-least-once from Kafka with database state guards and three processing attempts. The local MVP does not include an admin UI for inspecting or replaying dead-letter messages.
- Automated coverage includes deterministic engine and worker-message tests plus API endpoint tests. Full containerized end-to-end verification depends on Docker services being available.
- GitHub Actions integration is a future milestone; the REST API provides a foundation for CI checks.
