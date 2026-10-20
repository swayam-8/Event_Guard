import { Router } from 'express';
import {
  Consumer,
  EventFixture,
  EventSchema,
  Project,
  TestRun,
} from '../../../shared/src/models.js';
import {
  assertJsonSchema,
  validatePayload,
} from '../../../shared/src/schemaValidator.js';
import { compareSchemas } from '../../../shared/src/compatibility.js';
import {
  handlerNames,
  validateInvariants,
} from '../../../shared/src/handlers.js';
import {
  asyncRoute,
  HttpError,
  pagination,
  sendData,
  validateObjectId,
} from '../utils/http.js';
import { enqueueTestRun } from '../services/testRunQueue.js';

export const apiRouter = Router();
const resourceModels = {
  schemas: EventSchema,
  consumers: Consumer,
  fixtures: EventFixture,
  'test-runs': TestRun,
};
const fields = {
  schemas: ['eventName', 'version', 'schema'],
  consumers: [
    'name',
    'eventName',
    'expectedSchemaVersion',
    'handler',
    'enabled',
    'invariants',
  ],
  fixtures: ['eventName', 'schemaVersion', 'payload', 'description'],
};
const pick = (object, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, object[key]]),
  );
const project = async (id) => {
  validateObjectId(id, 'Project');
  const value = await Project.findById(id);
  if (!value)
    throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  return value;
};

apiRouter.post(
  '/projects',
  asyncRoute(async (req, res) => {
    if (!req.body?.name?.trim())
      throw new HttpError(400, 'VALIDATION_ERROR', 'Project name is required.');
    return sendData(
      res,
      await Project.create({
        name: req.body.name,
        description: req.body.description,
      }),
      201,
    );
  }),
);
apiRouter.get(
  '/projects',
  asyncRoute(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const [items, total] = await Promise.all([
      Project.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Project.countDocuments(),
    ]);
    return sendData(res, { items, page, limit, total });
  }),
);
apiRouter.get(
  '/projects/:projectId',
  asyncRoute(async (req, res) =>
    sendData(res, await project(req.params.projectId)),
  ),
);
apiRouter.patch(
  '/projects/:projectId',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      pick(req.body ?? {}, ['name', 'description']),
      { new: true, runValidators: true },
    );
    return sendData(res, updated);
  }),
);
apiRouter.delete(
  '/projects/:projectId',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    await Promise.all(
      Object.values(resourceModels).map((Model) =>
        Model.deleteMany({ projectId: req.params.projectId }),
      ),
    );
    await Project.findByIdAndDelete(req.params.projectId);
    return sendData(res, { deleted: true });
  }),
);

for (const [resource, Model] of Object.entries(resourceModels)) {
  if (resource === 'test-runs') continue;
  apiRouter.post(
    `/projects/:projectId/${resource}`,
    asyncRoute(async (req, res) => {
      await project(req.params.projectId);
      const data = pick(req.body ?? {}, fields[resource]);
      if (resource === 'schemas') assertJsonSchema(data.schema);
      if (resource === 'consumers' && !handlerNames.includes(data.handler))
        throw new HttpError(
          400,
          'INVALID_HANDLER',
          `handler must be one of: ${handlerNames.join(', ')}`,
        );
      if (resource === 'consumers') {
        try {
          validateInvariants(data.invariants);
        } catch (error) {
          throw new HttpError(400, 'INVALID_INVARIANTS', error.message);
        }
      }
      if (resource === 'fixtures') {
        const schema = await EventSchema.findOne({
          projectId: req.params.projectId,
          eventName: data.eventName,
          version: data.schemaVersion,
        });
        if (!schema)
          throw new HttpError(
            400,
            'SCHEMA_NOT_FOUND',
            'The fixture schema version does not exist in this project.',
          );
        const validation = validatePayload(schema.schema, data.payload);
        if (!validation.valid)
          throw new HttpError(
            400,
            'INVALID_FIXTURE',
            JSON.stringify(validation.errors),
          );
      }
      return sendData(
        res,
        await Model.create({ ...data, projectId: req.params.projectId }),
        201,
      );
    }),
  );
  apiRouter.get(
    `/projects/:projectId/${resource}`,
    asyncRoute(async (req, res) => {
      await project(req.params.projectId);
      const { page, limit, skip } = pagination(req.query);
      const filter = { projectId: req.params.projectId };
      for (const key of ['eventName', 'status'])
        if (req.query[key]) filter[key] = req.query[key];
      const [items, total] = await Promise.all([
        Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Model.countDocuments(filter),
      ]);
      return sendData(res, { items, page, limit, total });
    }),
  );
  apiRouter.get(
    `/projects/:projectId/${resource}/:resourceId`,
    asyncRoute(async (req, res) => {
      await project(req.params.projectId);
      validateObjectId(req.params.resourceId);
      const item = await Model.findOne({
        _id: req.params.resourceId,
        projectId: req.params.projectId,
      });
      if (!item)
        throw new HttpError(
          404,
          'RESOURCE_NOT_FOUND',
          'Resource was not found in this project.',
        );
      return sendData(res, item);
    }),
  );
  apiRouter.delete(
    `/projects/:projectId/${resource}/:resourceId`,
    asyncRoute(async (req, res) => {
      await project(req.params.projectId);
      validateObjectId(req.params.resourceId);
      const item = await Model.findOneAndDelete({
        _id: req.params.resourceId,
        projectId: req.params.projectId,
      });
      if (!item)
        throw new HttpError(
          404,
          'RESOURCE_NOT_FOUND',
          'Resource was not found in this project.',
        );
      return sendData(res, { deleted: true });
    }),
  );
}

apiRouter.patch(
  '/projects/:projectId/consumers/:resourceId',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    validateObjectId(req.params.resourceId);
    const body = req.body ?? {};
    if (body.handler && !handlerNames.includes(body.handler))
      throw new HttpError(400, 'INVALID_HANDLER', 'Unsupported handler.');
    if (body.invariants !== undefined) {
      try {
        validateInvariants(body.invariants);
      } catch (error) {
        throw new HttpError(400, 'INVALID_INVARIANTS', error.message);
      }
    }
    const result = await Consumer.findOneAndUpdate(
      { _id: req.params.resourceId, projectId: req.params.projectId },
      pick(body, fields.consumers),
      { new: true, runValidators: true },
    );
    if (!result)
      throw new HttpError(
        404,
        'RESOURCE_NOT_FOUND',
        'Consumer was not found in this project.',
      );
    return sendData(res, result);
  }),
);

apiRouter.post(
  '/projects/:projectId/schemas/:schemaId/validate',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    validateObjectId(req.params.schemaId, 'Schema');
    const schema = await EventSchema.findOne({
      _id: req.params.schemaId,
      projectId: req.params.projectId,
    });
    if (!schema)
      throw new HttpError(
        404,
        'SCHEMA_NOT_FOUND',
        'Schema was not found in this project.',
      );
    return sendData(res, {
      ...validatePayload(schema.schema, req.body?.payload),
      schemaId: schema.id,
      version: schema.version,
    });
  }),
);
apiRouter.post(
  '/projects/:projectId/schemas/compare',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    const { eventName, fromVersion, toVersion } = req.body ?? {};
    if (
      !eventName ||
      !Number.isInteger(fromVersion) ||
      !Number.isInteger(toVersion) ||
      fromVersion >= toVersion
    )
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'eventName and increasing integer fromVersion/toVersion are required.',
      );
    const schemas = await EventSchema.find({
      projectId: req.params.projectId,
      eventName,
      version: { $in: [fromVersion, toVersion] },
    });
    const previous = schemas.find((item) => item.version === fromVersion);
    const next = schemas.find((item) => item.version === toVersion);
    if (!previous || !next)
      throw new HttpError(
        404,
        'SCHEMA_VERSION_NOT_FOUND',
        'Both schema versions must exist in this project.',
      );
    return sendData(res, {
      eventName,
      fromVersion,
      toVersion,
      deterministic: false,
      findings: compareSchemas(previous.schema, next.schema),
    });
  }),
);

apiRouter.post(
  '/projects/:projectId/test-runs',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    const { eventName, fromVersion, toVersion } = req.body ?? {};
    if (
      !eventName ||
      !Number.isInteger(fromVersion) ||
      !Number.isInteger(toVersion) ||
      fromVersion >= toVersion
    )
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'eventName and increasing integer fromVersion/toVersion are required.',
      );
    const schemaRecords = await EventSchema.find({
      projectId: req.params.projectId,
      eventName,
      version: { $in: [fromVersion, toVersion] },
    });
    if (schemaRecords.length !== 2)
      throw new HttpError(
        400,
        'SCHEMA_VERSION_NOT_FOUND',
        'Both schema versions must exist in this project.',
      );
    const consumers = await Consumer.find({
      projectId: req.params.projectId,
      eventName,
      enabled: true,
    }).lean();
    const fixtures = await EventFixture.find({
      projectId: req.params.projectId,
      eventName,
    }).lean();
    const run = await TestRun.create({
      projectId: req.params.projectId,
      eventName,
      fromVersion,
      toVersion,
      inputSnapshot: {
        schemas: schemaRecords.map((s) => ({
          version: s.version,
          schema: s.schema,
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
    return sendData(res, run, 202);
  }),
);
apiRouter.get(
  '/projects/:projectId/test-runs',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    const { page, limit, skip } = pagination(req.query);
    const filter = { projectId: req.params.projectId };
    const [items, total] = await Promise.all([
      TestRun.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      TestRun.countDocuments(filter),
    ]);
    return sendData(res, { items, page, limit, total });
  }),
);
apiRouter.get(
  '/projects/:projectId/test-runs/:runId',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    validateObjectId(req.params.runId, 'Test run');
    const run = await TestRun.findOne({
      _id: req.params.runId,
      projectId: req.params.projectId,
    });
    if (!run)
      throw new HttpError(
        404,
        'RUN_NOT_FOUND',
        'Test run was not found in this project.',
      );
    return sendData(res, run);
  }),
);
apiRouter.get(
  '/projects/:projectId/test-runs/:runId/results',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    validateObjectId(req.params.runId, 'Test run');
    const run = await TestRun.findOne({
      _id: req.params.runId,
      projectId: req.params.projectId,
    }).select('results summary outcome status');
    if (!run)
      throw new HttpError(
        404,
        'RUN_NOT_FOUND',
        'Test run was not found in this project.',
      );
    return sendData(res, run);
  }),
);
apiRouter.post(
  '/projects/:projectId/test-runs/:runId/cancel',
  asyncRoute(async (req, res) => {
    await project(req.params.projectId);
    validateObjectId(req.params.runId, 'Test run');
    const run = await TestRun.findOneAndUpdate(
      {
        _id: req.params.runId,
        projectId: req.params.projectId,
        status: 'queued',
      },
      { status: 'cancelled', completedAt: new Date() },
      { new: true },
    );
    if (!run)
      throw new HttpError(
        409,
        'RUN_NOT_CANCELLABLE',
        'Only queued test runs can be cancelled.',
      );
    return sendData(res, run);
  }),
);
