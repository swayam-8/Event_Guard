import {
  Consumer,
  EventFixture,
  EventSchema,
} from '../../../shared/src/models.js';
import mongoose from 'mongoose';

export async function migrateLegacyResourceFields() {
  const collections = new Set(
    (
      await mongoose.connection.db
        .listCollections({}, { nameOnly: true })
        .toArray()
    ).map(({ name }) => name),
  );
  if (collections.has(EventSchema.collection.collectionName))
    await EventSchema.collection.updateMany(
      { schemaDefinition: { $exists: false }, schema: { $exists: true } },
      [{ $set: { schemaDefinition: '$schema' } }, { $unset: 'schema' }],
    );
  if (collections.has(Consumer.collection.collectionName))
    await Consumer.collection.updateMany(
      { handlerType: { $exists: false }, handler: { $exists: true } },
      [{ $set: { handlerType: '$handler' } }, { $unset: 'handler' }],
    );
  if (!collections.has(EventFixture.collection.collectionName)) return;
  const indexes = await EventFixture.collection.indexes();
  const obsoleteUniqueIndex = indexes.find(
    (index) =>
      index.unique &&
      index.key?.projectId === 1 &&
      index.key?.eventName === 1 &&
      index.key?.schemaVersion === 1 &&
      index.key?.description === 1,
  );
  if (obsoleteUniqueIndex)
    await EventFixture.collection.dropIndex(obsoleteUniqueIndex.name);
}
