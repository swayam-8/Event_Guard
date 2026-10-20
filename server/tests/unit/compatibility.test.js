import { describe, expect, it } from 'vitest';
import { compareSchemas } from '../../../shared/src/compatibility.js';

const findings = (oldSchema, newSchema) => compareSchemas(oldSchema, newSchema);

describe('conservative schema compatibility analysis', () => {
  it('detects a removed property', () => {
    expect(
      findings(
        { type: 'object', properties: { id: { type: 'string' } } },
        { type: 'object', properties: {} },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REMOVED_PROPERTY', path: '$.id' }),
      ]),
    );
  });

  it('detects a newly required property, even when it has a default annotation', () => {
    expect(
      findings(
        { type: 'object', properties: { id: { type: 'string' } } },
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            customerId: { type: 'string', default: 'x' },
          },
          required: ['customerId'],
        },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NEW_REQUIRED_PROPERTY',
          path: '$.customerId',
          severity: 'error',
        }),
      ]),
    );
  });

  it('detects incompatible primitive type changes', () => {
    expect(
      findings(
        { type: 'object', properties: { amount: { type: 'number' } } },
        { type: 'object', properties: { amount: { type: 'string' } } },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INCOMPATIBLE_TYPE_CHANGE',
          path: '$.amount',
        }),
      ]),
    );
  });

  it('recurses into nested properties', () => {
    expect(
      findings(
        {
          properties: {
            customer: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
        {
          properties: {
            customer: {
              type: 'object',
              properties: { name: { type: 'integer' } },
            },
          },
        },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INCOMPATIBLE_TYPE_CHANGE',
          path: '$.customer.name',
        }),
      ]),
    );
  });

  it('detects removed enum values', () => {
    expect(
      findings(
        { properties: { state: { type: 'string', enum: ['new', 'paid'] } } },
        { properties: { state: { type: 'string', enum: ['new'] } } },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ENUM_VALUES_REMOVED',
          path: '$.state',
        }),
      ]),
    );
  });

  it('compares array item schemas', () => {
    expect(
      findings(
        { properties: { lines: { type: 'array', items: { type: 'string' } } } },
        { properties: { lines: { type: 'array', items: { type: 'object' } } } },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INCOMPATIBLE_TYPE_CHANGE',
          path: '$.lines[]',
        }),
      ]),
    );
  });

  it('warns when changed schema keywords are not analyzed', () => {
    expect(
      findings(
        { type: 'object', additionalProperties: true },
        { type: 'object', additionalProperties: false },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNANALYZED_KEYWORD_CHANGE',
          severity: 'warning',
        }),
      ]),
    );
  });

  it('includes compared versions in API findings', () => {
    expect(
      compareSchemas(
        { type: 'string' },
        { type: 'number' },
        { oldVersion: 1, newVersion: 2 },
      )[0],
    ).toMatchObject({ oldVersion: 1, newVersion: 2 });
  });
});
