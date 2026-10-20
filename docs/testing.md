# Testing and local verification

From the repository root, run:

```sh
npm test
npm run lint
npm run build
```

The default Vitest suite is deterministic and isolated. API endpoint tests use Supertest with mocked persistence; schema, model, invariant, and worker-engine tests run without a service dependency.

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

For a local MongoDB container, start it with `docker compose up -d mongodb`. Full application and worker checks require the complete Compose stack (`docker compose up --build -d`) and should be followed by `docker compose ps` and service log review. Test-run processing also requires Redpanda; core CRUD tests do not.
