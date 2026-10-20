# EventGuard

EventGuard is a local developer tool for finding potentially unsafe changes to event-driven backends before deployment. It will register versioned event schemas, consumers, and historical fixtures, then run deterministic compatibility checks and replay fixtures against safe, predefined handlers.

> **Status:** Phase 1 starter. The API health endpoint, MongoDB connection, and navigable React shell are implemented. CRUD, compatibility checks, worker processing, and reports are planned, not yet available. EventGuard is a local development tool and is not production-ready for multiple untrusted customers.

## Prerequisites

- Node.js 20 or newer and npm
- Docker Desktop (for MongoDB)

## Quick start

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start MongoDB: `docker compose up -d mongodb`
3. Install packages: `npm install`
4. Start API and frontend: `npm run dev`
5. Open <http://localhost:5173>. The API health check is at <http://localhost:4000/api/health>.

The API reports `503` until MongoDB is reachable. Frontend navigation is present, but unfinished feature pages are explicitly marked as planned.

## Architecture

```text
React + Vite  ── REST/JSON ──>  Express API  ──> MongoDB
                                         └──> Kafka-compatible broker (planned)
                                                        │
                                                        v
                                               Separate worker (planned)
```

The API owns request validation and persistence. The worker will execute deterministic checks and store reproducible reports. KafkaJS and a Kafka-compatible broker will be introduced with asynchronous test runs; the MVP will not execute user-submitted JavaScript or depend on an AI service for test outcomes.

See [architecture notes](docs/architecture.md) and the original [project specification](PROJECT_SPEC.md).

## API

All API responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": ..., "message": ... } }`.

```sh
curl http://localhost:4000/api/health
```

`GET /api/health` returns `200` when MongoDB is connected and `503` when it is not. CRUD and test-run endpoints are planned.

## Demonstration workflow

The complete project workflow is not available yet. Once implemented, the demo will create a project, register two versions of an event schema, add a predefined consumer and historical fixtures, start a test run, and inspect a persisted report showing any breaking changes or replay failures.

## Tests and quality checks

- `npm test` — planned as Vitest unit and API integration suites.
- `npm run lint` — planned ESLint checks.
- `npm run build` — builds the frontend.
- `npm run format` — formats tracked project files with Prettier.

Phase 1 provides a production build; the remaining quality tooling and test suites will be added with their relevant implementation phases.

## Current limitations and security

- Only the health endpoint is implemented; the other API routes and all data workflows are planned.
- MongoDB and the broker must be available locally; the worker and Kafka-compatible broker are not part of this starter phase.
- There is no authentication, authorization, tenant isolation, rate limiting, or audit log. Do not expose this development service to untrusted users.
- Before public deployment, add authentication, authorization, tenant isolation, rate limiting, secure secret management, and appropriate audit logging.

## Development phases

1. Repository setup, configuration, database connection, health endpoint, and basic React layout.
2. Project, schema, consumer, and fixture CRUD APIs with validation and tests.
3. Deterministic compatibility engine and historical fixture runner.
4. Broker, worker, asynchronous test runs, and persisted reports.
5. Connect frontend workflows to the REST API.
6. Integration tests, Docker Compose, documentation, and end-to-end demo.
7. Security review, simplification, and clean local setup verification.
