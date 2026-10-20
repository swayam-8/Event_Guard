import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import {
  Consumer,
  EventFixture,
  EventSchema,
  Project,
  TestRun,
} from '../../../shared/src/models.js';

const projectId = '507f1f77bcf86cd799439011';
const schemaId = '507f1f77bcf86cd799439013';
const consumerId = '507f1f77bcf86cd799439014';
const fixtureId = '507f1f77bcf86cd799439015';
const base = `/api/projects/${projectId}`;
const schemaDefinition = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { id: { type: 'string' }, amount: { type: 'number' } },
  required: ['id'],
};
const schemaDoc = (
  id,
  version,
  definition = schemaDefinition,
  eventName = 'order.created',
) => ({
  _id: id,
  id,
  projectId,
  eventName,
  version,
  schemaDefinition: definition,
});
const chain = (items) => ({
  sort: () => ({ skip: () => ({ limit: () => Promise.resolve(items) }) }),
});
const projectExists = () =>
  vi
    .spyOn(Project, 'findById')
    .mockReturnValue({
      select: () => Promise.resolve({ _id: projectId, deleting: false }),
    });

afterEach(() => vi.restoreAllMocks());

describe('project-scoped resource APIs', () => {
  it('validates JSON Schema documents and creates the canonical schemaDefinition field', async () => {
    projectExists();
    vi.spyOn(EventSchema, 'create').mockImplementation(async (data) => ({
      _id: schemaId,
      ...data,
    }));
    const response = await request(createApp())
      .post(`${base}/schemas`)
      .send({ eventName: 'order.created', version: 1, schemaDefinition });
    expect(response.status).toBe(201);
    expect(response.body.data.schemaDefinition).toEqual(schemaDefinition);
  });

  it('rejects malformed schemas and reports unique-index conflicts as 409', async () => {
    projectExists();
    const app = createApp();
    const invalid = await request(app)
      .post(`${base}/schemas`)
      .send({
        eventName: 'order.created',
        version: 1,
        schemaDefinition: { type: 'not-a-type' },
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details[0].field).toBe('schemaDefinition');
    vi.spyOn(EventSchema, 'create').mockRejectedValueOnce({ code: 11000 });
    const duplicate = await request(app)
      .post(`${base}/schemas`)
      .send({ eventName: 'order.created', version: 1, schemaDefinition });
    expect(duplicate.status).toBe(409);
  });

  it('paginates and filters schema lists, and rejects cross-project reads', async () => {
    projectExists();
    const find = vi
      .spyOn(EventSchema, 'find')
      .mockReturnValue(chain([schemaDoc(schemaId, 1)]));
    vi.spyOn(EventSchema, 'countDocuments').mockResolvedValue(1);
    const response = await request(createApp()).get(
      `${base}/schemas?eventName=order.created&page=2&limit=10`,
    );
    expect(response.body.data).toMatchObject({ page: 2, limit: 10, total: 1 });
    expect(find).toHaveBeenCalledWith({
      projectId,
      eventName: 'order.created',
    });
    vi.spyOn(EventSchema, 'findOne').mockResolvedValue(null);
    const crossProject = await request(createApp()).get(
      `${base}/schemas/${schemaId}`,
    );
    expect(crossProject.status).toBe(404);
  });

  it('returns valid and invalid schema payloads as normal validation results', async () => {
    projectExists();
    vi.spyOn(EventSchema, 'findOne').mockResolvedValue(schemaDoc(schemaId, 1));
    const app = createApp();
    const valid = await request(app)
      .post(`${base}/schemas/${schemaId}/validate`)
      .send({ payload: { id: 'evt_1' } });
    const invalid = await request(app)
      .post(`${base}/schemas/${schemaId}/validate`)
      .send({ payload: { amount: 'wrong' } });
    expect(valid.status).toBe(200);
    expect(valid.body.data).toMatchObject({ valid: true, errors: [] });
    expect(invalid.status).toBe(200);
    expect(invalid.body.data.valid).toBe(false);
    expect(invalid.body.data.errors[0]).toMatchObject({
      path: '$',
      keyword: 'required',
    });
  });

  it('registers only consumers whose schema version exists and rejects unsupported handlers', async () => {
    projectExists();
    const app = createApp();
    const invalid = await request(app)
      .post(`${base}/consumers`)
      .send({
        name: 'billing',
        eventName: 'order.created',
        expectedSchemaVersion: 1,
        handlerType: 'javascript',
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_HANDLER_TYPE');
    vi.spyOn(EventSchema, 'findOne').mockResolvedValue(null);
    const missingVersion = await request(app)
      .post(`${base}/consumers`)
      .send({
        name: 'billing',
        eventName: 'order.created',
        expectedSchemaVersion: 1,
        handlerType: 'order-validation',
      });
    expect(missingVersion.status).toBe(400);
    expect(missingVersion.body.error.code).toBe('SCHEMA_VERSION_NOT_FOUND');
    vi.spyOn(EventSchema, 'findOne').mockResolvedValue(schemaDoc(schemaId, 1));
    vi.spyOn(Consumer, 'create').mockImplementation(async (data) => ({
      _id: consumerId,
      ...data,
    }));
    const created = await request(app)
      .post(`${base}/consumers`)
      .send({
        name: 'billing',
        eventName: 'order.created',
        expectedSchemaVersion: 1,
        handlerType: 'order-validation',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.handlerType).toBe('order-validation');
  });

  it('rejects invalid consumer invariants and prevents cross-project consumer access', async () => {
    projectExists();
    const app = createApp();
    const invalid = await request(app)
      .post(`${base}/consumers`)
      .send({
        name: 'billing',
        eventName: 'order.created',
        expectedSchemaVersion: 1,
        handlerType: 'order-validation',
        invariants: [{ path: '__proto__.x', operator: 'exists' }],
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_INVARIANTS');
    vi.spyOn(Consumer, 'findOne').mockResolvedValue(null);
    const crossProject = await request(app)
      .patch(`${base}/consumers/${consumerId}`)
      .send({ enabled: false });
    expect(crossProject.status).toBe(404);
  });

  it('validates fixtures against their same-project schema before saving', async () => {
    projectExists();
    vi.spyOn(EventSchema, 'findOne').mockResolvedValue(schemaDoc(schemaId, 1));
    const create = vi
      .spyOn(EventFixture, 'create')
      .mockImplementation(async (data) => ({ _id: fixtureId, ...data }));
    const app = createApp();
    const valid = await request(app)
      .post(`${base}/fixtures`)
      .send({
        eventName: 'order.created',
        schemaVersion: 1,
        payload: { id: 'evt_1' },
      });
    expect(valid.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, payload: { id: 'evt_1' } }),
    );
    const invalid = await request(app)
      .post(`${base}/fixtures`)
      .send({
        eventName: 'order.created',
        schemaVersion: 1,
        payload: { amount: 'wrong' },
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.details[0]).toMatchObject({
      field: '$',
      keyword: 'required',
    });
  });

  it('rejects missing and cross-project fixture schemas and supports fixture filters', async () => {
    projectExists();
    vi.spyOn(EventSchema, 'findOne').mockResolvedValue(null);
    const app = createApp();
    const missing = await request(app)
      .post(`${base}/fixtures`)
      .send({
        eventName: 'order.created',
        schemaVersion: 1,
        payload: { id: 'evt_1' },
      });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('SCHEMA_VERSION_NOT_FOUND');
    vi.spyOn(EventFixture, 'find').mockReturnValue(chain([]));
    vi.spyOn(EventFixture, 'countDocuments').mockResolvedValue(0);
    const filtered = await request(app).get(
      `${base}/fixtures?eventName=order.created&schemaVersion=1`,
    );
    expect(filtered.body.data).toMatchObject({
      items: [],
      page: 1,
      limit: 25,
      total: 0,
    });
    expect(EventFixture.find).toHaveBeenCalledWith({
      projectId,
      eventName: 'order.created',
      schemaVersion: 1,
    });
    vi.spyOn(EventFixture, 'findOne').mockResolvedValue(null);
    const crossProject = await request(app).get(
      `${base}/fixtures/${fixtureId}`,
    );
    expect(crossProject.status).toBe(404);
  });

  it('rejects unsupported request fields and bounds pagination', async () => {
    projectExists();
    const app = createApp();
    const unexpected = await request(app)
      .post('/api/projects')
      .send({ name: 'Orders', isAdmin: true });
    const tooMany = await request(app).get('/api/projects?limit=101');
    expect(unexpected.status).toBe(400);
    expect(unexpected.body.error.details[0].field).toBe('isAdmin');
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe('INVALID_PAGINATION');
  });

  it('deletes project children in order and retains the parent until cleanup finishes', async () => {
    vi.spyOn(Project, 'findById').mockReturnValue({
      select: () => Promise.resolve({ _id: projectId, deleting: false }),
    });
    vi.spyOn(Project, 'findByIdAndUpdate').mockReturnValue({
      select: () => Promise.resolve({ _id: projectId, deleting: true }),
    });
    const order = [];
    for (const Model of [EventFixture, Consumer, EventSchema, TestRun])
      vi.spyOn(Model, 'deleteMany').mockImplementation(async () => {
        order.push(Model.modelName);
      });
    vi.spyOn(Project, 'findByIdAndDelete').mockImplementation(async () => {
      order.push('Project');
    });
    const response = await request(createApp()).delete(
      `/api/projects/${projectId}`,
    );
    expect(response.status).toBe(204);
    expect(order).toEqual([
      'EventFixture',
      'Consumer',
      'EventSchema',
      'TestRun',
      'Project',
    ]);
  });

  it('compares two project schemas and marks conservative warnings as not proven compatible', async () => {
    projectExists();
    vi.spyOn(EventSchema, 'findOne')
      .mockResolvedValueOnce(
        schemaDoc('507f1f77bcf86cd799439016', 1, {
          type: 'object',
          properties: { id: { type: 'string' } },
        }),
      )
      .mockResolvedValueOnce(
        schemaDoc('507f1f77bcf86cd799439017', 2, {
          type: 'object',
          properties: {
            id: { type: 'string' },
            customerId: { type: 'string' },
          },
          required: ['customerId'],
        }),
      );
    const response = await request(createApp())
      .post(`${base}/schemas/compare`)
      .send({
        oldSchemaId: '507f1f77bcf86cd799439016',
        newSchemaId: '507f1f77bcf86cd799439017',
      });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      compatible: false,
      oldVersion: 1,
      newVersion: 2,
    });
    expect(response.body.data.findings[0]).toMatchObject({
      code: 'NEW_REQUIRED_PROPERTY',
      severity: 'error',
      path: '$.customerId',
      oldVersion: 1,
      newVersion: 2,
    });
  });
});
