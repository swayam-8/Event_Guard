import { describe, expect, it } from 'vitest';
import {
  assertJsonSchema,
  validatePayload,
} from '../../../shared/src/schemaValidator.js';

const schema = {
  type: 'object',
  properties: { amount: { type: 'number' } },
  required: ['amount'],
  additionalProperties: false,
};

describe('JSON Schema validation', () => {
  it('accepts a valid schema and payload', () => {
    expect(() => assertJsonSchema(schema)).not.toThrow();
    expect(validatePayload(schema, { amount: 10 })).toMatchObject({
      valid: true,
      errors: [],
    });
  });

  it('returns deterministic errors for invalid payloads', () => {
    expect(
      validatePayload(schema, { amount: '10', other: true }),
    ).toMatchObject({ valid: false });
  });

  it('rejects malformed schema documents', () => {
    expect(() => assertJsonSchema({ type: 'not-a-json-type' })).toThrow();
  });
});
