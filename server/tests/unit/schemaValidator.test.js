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
    const result = validatePayload(schema, { amount: '10', other: true });
    expect(result).toMatchObject({ valid: false });
    expect(
      validatePayload(schema, { amount: '10', other: true }),
    ).toMatchObject({ valid: false });
    expect(result.errors.map((item) => item.path)).toEqual(['$.amount', '$.other']);
  });

  it('rejects malformed schema documents', () => {
    expect(() => assertJsonSchema({ type: 'not-a-json-type' })).toThrow();
    expect(() => assertJsonSchema({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' }))
      .toThrow(/Only JSON Schema Draft 2020-12 is supported/);
  });
});
