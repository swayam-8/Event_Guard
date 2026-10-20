# Testing and local verification

From the repository root, run:

```sh
npm test
npm run lint
npm run build
```

The root `npm test` command runs both backend and frontend suites. Latest Phase 4 verification: backend tests passed (65, with 1 optional MongoDB test skipped), frontend tests passed (4); `npm run lint`, `npm run build`, `docker compose config --quiet`, and `git diff --check` passed. Docker Compose startup and the real Kafka/Mongo/UI end-to-end flow were not run because the Docker Desktop engine was unavailable.

The default Vitest suite is deterministic and isolated. API endpoint tests, including synchronous preview, use Supertest with mocked persistence. Engine tests cover old-to-new compatibility direction, unknown schema constructs, fixture source/target validation, pre-existing invalid fixtures, cross-project rejection, built-in handlers, invariant outcomes, report statuses, payload immutability, and the versioned worker-message contract without starting MongoDB, Kafka, or the frontend.

To manually preview a run against the seeded sample project, find its ID from `GET /api/projects`, then send:

```sh
curl -s -X POST http://localhost:4000/api/projects/PROJECT_ID/test-runs/preview \
  -H 'Content-Type: application/json' \
  -d '{"eventName":"order.created","fromVersion":1,"toVersion":2}'
```

This endpoint returns a completed synchronous report and does not create an asynchronous run. Use `order.note` for a compatible optional-field change, `order.updated` for an older consumer invariant failure, `payment.authorized` for a pre-existing negative payment, `inventory.changed` for an invalid quantity, and `legacy.imported` for a pre-existing source-invalid fixture.

## Live MongoDB integration test

An opt-in integration test verifies real Mongoose writes, unique indexes, schema and fixture validation, compatibility comparison, and ordered project cleanup. It runs only when `MONGODB_TEST_URI` points to a database whose name contains `test`; it does not drop the database. The test creates and removes only its uniquely named project and children.

PowerShell:

```powershell
$env:MONGODB_TEST_URI = 'mongodb://localhost:27017/eventguard_test'
npm test
```

POSIX shell:

```sh
MONGODB_TEST_URI=mongodb://localhost:27017/eventguard_test npm test
```

For a local MongoDB container, start it with `docker compose up -d mongodb`. Full application and worker checks require the complete Compose stack (`docker compose up --build -d`) and should be followed by `docker compose ps` and service log review. Test-run processing also requires Redpanda; core CRUD tests do not. The container end-to-end flow has not been run in environments without a Docker engine.
