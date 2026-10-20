import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { Consumer, EventFixture, EventSchema, Project, TestRun } from '../../../shared/src/models.js';

const projectId = '507f1f77bcf86cd799439011';
const base = `/api/projects/${projectId}/test-runs/preview`;
const schemaDoc = (version, schemaDefinition) => ({ projectId, eventName: 'order.created', version, schemaDefinition });
const lean = (items) => ({ lean: () => Promise.resolve(items) });
const setup = ({ schemas, fixtures = [], consumers = [] }) => {
  vi.spyOn(Project, 'findById').mockReturnValue({ select: () => Promise.resolve({ _id: projectId, deleting: false }) });
  vi.spyOn(EventSchema, 'find').mockReturnValue(lean(schemas));
  vi.spyOn(EventFixture, 'find').mockReturnValue(lean(fixtures));
  vi.spyOn(Consumer, 'find').mockReturnValue(lean(consumers));
};

afterEach(() => vi.restoreAllMocks());

describe('synchronous test-run preview API', () => {
  it('returns a deterministic report for a valid request without creating a queued run', async () => {
    setup({ schemas: [
      schemaDoc(1, { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }),
      schemaDoc(2, { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } }, required: ['id'] }),
    ] });
    vi.spyOn(TestRun, 'create').mockRejectedValue(new Error('preview must not persist'));
    const response = await request(createApp()).post(base).send({ eventName: 'order.created', fromVersion: 1, toVersion: 2 });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ mode: 'synchronous-preview', outcome: 'pass', executionStatus: 'completed', summary: { fixturesTested: 0 } });
    expect(TestRun.create).not.toHaveBeenCalled();
    expect(EventFixture.find).toHaveBeenCalledWith({ projectId, eventName: 'order.created' });
  });

  it('rejects invalid IDs and reports missing requested schemas cleanly', async () => {
    const invalidId = await request(createApp()).post('/api/projects/nope/test-runs/preview')
      .send({ eventName: 'order.created', fromVersion: 1, toVersion: 2 });
    expect(invalidId.status).toBe(400);
    setup({ schemas: [schemaDoc(1, { type: 'object' })] });
    const missing = await request(createApp()).post(base)
      .send({ eventName: 'order.created', fromVersion: 1, toVersion: 2 });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('SCHEMA_VERSION_NOT_FOUND');
  });

  it('scopes schemas, fixtures, and consumers to the requested project and reports a breaking replay', async () => {
    const v1 = { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] };
    const v2 = { type: 'object', properties: { orderId: { type: 'string' }, currency: { type: 'string' } }, required: ['orderId', 'currency'] };
    setup({ schemas: [schemaDoc(1, v1), schemaDoc(2, v2)],
      fixtures: [{ _id: 'fixture-1', projectId, eventName: 'order.created', schemaVersion: 1, payload: { orderId: 'o-1' } }],
      consumers: [{ _id: 'consumer-1', projectId, eventName: 'order.created', enabled: true, expectedSchemaVersion: 1, handlerType: 'order-validation', invariants: [] }] });
    const response = await request(createApp()).post(base).send({ eventName: 'order.created', fromVersion: 1, toVersion: 2 });
    expect(EventSchema.find).toHaveBeenCalledWith({ projectId, eventName: 'order.created', version: { $lte: 2 } });
    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('fail');
    expect(response.body.data.fixtures[0].findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TARGET_SCHEMA_REJECTION', severity: 'error' }),
    ]));
    expect(response.body.data.testRunId).toBeNull();
  });

  it('rejects a cross-project fixture returned by persistence instead of replaying it', async () => {
    setup({ schemas: [
      schemaDoc(1, { type: 'object' }),
      schemaDoc(2, { type: 'object' }),
    ], fixtures: [{ _id: 'foreign-fixture', projectId: 'another-project', eventName: 'order.created', schemaVersion: 1, payload: {} }] });
    const response = await request(createApp()).post(base).send({ eventName: 'order.created', fromVersion: 1, toVersion: 2 });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CROSS_PROJECT_FIXTURE');
  });
});
