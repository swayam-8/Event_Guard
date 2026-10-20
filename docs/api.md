# EventGuard REST API

Base URL: `http://localhost:4000/api`. The API uses JSON and returns a consistent envelope. Resource IDs must be 24-character MongoDB ObjectIds. Request bodies are limited to 256 KB.

## Health — `GET /health`

Returns 200 with `{ "success": true, "data": { "status": "ok", "database": "connected" } }` when MongoDB is connected, or 503 with database status `unavailable` otherwise.

## Response format and status codes

Success responses use `{ "success": true, "data": ... }`. Errors use `{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`. `details` contains field-level findings where available. Payload validation returns HTTP 200 with `valid: false`; fixture payload validation returns 422 because an invalid fixture is not stored. Invalid input is 400, missing resources are 404, duplicate resources and non-cancellable runs are 409, and successful deletes return 204 with no response body.

## Pagination

List endpoints accept `page` (default `1`) and `limit` (default `25`, maximum `100`). Both must be positive integers. List data is `{ "items": [], "page": 1, "limit": 25, "total": 0 }`. Resource list endpoints support `eventName`; fixtures also support `schemaVersion`.

## Projects

### Create — `POST /projects`

```json
{ "name": "Orders API", "description": "Order events" }
```

`name` is required (1–120 characters); `description` is optional (maximum 1,000 characters). Returns 201 with the project.

### List and retrieve

- `GET /projects?page=1&limit=25`
- `GET /projects/:projectId`

### Update — `PATCH /projects/:projectId`

Accepts one or both supported fields: `{ "name": "Orders v2", "description": "Updated" }`. Unknown fields and empty patches are rejected.

### Delete — `DELETE /projects/:projectId`

Returns 204. The service marks the project as deleting so new child-resource operations are rejected, then removes fixtures, consumers, schemas, test runs, and finally the project, sequentially. This works with standalone local MongoDB and needs no replica set transaction. If cleanup stops partway through, retrying the delete resumes cleanup; the parent record remains until the children are removed.

## Event schemas

JSON Schema documents are validated by Ajv configured for **JSON Schema Draft 2020-12**. Malformed documents return 400 with a `schemaDefinition` detail. A unique MongoDB index on `(projectId, eventName, version)` enforces version uniqueness; a duplicate returns 409, including races between simultaneous requests.

### Create — `POST /projects/:projectId/schemas`

```json
{
  "eventName": "order.created",
  "version": 1,
  "schemaDefinition": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": { "orderId": { "type": "string" } },
    "required": ["orderId"]
  }
}
```

### List and retrieve

- `GET /projects/:projectId/schemas?eventName=order.created&page=1&limit=25`
- `GET /projects/:projectId/schemas/:schemaId`

Every resource read is scoped to the project in the path. A schema in another project is reported as not found.

### Validate a payload — `POST /projects/:projectId/schemas/:schemaId/validate`

```json
{ "payload": { "orderId": "ord_1" } }
```

Returns 200 for both valid and invalid payloads, for example `{ "valid": false, "errors": [{ "path": "$", "keyword": "required", "message": "must have required property 'orderId'" }] }`.

### Compare versions — `POST /projects/:projectId/schemas/compare`

Provide IDs for schemas belonging to the same event in the same project, with the old version lower than the new version:

```json
{
  "oldSchemaId": "507f1f77bcf86cd799439011",
  "newSchemaId": "507f1f77bcf86cd799439012"
}
```

The result includes `compatible`, both schema IDs/versions, `preliminary: true`, and findings with `code`, `severity`, JSONPath `path`, `message`, `oldVersion`, and `newVersion`. The analyzer detects removed properties, newly required properties, narrowed primitive types, removed enum values, nested properties, and array item schemas. Changed constraints it does not analyze (such as `additionalProperties`, `minimum`, `pattern`, or composition/reference keywords) produce explicit warnings and set `compatible` to false. This is a conservative heuristic, not a proof of runtime compatibility.

## Consumers

### Create — `POST /projects/:projectId/consumers`

```json
{
  "name": "Billing service",
  "eventName": "order.created",
  "expectedSchemaVersion": 1,
  "handlerType": "order-validation",
  "enabled": true,
  "invariants": [{ "path": "amount", "operator": "greaterThan", "value": 0 }]
}
```

The event schema version must already exist in this project. `handlerType` must be `order-validation`, `payment-amount`, or `inventory-quantity`. Invariants are declarative data only: up to 20 path checks with `equals` (requires `value`), `greaterThan` (requires a number), or `exists`. Safe dot-paths are accepted; arbitrary functions and executable text are rejected. Consumer names are unique per project.

### List, update, and delete

- `GET /projects/:projectId/consumers?eventName=order.created&page=1&limit=25`
- `PATCH /projects/:projectId/consumers/:consumerId` (partial fields from the create shape)
- `DELETE /projects/:projectId/consumers/:consumerId` (204)

When changing `eventName` or `expectedSchemaVersion`, the resulting pair must reference a schema in the same project.

## Historical fixtures

### Create — `POST /projects/:projectId/fixtures`

```json
{
  "eventName": "order.created",
  "schemaVersion": 1,
  "payload": { "orderId": "ord_1" },
  "description": "Valid historical order"
}
```

`payload` must be a JSON object and must validate against the named schema in this project. A missing schema returns 400; an invalid event payload returns 422 with field-level details. A schema from another project cannot be referenced.

### List, retrieve, and delete

- `GET /projects/:projectId/fixtures?eventName=order.created&schemaVersion=1&page=1&limit=25`
- `GET /projects/:projectId/fixtures/:fixtureId`
- `DELETE /projects/:projectId/fixtures/:fixtureId` (204)

## Existing test-run API

Test-run endpoints remain available for the Phase 1 implementation; they require Redpanda/Kafka as well as MongoDB:

- `POST /projects/:projectId/test-runs` with `{ "eventName": "order.created", "fromVersion": 1, "toVersion": 2 }` (202)
- `GET /projects/:projectId/test-runs?page=1&limit=25`
- `GET /projects/:projectId/test-runs/:runId`
- `GET /projects/:projectId/test-runs/:runId/results`
- `POST /projects/:projectId/test-runs/:runId/cancel` (queued runs only)

The core project/schema/consumer/fixture APIs need MongoDB but do not connect to Kafka. Authentication and authorization are not implemented; do not expose this local development API to untrusted users.
