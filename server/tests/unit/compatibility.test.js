import { describe, expect, it } from 'vitest';
import { compareSchemas } from '../../../shared/src/compatibility.js';

describe('schema compatibility heuristics', () => {
  it('flags newly required fields, removed properties, and narrowed types', () => {
    const previous = {
      type: 'object',
      properties: { id: { type: 'string' }, state: { type: 'string' } },
      required: ['id'],
    };
    const next = {
      type: 'object',
      properties: { id: { type: 'integer' }, status: { type: 'string' } },
      required: ['id', 'status'],
    };
    expect(compareSchemas(previous, next).map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'PROPERTY_REMOVED',
        'TYPE_NARROWED',
        'NEW_REQUIRED_FIELD',
      ]),
    );
  });

  it('does not report a newly required property that has a default', () => {
    const previous = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    };
    const next = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        state: { type: 'string', default: 'new' },
      },
      required: ['id', 'state'],
    };
    expect(compareSchemas(previous, next)).toEqual([]);
  });
});
