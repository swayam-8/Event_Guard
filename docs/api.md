# API guide

Base URL: `http://localhost:4000/api`. All successful responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`. List responses include `items`, `page`, `limit`, and `total`.

## Create a project

```sh
curl -X POST http://localhost:4000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"Orders API","description":"Order events"}'
```

Use the returned `data._id` as `PROJECT_ID` in the following examples.

## Register a schema and fixture

```sh
curl -X POST http://localhost:4000/api/projects/$PROJECT_ID/schemas \
  -H 'Content-Type: application/json' \
  -d '{"eventName":"order.created","version":1,"schema":{"type":"object","properties":{"orderId":{"type":"string"}},"required":["orderId"]}}'

curl -X POST http://localhost:4000/api/projects/$PROJECT_ID/fixtures \
  -H 'Content-Type: application/json' \
  -d '{"eventName":"order.created","schemaVersion":1,"payload":{"orderId":"ord_1"},"description":"Valid order"}'
```

Fixtures are validated against their declared version before they are saved. Use `POST /projects/:projectId/schemas/:schemaId/validate` with `{ "payload": {} }` to check an event payload. Use `POST /projects/:projectId/schemas/compare` with `{ "eventName": "order.created", "fromVersion": 1, "toVersion": 2 }` for compatibility findings.

## Run a check

Register schemas 1 and 2, then:

```sh
curl -X POST http://localhost:4000/api/projects/$PROJECT_ID/test-runs \
  -H 'Content-Type: application/json' \
  -d '{"eventName":"order.created","fromVersion":1,"toVersion":2}'
```

The API returns `202` and a queued run. Poll `GET /projects/:projectId/test-runs/:runId` until execution completes. Detailed findings are also available at `GET .../:runId/results`. Requests, route IDs, pagination, and payloads are validated; JSON request bodies are limited to 256 KB.

## Consumer handlers

The `handler` field must be one of `order-validation`, `payment-amount`, or `inventory-quantity`. Consumer `invariants` are declarative path conditions; supported operators are `equals`, `greaterThan`, and `exists`. Arbitrary JavaScript is never accepted or evaluated.
