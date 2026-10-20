import { beforeEach, describe, expect, it, vi } from 'vitest';

const { TestRun } = vi.hoisted(() => ({
  TestRun: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
}));
vi.mock('../../../shared/src/models.js', () => ({ TestRun }));

const { processTestRun } = await import('../../../worker/src/jobs/testRunProcessor.js');

const runRecord = (attempts = 1) => ({
  id: '507f1f77bcf86cd799439011',
  projectId: '507f191e810c19729de860ea',
  eventName: 'order.created',
  fromVersion: 1,
  toVersion: 2,
  status: 'running',
  attempts,
  startedAt: new Date('2026-10-20T12:00:00.000Z'),
  inputSnapshot: {
    schemas: [
      { eventName: 'order.created', version: 1, schemaDefinition: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      { eventName: 'order.created', version: 2, schemaDefinition: { type: 'object', properties: { id: { type: 'string' }, currency: { type: 'string' } }, required: ['id', 'currency'] } },
    ],
    consumers: [],
    fixtures: [],
  },
});

describe('test-run processor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists a completed execution with a failing test outcome and detailed Phase 3 report', async () => {
    TestRun.findOneAndUpdate
      .mockResolvedValueOnce(runRecord())
      .mockResolvedValueOnce({});

    await processTestRun('507f1f77bcf86cd799439011', '507f191e810c19729de860ea');

    const saved = TestRun.findOneAndUpdate.mock.calls[1][1].$set;
    expect(saved.status).toBe('completed');
    expect(saved.outcome).toBe('fail');
    expect(saved.report.compatibility.findings[0].code).toBe('NEW_REQUIRED_PROPERTY');
    expect(saved.results.some((item) => item.type === 'compatibility')).toBe(true);
  });

  it('does not rewrite a completed run on duplicate delivery', async () => {
    TestRun.findOneAndUpdate.mockResolvedValueOnce(null);
    TestRun.findOne.mockResolvedValueOnce({ status: 'completed' });

    await processTestRun('507f1f77bcf86cd799439011', '507f191e810c19729de860ea');

    expect(TestRun.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('sends a dangling run reference to the caller for dead-letter handling', async () => {
    TestRun.findOneAndUpdate.mockResolvedValueOnce(null);
    TestRun.findOne.mockResolvedValueOnce(null);

    await expect(processTestRun('507f1f77bcf86cd799439011', '507f191e810c19729de860ea'))
      .rejects.toMatchObject({ code: 'INVALID_RUN_REFERENCE' });
  });

  it('returns transient processing failures to queued for bounded retry', async () => {
    const run = runRecord(2);
    run.inputSnapshot.schemas = [];
    TestRun.findOneAndUpdate.mockResolvedValueOnce(run).mockResolvedValueOnce({});

    await expect(processTestRun(run.id, run.projectId)).rejects.toThrow('Target schema version 2 was not supplied.');

    expect(TestRun.findOneAndUpdate.mock.calls[1][1].status).toBe('queued');
  });

  it('persists an execution failure when the bounded attempt count is exhausted', async () => {
    const run = runRecord(3);
    run.inputSnapshot.schemas = [];
    TestRun.findOneAndUpdate.mockResolvedValueOnce(run).mockResolvedValueOnce({});

    await processTestRun(run.id, run.projectId);

    const failure = TestRun.findOneAndUpdate.mock.calls[1][1];
    expect(failure.status).toBe('failed');
    expect(failure.errorMessage).toContain('3 attempts');
  });
});
