# Test-run publication and worker lifecycle

## Publication outbox

Creating a run first persists a `queued` document in MongoDB with its immutable input snapshot. The API then sends a v1 Kafka message containing the run ID, project ID, and creation time. Once Kafka confirms the send, `queuePublishedAt` is set.

If Kafka is unavailable, the run remains queued with `queueError`, `queueAttempts`, and a backoff timestamp. The API returns the persisted run (`202 Accepted`) and an API-side outbox sweep retries eligible records every five seconds. The outbox survives API restarts because MongoDB is authoritative. A crash after send but before marking publication can emit a duplicate; worker claims make duplicate delivery safe. Backoff starts at one second and doubles to a one minute cap.

## Processing state machine

```text
queued -> running -> completed
                   -> queued (transient processing failure, below attempt limit)
                   -> failed (processing failure at attempt limit)
queued -> cancelled
```

Execution status describes whether the job ran. `outcome` (`pass`, `warning`, or `fail`) describes deterministic checks. A completed run may have outcome `fail`. User cancellation is supported while queued; once the worker claims a run it is not cancellable.

The worker validates message version, ObjectId formats, and timestamp before looking up authoritative run data. Malformed messages and references to missing or mismatched runs are copied to `<topic>.dlq` before their offsets are committed. It claims work with one conditional MongoDB update from `queued` to `running`, incrementing `attempts`. A duplicate sees a running or terminal record and does not execute or overwrite it.

The worker executes the shared Phase 3 compatibility/replay engine against the saved snapshot, writes the report and terminal state, then commits the Kafka offset. Processing is bounded by `WORKER_MAX_ATTEMPTS` (default 3). A processing exception returns the run to `queued` below the limit; at the limit it persists `failed`, a safe error message, and completion time. Kafka redelivery may then observe the terminal state and acknowledge without changing it. Infrastructure failures that prevent MongoDB persistence are left unacknowledged for Kafka consumer retry; the worker does not claim a successful result in that case.

SIGINT/SIGTERM stops consumption before disconnecting Kafka and MongoDB. The local MVP has no dashboard for inspecting or replaying the dead-letter topic.
