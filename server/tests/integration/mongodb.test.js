import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Consumer,
  EventFixture,
  EventSchema,
  Project,
} from '../../../shared/src/models.js';
import {
  compareSchemaVersions,
  createFixture,
  createSchema,
  deleteProject,
} from '../../src/services/resourceService.js';

const mongoTestUri = process.env.MONGODB_TEST_URI;
const safeTestDatabase = Boolean(
  mongoTestUri && /(?:^|\/)[^/?]*test[^/?]*(?:\?|$)/i.test(mongoTestUri),
);
const integration = safeTestDatabase ? describe : describe.skip;
let project;

integration('MongoDB persistence integration (MONGODB_TEST_URI)', () => {
  beforeAll(async () => {
    await mongoose.connect(mongoTestUri, { serverSelectionTimeoutMS: 5000 });
    await Promise.all([
      Project.init(),
      EventSchema.init(),
      Consumer.init(),
      EventFixture.init(),
    ]);
  });

  afterAll(async () => {
    if (project) await deleteProject(project.id);
    await mongoose.disconnect();
  });

  it('persists project resources, validates fixtures, compares versions, and cascades project deletion', async () => {
    project = await Project.create({
      name: `Integration ${new mongoose.Types.ObjectId()}`,
    });
    const v1 = await createSchema(project.id, {
      eventName: 'order.created',
      version: 1,
      schemaDefinition: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    });
    const v2 = await createSchema(project.id, {
      eventName: 'order.created',
      version: 2,
      schemaDefinition: {
        type: 'object',
        properties: { id: { type: 'string' }, customerId: { type: 'string' } },
        required: ['id', 'customerId'],
      },
    });
    await expect(
      createSchema(project.id, {
        eventName: 'order.created',
        version: 1,
        schemaDefinition: { type: 'object' },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await Consumer.create({
      projectId: project.id,
      name: 'Orders consumer',
      eventName: 'order.created',
      expectedSchemaVersion: 1,
      handlerType: 'order-validation',
    });
    await createFixture(project.id, {
      eventName: 'order.created',
      schemaVersion: 1,
      payload: { id: 'evt_1' },
      description: 'Valid old event',
    });
    await expect(
      createFixture(project.id, {
        eventName: 'order.created',
        schemaVersion: 1,
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 422 });

    const comparison = await compareSchemaVersions(project.id, {
      oldSchemaId: v1.id,
      newSchemaId: v2.id,
    });
    expect(comparison.compatible).toBe(false);
    expect(await EventSchema.countDocuments({ projectId: project.id })).toBe(2);
    expect(await EventFixture.countDocuments({ projectId: project.id })).toBe(
      1,
    );

    const projectId = project.id;
    await deleteProject(projectId);
    project = null;
    expect(await Project.findById(projectId)).toBeNull();
    expect(await EventSchema.countDocuments({ projectId })).toBe(0);
    expect(await Consumer.countDocuments({ projectId })).toBe(0);
    expect(await EventFixture.countDocuments({ projectId })).toBe(0);
  });
});

if (mongoTestUri && !safeTestDatabase)
  console.warn(
    'MONGODB_TEST_URI ignored: its database name must contain "test".',
  );
