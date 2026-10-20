# Architecture

EventGuard separates the React/Vite browser client from the Express API and the background worker. MongoDB stores projects and test artifacts. KafkaJS and a Kafka-compatible broker will transport test-run jobs after the deterministic engine is in place.

## Current phase

The client is a navigable shell; the API connects to MongoDB and exposes a health check. CRUD routes, data models, and the worker are future phases. The UI must not fabricate data to imply those operations already work.

## Data and execution principles

- Every resource is scoped to a project.
- Schema compatibility findings are heuristic warnings; payload validation is deterministic.
- Consumer tests use a safe handler registry, never arbitrary submitted JavaScript.
- Test execution status is distinct from pass, warning, or fail outcomes.
- Persist run inputs and references so a report can be reproduced.
