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
  positiveInteger,
  requiredString,
  validateObjectId,
} from '../utils/http.js';
import { requireProject } from './resourceService.js';

export async function createTestRun(projectId, body) {
  await requireProject(projectId);
  const eventName = requiredString(body?.eventName, 'eventName', 160);
  const fromVersion = positiveInteger(body?.fromVersion, 'fromVersion');
  const toVersion = positiveInteger(body?.toVersion, 'toVersion');
  if (fromVersion >= toVersion)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'toVersion must be greater than fromVersion.',
    );
  const schemas = await EventSchema.find({
    projectId,
    eventName,
    version: { $in: [fromVersion, toVersion] },
  });
  if (schemas.length !== 2)
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
        version: schema.version,
        schemaDefinition: schema.schemaDefinition,
      })),
      consumers,
      fixtures,
    },
  });
  try {
    await enqueueTestRun(run.id);
  } catch {
    await TestRun.findByIdAndUpdate(run.id, {
      status: 'failed',
      errorMessage: 'Unable to publish test run to broker.',
    });
    throw new HttpError(
      503,
      'BROKER_UNAVAILABLE',
      'The test run was saved but could not be queued. Check the worker and broker.',
    );
  }
  return run;
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
  if (resultsOnly) query = query.select('results summary outcome status');
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
