# EventGuard

EventGuard is a local developer tool for finding potentially unsafe changes to event-driven backend systems before deployment. Register versioned JSON Schemas, consumers using a safe handler registry, and historical event fixtures. Run deterministic checks and inspect persisted reports before shipping a schema change.

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

The demo seed is safe to run more than once. It creates an `EventGuard Demo` project with `order.created` schema versions 1 and 2, an order-validation consumer, and representative historical fixtures. Its v1 decimal order is valid under v1 but fails v2 validation, which demonstrates deterministic replay. The `fixtures/order-created-v2-breaking.json` payload is an intentionally invalid payload for trying the schema validation endpoint; invalid payloads cannot be saved as fixtures.

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

- **API:** validates input, scopes every resource query to its project, persists immutable run inputs, and publishes only a test-run ID to Kafka.
- **MongoDB:** stores projects, schemas, consumers, fixtures, run snapshots, and reports. Indexes enforce schema version and resource uniqueness.
- **Worker:** claims queued runs atomically, validates snapshots with AJV, compares schema shapes, executes built-in handlers, checks declarative invariants, and persists detailed results.
- **Broker:** Kafka-compatible Redpanda transports jobs. Processing is idempotent for duplicate delivery; failed processing is retried up to three times. Malformed jobs are preserved in the `.dlq` topic.
- **Frontend:** calls the REST API and polls queued/running test runs. It displays API errors and empty states rather than substituting fake records.

Schema comparison findings are deterministic heuristics, not proof of application compatibility. Payload validity and registered handler outcomes are deterministic.

See [architecture](docs/architecture.md), [API guide](docs/api.md), and [testing guide](docs/testing.md).

## Demonstration workflow

1. Open **Projects** and select `EventGuard Demo`.
2. Open **Event schemas** and confirm `order.created` versions 1 and 2 are present.
3. Open **Consumers** and confirm the `Order fulfillment` consumer.
4. Open **Historical fixtures** and inspect the v1 and v2 events.
5. Open **Test runs**, use event name `order.created`, versions `1` and `2`, and start a run.
6. Wait for the report to complete. It should show a compatibility warning for the new required `currency` field and a failed replay of the old decimal event against v2.

For a direct API check:

```sh
curl -s http://localhost:4000/api/health
curl -s http://localhost:4000/api/projects
```

API responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": ..., "message": ... } }`. List endpoints accept `page` and `limit` (maximum 100).

## Development commands

| Command          | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `npm run dev`    | API, worker, and client in watch mode; start MongoDB and Redpanda first |
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

All child-resource operations are scoped to the requested project. Test-run outcomes (`pass`, `warning`, `fail`) are distinct from execution statuses (`queued`, `running`, `completed`, `failed`, `cancelled`). A completed run with findings has completed execution status and a fail or warning outcome.

## Current limitations

- Local development only: there is no authentication, authorization, multi-tenant isolation, rate limiting, or durable audit log.
- Consumer handlers are predefined; users cannot upload code. Invariants support only `equals`, `greaterThan`, and `exists` path checks.
- Compatibility analysis covers common required-field, removed-property, and narrowed-type changes; it does not prove full behavioral compatibility.
- Worker execution is at-least-once from Kafka with database state guards and three processing attempts. The local MVP does not include an admin UI for inspecting or replaying dead-letter messages.
- Automated coverage focuses on the schema engine, handlers, and API validation. Full containerized end-to-end verification depends on Docker services being available.
- GitHub Actions integration is a future milestone; the REST API provides a foundation for CI checks.
