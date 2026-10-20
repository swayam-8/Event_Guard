import { describe, expect, it } from 'vitest';
import { validateJobMessage } from '../../../worker/src/jobs/testRunProcessor.js';

describe('versioned Kafka test-run message', () => {
  it('accepts a valid v1 run envelope', () => {
    expect(validateJobMessage({
      version: 1,
      runId: '507f1f77bcf86cd799439011',
      projectId: '507f191e810c19729de860ea',
      createdAt: '2026-10-20T12:00:00.000Z',
    })).toBe(true);
  });

  it.each([
    null,
    {},
    { version: 2, runId: '507f1f77bcf86cd799439011', projectId: '507f191e810c19729de860ea', createdAt: '2026-10-20T12:00:00.000Z' },
    { version: 1, runId: 'invalid', projectId: '507f191e810c19729de860ea', createdAt: '2026-10-20T12:00:00.000Z' },
    { version: 1, runId: '507f1f77bcf86cd799439011', projectId: 'invalid', createdAt: '2026-10-20T12:00:00.000Z' },
    { version: 1, runId: '507f1f77bcf86cd799439011', projectId: '507f191e810c19729de860ea', createdAt: 'yesterday' },
  ])('rejects malformed job %#', (message) => {
    expect(validateJobMessage(message)).toBe(false);
  });
});
