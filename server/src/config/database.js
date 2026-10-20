import mongoose from 'mongoose';
import { migrateLegacyResourceFields } from '../migrations/legacyFields.js';

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await migrateLegacyResourceFields();
  return mongoose.connection;
}
