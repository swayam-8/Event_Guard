import { describe, expect, it } from 'vitest';
import { replayFixtures } from '../../../worker/src/engine/fixtureRunner.js';
import { checkInvariants } from '../../../worker/src/engine/invariantChecker.js';
import { buildReport } from '../../../worker/src/engine/reportBuilder.js';

describe('worker engine', () => {
  it('replays old fixtures against a target schema and registered consumers', () => {
    const result = replayFixtures({
      schemas: [
        {
          version: 1,
          schema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        {
          version: 2,
          schema: {
            type: 'object',
            properties: { id: { type: 'string' }, state: { type: 'string' } },
            required: ['id', 'state'],
          },
        },
      ],
      fixtures: [
        { _id: 'fixture-1', schemaVersion: 1, payload: { id: 'one' } },
      ],
      consumers: [
        {
          _id: 'consumer-1',
          expectedSchemaVersion: 1,
          handler: 'order-validation',
          invariants: [],
        },
      ],
      toVersion: 2,
    });
    expect(result.summary).toMatchObject({
      fixturesTested: 1,
      failedFixtures: 1,
      consumersTested: 1,
      failedConsumers: 1,
    });
    expect(result.results[0].validAtSource).toBe(true);
    expect(result.results[0].validAtTarget).toBe(false);
  });

  it('checks supported path invariants and aggregates a fail outcome', () => {
    expect(
      checkInvariants([{ path: 'amount', operator: 'greaterThan', value: 0 }], {
        amount: -2,
      }),
    ).toHaveLength(1);
    const report = buildReport(
      [{ type: 'compatibility', severity: 'breaking' }],
      {
        fixturesTested: 0,
        consumersTested: 0,
        failedFixtures: 0,
        failedConsumers: 0,
        invariantViolations: 0,
      },
    );
    expect(report.outcome).toBe('fail');
    expect(report.summary.compatibilityFindings).toBe(1);
  });
});
