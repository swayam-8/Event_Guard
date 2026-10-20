# EventGuard project specification

EventGuard is a local developer tool for reviewing event-driven backend contract changes before deployment. This file records the current implemented foundation; see `docs/api.md` and `docs/architecture.md` for endpoint and architecture details.

## Implemented foundation

- Node.js ES module workspaces, an Express API, a React/Vite client, and local MongoDB/Redpanda Compose services.
- Project-scoped REST APIs for projects, versioned JSON Schemas, consumers, and historical event fixtures.
- MongoDB/Mongoose persistence with project-scoped uniqueness, schema validation, fixture validation, pagination, common errors, and cleanup behavior.
- Deterministic JSON Schema compatibility analysis in the old-valid-to-new-valid direction, with `compatible`, `analysisComplete`, structured findings, and conservative warnings for unsupported constructs.
- Historical fixture replay against source and target schemas, safe registered consumer handlers, declarative business invariants, and reproducible structured reports that separate execution status from outcome.
- A synchronous project-scoped test-run preview API that needs MongoDB but does not create a queued job or connect to Kafka.
- Existing asynchronous test-run API and worker code remain for the current full-project implementation. Those existing queued runs require Redpanda and the worker; Phase 3's preview path does not.

## Technical constraints

- Express, Mongoose, MongoDB, JavaScript ES modules, and Ajv Draft 2020-12 are used for the API and schema validation.
- API resources are always scoped to a project; error responses do not contain stack traces or database internals.
- Project deletion uses a deleting marker and ordered child cleanup, so it works with standalone MongoDB without transactions.
- JSON Schema validation explicitly supports Draft 2020-12. The compatibility engine covers selected constraints; unsupported schema constructs produce warnings, not guesses of safety.
- Compatibility checks schema acceptance only. Consumer compatibility is separately evaluated by the allowlisted handlers and invariants and cannot prove arbitrary application behavior.
- Authentication and authorization are not implemented. This is a local MVP and must not be exposed to untrusted users.

## Verification boundaries

Unit and API tests use isolated mocks by default. A live MongoDB connection and health check require MongoDB to be running locally. Docker Compose configuration is provided for local integration; full container startup must be verified on a host with a running Docker engine. The demo seed deliberately inserts synthetic invalid historical fixtures to demonstrate pre-existing invalid data and replay outcomes; REST fixture creation continues to reject invalid payloads.
