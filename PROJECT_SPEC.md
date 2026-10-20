# EventGuard project specification

This repository follows the EventGuard product specification supplied by the project owner. The product is being implemented in phases; see [README.md](README.md) for verified current status and [docs/architecture.md](docs/architecture.md) for implementation boundaries.

## Phase 1 scope

- Node.js ES module workspaces for the API and React client.
- Express API with environment configuration, MongoDB connection, safe errors, and a health endpoint.
- Vite React shell with navigable feature areas and explicit planned states.
- Local MongoDB Docker Compose service and safe environment example.

CRUD routes, data models, compatibility analysis, fixture replay, broker processing, and reports are not claimed as implemented until their phases are completed and verified.
