import { describe, expect, it } from 'vitest';
import { replayFixtures } from '../../../worker/src/engine/fixtureRunner.js';
import { buildReport } from '../../../worker/src/engine/reportBuilder.js';

const projectId = '507f1f77bcf86cd799439011';
const schema = (version, definition, eventName = 'order.created') => ({ projectId, eventName, version, schemaDefinition: definition });
const fixture = (id, schemaVersion, payload, eventName = 'order.created') => ({ _id: id, projectId, eventName, schemaVersion, payload });
const orderSchema = (required = ['orderId']) => ({
  type: 'object', properties: { orderId: { type: 'string' }, note: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' } }, required,
});

describe('historical event replay', () => {
  it('passes compatible old events and applicable registered consumers', () => {
    const result = replayFixtures({
      projectId, eventName: 'order.created', fromVersion: 1, toVersion: 2,
      schemas: [schema(1, orderSchema()), schema(2, orderSchema())],
      fixtures: [fixture('f1', 1, { orderId: 'o-1', amount: 8 })],
      consumers: [{ _id: 'c1', eventName: 'order.created', expectedSchemaVersion: 1, handlerType: 'order-validation', invariants: [{ path: 'amount', operator: 'positiveNumber' }] }],
    });
    expect(result.summary).toMatchObject({ fixturesPassed: 1, consumersPassed: 1, fixturesFailed: 0 });
    expect(result.results[0].outcome).toBe('passed');
    expect(result.compatibility).toMatchObject({ direction: 'old-valid-to-new-valid', compatible: true, analysisComplete: true });
  });

  it('reports exact paths when a formerly valid historical event fails the target schema', () => {
    const result = replayFixtures({ projectId, eventName: 'order.created', toVersion: 2,
      schemas: [schema(1, orderSchema()), schema(2, orderSchema(['orderId', 'currency']))],
      fixtures: [fixture('f1', 1, { orderId: 'o-1' })], consumers: [] });
    expect(result.results[0]).toMatchObject({ outcome: 'failed', schemaValidation: { original: 'passed', target: 'failed' } });
    expect(result.results[0].findings[0]).toMatchObject({ code: 'TARGET_SCHEMA_REJECTION', path: '$.currency' });
  });

  it('reports consumer handler failures even when schema validation passes', () => {
    const result = replayFixtures({ projectId, eventName: 'order.created', toVersion: 2,
      schemas: [schema(1, orderSchema()), schema(2, orderSchema())],
      fixtures: [fixture('f1', 1, { amount: 1 })],
      consumers: [{ _id: 'c1', eventName: 'order.created', handlerType: 'order-validation' }] });
    expect(result.summary.consumersFailed).toBe(1);
    expect(result.results[0].consumerResults[0].findings[0].code).toBe('ORDER_ID_REQUIRED');
  });

  it('reports invariant violations with names, paths, and messages', () => {
    const result = replayFixtures({ projectId, eventName: 'order.created', toVersion: 2,
      schemas: [schema(1, orderSchema()), schema(2, orderSchema())],
      fixtures: [fixture('f1', 1, { orderId: 'o-1', amount: -1 })],
      consumers: [{ _id: 'c1', handlerType: 'order-validation', invariants: [{ path: 'amount', operator: 'positiveNumber', message: 'Amount must be positive.' }] }] });
    expect(result.summary.invariantViolations).toBe(1);
    expect(result.results[0].invariantResults[0]).toMatchObject({ status: 'failed', path: 'amount', message: 'Amount must be positive.' });
  });

  it('separates fixtures already invalid under their declared schema from new regressions', () => {
    const strict = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
    const result = replayFixtures({ projectId, eventName: 'order.created', toVersion: 2,
      schemas: [schema(1, strict), schema(2, strict)],
      fixtures: [fixture('legacy-bad', 1, { missing: true })], consumers: [] });
    expect(result.summary).toMatchObject({ preExistingInvalidFixtures: 1, fixturesFailed: 0, fixturesPassed: 0 });
    expect(result.results[0]).toMatchObject({ outcome: 'warning', preExistingInvalid: true });
    expect(result.results[0].findings.map((item) => item.code)).toContain('PRE_EXISTING_INVALID_FIXTURE');
  });

  it('marks unavailable source schemas skipped and rejects cross-project fixtures', () => {
    const args = { projectId, eventName: 'order.created', toVersion: 2,
      schemas: [schema(2, orderSchema())], fixtures: [fixture('f1', 1, { orderId: 'o-1' })], consumers: [] };
    expect(replayFixtures(args).results[0]).toMatchObject({ outcome: 'skipped' });
    expect(() => replayFixtures({ ...args, fixtures: [{ ...args.fixtures[0], projectId: 'other' }] }))
      .toThrow(expect.objectContaining({ code: 'CROSS_PROJECT_FIXTURE' }));
  });

  it('does not mutate stored payloads', () => {
    const payload = Object.freeze({ orderId: 'o-1', amount: 2 });
    const record = Object.freeze(fixture('f1', 1, payload));
    replayFixtures({ projectId, eventName: 'order.created', toVersion: 2,
      schemas: [schema(1, orderSchema()), schema(2, orderSchema())], fixtures: [record],
      consumers: [{ _id: 'c1', handlerType: 'order-validation', invariants: [] }] });
    expect(payload).toEqual({ orderId: 'o-1', amount: 2 });
  });
});

describe('structured report builder', () => {
  const base = {
    projectId, eventName: 'order.created', fromVersion: 1, toVersion: 2,
    startedAt: new Date('2026-01-01T00:00:00.000Z'), durationMs: 12,
    generatedAt: () => new Date('2026-01-01T00:00:00.012Z'),
    compatibility: { compatible: true, analysisComplete: true, findings: [] },
  };
  it('builds a passing report with counts and stable metadata', () => {
    const replay = replayFixtures({ projectId, eventName: 'order.created', fromVersion: 1, toVersion: 2,
      schemas: [schema(1, orderSchema()), schema(2, orderSchema())], fixtures: [fixture('f1', 1, { orderId: 'o-1' })], consumers: [] });
    const report = buildReport({ ...base, replay });
    expect(report).toMatchObject({ outcome: 'pass', executionStatus: 'completed', testedSchemaVersions: [1, 2], summary: { fixturesTested: 1, fixturesPassed: 1, fixturesFailed: 0 } });
  });
  it('returns warning for incomplete analysis and fail for confirmed failures', () => {
    const replay = { summary: { fixturesTested: 0, fixturesFailed: 0 }, results: [] };
    expect(buildReport({ ...base, replay, compatibility: { compatible: false, analysisComplete: false, findings: [{ code: 'UNKNOWN', severity: 'warning', path: '$' }] } }).outcome).toBe('warning');
    expect(buildReport({ ...base, replay: { ...replay, summary: { fixturesFailed: 1 }, results: [] } }).outcome).toBe('fail');
  });
});
