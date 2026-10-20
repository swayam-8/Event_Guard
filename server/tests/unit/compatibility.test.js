import { describe, expect, it } from 'vitest';
import { compareSchemas } from '../../../shared/src/compatibility.js';
import { analyzeCompatibility } from '../../../shared/src/compatibility.js';

const findings = (oldSchema, newSchema) => compareSchemas(oldSchema, newSchema);

describe('conservative schema compatibility analysis', () => {
  it('detects a removed property', () => {
    const result = analyzeCompatibility(
        { type: 'object', properties: { id: { type: 'string' } } },
        { type: 'object', properties: {} },
      );
    expect(result.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'REMOVED_PROPERTY', path: '$.id' }),
      ]));
    expect(result.compatible).toBe(true);
    expect(result.findings[0].severity).toBe('info');
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
          code: 'ADDITIONAL_PROPERTIES_RESTRICTED',
          severity: 'error',
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

  it('defines compatibility as old valid values remaining valid under the new schema', () => {
    const result = analyzeCompatibility(
      { type: 'object', properties: { id: { type: 'string' } } },
      { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } } },
    );
    expect(result).toMatchObject({
      direction: 'old-valid-to-new-valid',
      compatible: true,
      analysisComplete: true,
    });
  });

  it('reports additional property rejection as a confirmed restriction', () => {
    const result = analyzeCompatibility(
      { type: 'object', properties: { id: { type: 'string' } } },
      { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false },
    );
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ADDITIONAL_PROPERTIES_RESTRICTED', severity: 'error' }),
    ]));
  });

  it('handles boolean schemas and a newly added enum as validation restrictions', () => {
    expect(analyzeCompatibility(true, { type: 'string' }).findings[0])
      .toMatchObject({ code: 'SCHEMA_CONSTRAINT_ADDED', severity: 'error' });
    expect(analyzeCompatibility({ type: 'string' }, { type: 'string', enum: ['ok'] }).findings)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'ENUM_CONSTRAINT_ADDED', severity: 'error' }),
      ]));
  });

  it('warns for composition constructs even when unchanged and sorts findings deterministically', () => {
    const schema = { anyOf: [{ type: 'string' }, { type: 'number' }], minimum: 0 };
    const first = analyzeCompatibility(schema, { ...schema, pattern: 'x' });
    const second = analyzeCompatibility(schema, { ...schema, pattern: 'x' });
    expect(first.analysisComplete).toBe(false);
    expect(first.findings).toEqual(second.findings);
    expect(first.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNSUPPORTED_SCHEMA_CONSTRUCT', severity: 'warning' }),
    ]));
  });
});
