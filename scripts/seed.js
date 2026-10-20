import { config } from 'dotenv';
config();
import mongoose from 'mongoose';
import { Consumer, EventFixture, EventSchema, Project } from '../shared/src/models.js';
import { env } from '../server/src/config/env.js';

const objectEvent = (properties, required) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', properties, required, additionalProperties: false,
});
const schemas = [
  { eventName: 'order.created', version: 1, schemaDefinition: await readFixtureSchema('../fixtures/order-created-v1.json') },
  { eventName: 'order.created', version: 2, schemaDefinition: await readFixtureSchema('../fixtures/order-created-v2-compatible.json') },
  { eventName: 'order.note', version: 1, schemaDefinition: objectEvent({ orderId: { type: 'string' } }, ['orderId']) },
  { eventName: 'order.note', version: 2, schemaDefinition: objectEvent({ orderId: { type: 'string' }, note: { type: 'string' } }, ['orderId']) },
  { eventName: 'order.updated', version: 1, schemaDefinition: objectEvent({ orderId: { type: 'string' }, customerId: { type: 'string' } }, ['orderId', 'customerId']) },
  { eventName: 'order.updated', version: 2, schemaDefinition: objectEvent({ orderId: { type: 'string' } }, ['orderId']) },
  { eventName: 'payment.authorized', version: 1, schemaDefinition: objectEvent({ paymentId: { type: 'string' }, amount: { type: 'number', minimum: 0 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' } }, ['paymentId', 'amount', 'currency']) },
  { eventName: 'payment.authorized', version: 2, schemaDefinition: objectEvent({ paymentId: { type: 'string' }, amount: { type: 'number', minimum: 0 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' } }, ['paymentId', 'amount', 'currency']) },
  { eventName: 'inventory.changed', version: 1, schemaDefinition: objectEvent({ productId: { type: 'string' }, quantity: { type: 'integer', minimum: 0 } }, ['productId', 'quantity']) },
  { eventName: 'inventory.changed', version: 2, schemaDefinition: objectEvent({ productId: { type: 'string' }, quantity: { type: 'integer', minimum: 0 } }, ['productId', 'quantity']) },
  { eventName: 'legacy.imported', version: 1, schemaDefinition: objectEvent({ recordId: { type: 'string' } }, ['recordId']) },
  { eventName: 'legacy.imported', version: 2, schemaDefinition: objectEvent({ recordId: { type: 'string' }, source: { type: 'string' } }, ['recordId']) },
];

async function readFixtureSchema(path) {
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

const consumers = [
  { name: 'Order fulfillment', eventName: 'order.created', expectedSchemaVersion: 1, handlerType: 'order-validation', invariants: [] },
  { name: 'Optional order note', eventName: 'order.note', expectedSchemaVersion: 1, handlerType: 'order-validation', invariants: [] },
  { name: 'Customer notifications', eventName: 'order.updated', expectedSchemaVersion: 1, handlerType: 'order-validation', invariants: [{ path: 'customerId', operator: 'exists', message: 'Customer notification requires customerId.' }] },
  { name: 'Payment ledger', eventName: 'payment.authorized', expectedSchemaVersion: 1, handlerType: 'payment-amount', invariants: [] },
  { name: 'Inventory projection', eventName: 'inventory.changed', expectedSchemaVersion: 1, handlerType: 'inventory-quantity', invariants: [] },
];

const fixtures = [
  { eventName: 'order.created', schemaVersion: 1, description: 'Older decimal order, valid in v1 but incompatible with v2', payload: { orderId: 'ord_1001', amount: 42.5 } },
  { eventName: 'order.created', schemaVersion: 2, description: 'Current valid USD order', payload: { orderId: 'ord_1002', amount: 43, currency: 'USD' } },
  { eventName: 'order.note', schemaVersion: 1, description: 'Compatible old order without optional note', payload: { orderId: 'ord_2001' } },
  { eventName: 'order.updated', schemaVersion: 2, description: 'New order event no longer carries the field an old consumer expects', payload: { orderId: 'ord_3001' } },
  { eventName: 'payment.authorized', schemaVersion: 1, description: 'Invalid historical payment amount (synthetic pre-existing error)', payload: { paymentId: 'pay_demo_1', amount: -25, currency: 'USD' } },
  { eventName: 'inventory.changed', schemaVersion: 1, description: 'Invalid historical inventory decrement (synthetic)', payload: { productId: 'sku_demo_1', quantity: -4 } },
  { eventName: 'legacy.imported', schemaVersion: 1, description: 'Pre-existing invalid fixture missing its required identifier', payload: { source: 'synthetic-import' } },
];

try {
  await mongoose.connect(env.mongoUri);
  const project = await Project.findOneAndUpdate(
    { name: 'EventGuard Demo' },
    { $setOnInsert: { description: 'Synthetic event samples covering compatibility and historical replay scenarios.' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  for (const schema of schemas)
    await EventSchema.findOneAndUpdate(
      { projectId: project.id, eventName: schema.eventName, version: schema.version },
      { $set: { schemaDefinition: schema.schemaDefinition } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );

  for (const consumer of consumers)
    await Consumer.findOneAndUpdate(
      { projectId: project.id, name: consumer.name },
      { $set: { ...consumer, projectId: project.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );

  for (const fixture of fixtures)
    await EventFixture.findOneAndUpdate(
      { projectId: project.id, eventName: fixture.eventName, schemaVersion: fixture.schemaVersion, description: fixture.description },
      { $set: { ...fixture, projectId: project.id } },
      // Deliberately bypass validation so the demo can include invalid historical data.
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

  console.info(JSON.stringify({ level: 'info', message: 'Demo data ready', projectId: project.id, schemas: schemas.length, consumers: consumers.length, fixtures: fixtures.length }));
} catch (error) {
  console.error(JSON.stringify({ level: 'error', message: 'Demo seed failed', reason: error.message }));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
