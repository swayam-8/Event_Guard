import {
  Consumer,
  EventFixture,
  EventSchema,
  TestRun,
} from '../../../shared/src/models.js';
import { enqueueTestRun } from './testRunQueue.js';
import {
  HttpError,
  pagination,
  validateObjectId,
} from '../utils/http.js';
import { requireProject } from './resourceService.js';
import { EngineInputError, replayFixtures } from '../../../worker/src/engine/fixtureRunner.js';
import { buildReport } from '../../../worker/src/engine/reportBuilder.js';
import { validatePreviewBody } from '../validators/requests.js';

export async function createTestRun(projectId, body) {
  const { eventName, fromVersion, toVersion } = validatePreviewBody(body);
  await requireProject(projectId);
  const schemas = await EventSchema.find({
    projectId,
    eventName,
    version: { $lte: toVersion },
  });
  if (!schemas.some((schema) => schema.version === fromVersion) ||
      !schemas.some((schema) => schema.version === toVersion))
    throw new HttpError(
      400,
      'SCHEMA_VERSION_NOT_FOUND',
      'Both event schema versions must exist in this project.',
    );
  const [consumers, fixtures] = await Promise.all([
    Consumer.find({ projectId, eventName, enabled: true }).lean(),
    EventFixture.find({ projectId, eventName }).lean(),
  ]);
  const run = await TestRun.create({
    projectId,
    eventName,
    fromVersion,
    toVersion,
    inputSnapshot: {
      schemas: schemas.map((schema) => ({
        eventName: schema.eventName,
        version: schema.version,
        schemaDefinition: schema.schemaDefinition,
      })),
      consumers,
      fixtures,
    },
  });
  await publishTestRun(run);
  return TestRun.findById(run.id);
}

export async function publishTestRun(run) {
  if (!run || run.status !== 'queued' || run.queuePublishedAt) return run;
  try {
    await enqueueTestRun({ runId: run.id, projectId: run.projectId, createdAt: run.createdAt });
    return TestRun.findOneAndUpdate(
      { _id: run.id, status: 'queued', queuePublishedAt: null },
      { $set: { queuePublishedAt: new Date(), queueError: null, queueNextAttemptAt: null }, $inc: { queueAttempts: 1 } },
      { new: true },
    );
  } catch {
    const queueAttempts = (run.queueAttempts ?? 0) + 1;
    const delayMs = Math.min(60000, 1000 * 2 ** Math.min(queueAttempts - 1, 6));
    await TestRun.findOneAndUpdate(
      { _id: run.id, status: 'queued', queuePublishedAt: null },
      { $set: { queueError: 'Broker unavailable; automatic publication retry is scheduled.', queueNextAttemptAt: new Date(Date.now() + delayMs) }, $inc: { queueAttempts: 1 } },
    );
    return TestRun.findById(run.id);
  }
}

export async function recoverPendingTestRunPublications() {
  const pending = await TestRun.find({
    status: 'queued', queuePublishedAt: null,
    $or: [{ queueNextAttemptAt: null }, { queueNextAttemptAt: { $lte: new Date() } }],
  }).sort({ createdAt: 1 }).limit(100);
  for (const run of pending) await publishTestRun(run);
  return pending.length;
}

/** Synchronous, non-persistent engine preview for local development and tests. */
export async function previewTestRun(projectId, { eventName, fromVersion, toVersion }) {
  await requireProject(projectId);
  if (fromVersion >= toVersion)
    throw new HttpError(400, 'INVALID_SCHEMA_PAIR', 'toVersion must be greater than fromVersion.');
  const schemaRecords = await EventSchema.find({
    projectId,
    eventName,
    version: { $lte: toVersion },
  }).lean();
  const oldSchema = schemaRecords.find((item) => item.version === fromVersion);
  const newSchema = schemaRecords.find((item) => item.version === toVersion);
  if (!oldSchema || !newSchema)
    throw new HttpError(404, 'SCHEMA_VERSION_NOT_FOUND', 'Both requested schema versions must exist for this event in the project.');
  const [consumers, fixtures] = await Promise.all([
    Consumer.find({ projectId, eventName }).lean(),
    EventFixture.find({ projectId, eventName }).lean(),
  ]);
  const startedAt = new Date();
  let replay;
  try {
    replay = replayFixtures({
      projectId, eventName, fixtures, schemas: schemaRecords, consumers,
      toVersion, fromVersion,
    });
  } catch (error) {
    if (!(error instanceof EngineInputError)) throw error;
    const status = error.code === 'CROSS_PROJECT_FIXTURE' ? 404 : 400;
    throw new HttpError(status, error.code, error.message);
  }
  return {
    mode: 'synchronous-preview',
    ...buildReport({
      projectId,
      eventName,
      fromVersion,
      toVersion,
      startedAt,
      durationMs: replay.durationMs,
      replay,
      compatibility: replay.compatibility,
    }),
  };
}

export async function listTestRuns(projectId, query) {
  await requireProject(projectId);
  const { page, limit, skip } = pagination(query);
  const [items, total] = await Promise.all([
    TestRun.find({ projectId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    TestRun.countDocuments({ projectId }),
  ]);
  return { items, page, limit, total };
}

export async function getTestRun(projectId, runId, resultsOnly = false) {
  await requireProject(projectId);
  validateObjectId(runId, 'Test run');
  let query = TestRun.findOne({ _id: runId, projectId });
  if (resultsOnly) query = query.select('results report summary outcome status errorMessage');
  const run = await query;
  if (!run)
    throw new HttpError(
      404,
      'RUN_NOT_FOUND',
      'Test run was not found in this project.',
    );
  return run;
}

export async function cancelTestRun(projectId, runId) {
  await requireProject(projectId);
  validateObjectId(runId, 'Test run');
  const run = await TestRun.findOneAndUpdate(
    { _id: runId, projectId, status: 'queued' },
    { status: 'cancelled', completedAt: new Date() },
    { new: true },
  );
  if (!run)
    throw new HttpError(
      409,
      'RUN_NOT_CANCELLABLE',
      'Only queued test runs can be cancelled.',
    );
  return run;
}
