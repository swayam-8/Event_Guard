# Testing and local verification

Run `npm test` for deterministic Vitest tests covering JSON Schema validation, compatible and breaking schema changes, registered handler behavior, invariant operator restrictions, project creation envelopes, malformed requests, and resource ID validation. Run `npm run lint` and `npm run build` for static checks and the frontend production bundle.

For a full local demo, run `docker compose up --build -d`, `npm install`, and `npm run seed`, then exercise the UI workflow in the root README. Check service state with `docker compose ps` and logs with `docker compose logs api worker redpanda mongodb`.

The tests do not require MongoDB or Redpanda. Broker retries, database persistence under process interruption, container networking, and browser workflows should also be verified against the Docker Compose stack before a production deployment.
