# EventGuard project specification

EventGuard is a local developer tool for reviewing event-driven backend contract changes before deployment. This file records the current implemented foundation; see `docs/api.md` and `docs/architecture.md` for endpoint and architecture details.

## Implemented foundation

- Node.js ES module workspaces, an Express API, a React/Vite client, and local MongoDB/Redpanda Compose services.
- Project-scoped REST APIs for projects, versioned JSON Schemas, consumers, and historical event fixtures.
- MongoDB/Mongoose persistence with project-scoped uniqueness, schema validation, fixture validation, pagination, common errors, and cleanup behavior.
- Preliminary schema compatibility analysis, declarative consumer invariants, and registered handler IDs. User-supplied executable code is not accepted.
- Existing asynchronous test-run API and worker code remain in the repository from the later full-project implementation. Core CRUD APIs run without Kafka; test-run processing requires Redpanda and the worker.

## Technical constraints

- Express, Mongoose, MongoDB, JavaScript ES modules, and Ajv Draft 2020-12 are used for the API and schema validation.
- API resources are always scoped to a project; error responses do not contain stack traces or database internals.
- Project deletion uses a deleting marker and ordered child cleanup, so it works with standalone MongoDB without transactions.
- Compatibility findings are conservative heuristics, not a proof of runtime compatibility.
- Authentication and authorization are not implemented. This is a local MVP and must not be exposed to untrusted users.

## Verification boundaries

Unit and API tests use isolated mocks by default. A live MongoDB connection and health check require MongoDB to be running locally. Docker Compose configuration is provided for local integration; full container startup must be verified on a host with a running Docker engine.
