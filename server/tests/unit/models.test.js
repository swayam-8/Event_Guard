import { describe, expect, it } from 'vitest';
import {
  Consumer,
  EventFixture,
  EventSchema,
  Project,
} from '../../../shared/src/models.js';

const projectId = '507f1f77bcf86cd799439011';

describe('Mongoose resource models', () => {
  it('declares a unique project/event/version schema index without fixture description uniqueness', () => {
    const schemaIndex = EventSchema.schema.indexes().find(([keys]) =>
      ['projectId', 'eventName', 'version'].every((key) => keys[key] === 1),
    );
    expect(schemaIndex?.[1].unique).toBe(true);
    expect(EventFixture.schema.indexes().some(([, options]) => options.unique)).toBe(false);
  });

  it('enforces required project, integer version, and JSON object schema fields', async () => {
    const valid = new EventSchema({
      projectId,
      eventName: 'order.created',
      version: 1,
      schemaDefinition: { type: 'object' },
    });
    expect(await valid.validate()).toBeUndefined();
    const invalid = new EventSchema({
      projectId,
      eventName: 'order.created',
      version: 1.5,
      schemaDefinition: [],
    });
    await expect(invalid.validate()).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  it('allows only registered consumer handler types and validated declarative invariants', async () => {
    const valid = new Consumer({
      projectId,
      name: 'Billing',
      eventName: 'order.created',
      expectedSchemaVersion: 1,
      handlerType: 'order-validation',
      invariants: [{ path: 'amount', operator: 'greaterThan', value: 0 }],
    });
    expect(await valid.validate()).toBeUndefined();
    const invalid = new Consumer({
      projectId,
      name: 'Billing',
      eventName: 'order.created',
      expectedSchemaVersion: 1,
      handlerType: 'execute',
      invariants: [{ path: 'x', operator: 'eval' }],
    });
    await expect(invalid.validate()).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  it('requires fixture payloads to be objects and project names to be present', async () => {
    const invalidFixture = new EventFixture({
      projectId,
      eventName: 'order.created',
      schemaVersion: 1,
      payload: [],
    });
    await expect(invalidFixture.validate()).rejects.toMatchObject({
      name: 'ValidationError',
    });
    const invalidProject = new Project({ name: '   ' });
    await expect(invalidProject.validate()).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });
});
