import { config } from 'dotenv';
config();
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import {
  Consumer,
  EventFixture,
  EventSchema,
  Project,
} from '../shared/src/models.js';
import { env } from '../server/src/config/env.js';

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

try {
  await mongoose.connect(env.mongoUri);
  const project = await Project.findOneAndUpdate(
    { name: 'EventGuard Demo' },
    {
      $setOnInsert: {
        description:
          'Sample order events for deterministic compatibility checks.',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const v1 = await readJson('../fixtures/order-created-v1.json');
  const v2 = await readJson('../fixtures/order-created-v2-compatible.json');
  await EventSchema.findOneAndUpdate(
    { projectId: project.id, eventName: 'order.created', version: 1 },
    { $setOnInsert: { schemaDefinition: v1 } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await EventSchema.findOneAndUpdate(
    { projectId: project.id, eventName: 'order.created', version: 2 },
    { $setOnInsert: { schemaDefinition: v2 } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await Consumer.findOneAndUpdate(
    { projectId: project.id, name: 'Order fulfillment' },
    {
      $setOnInsert: {
        eventName: 'order.created',
        expectedSchemaVersion: 1,
        handlerType: 'order-validation',
        enabled: true,
        invariants: [],
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
  const fixtures = [
    {
      schemaVersion: 1,
      description: 'Older decimal order, valid in v1 but incompatible with v2',
      payload: await readJson('../fixtures/order-created-v1-event.json'),
    },
    {
      schemaVersion: 2,
      description: 'Current valid USD order',
      payload: await readJson('../fixtures/order-created-v2-event.json'),
    },
  ];
  for (const fixture of fixtures)
    await EventFixture.findOneAndUpdate(
      {
        projectId: project.id,
        eventName: 'order.created',
        schemaVersion: fixture.schemaVersion,
        description: fixture.description,
      },
      { $setOnInsert: fixture },
      { upsert: true, setDefaultsOnInsert: true },
    );
  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Demo data ready',
      projectId: project.id,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Demo seed failed',
      reason: error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
