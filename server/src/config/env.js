import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const mongoUri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/eventguard';
if (!/^mongodb(?:\+srv)?:\/\//.test(mongoUri))
  throw new Error('MONGODB_URI must be a MongoDB connection URI.');
const kafkaBrokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092')
  .split(',')
  .map((broker) => broker.trim())
  .filter(Boolean);
if (!kafkaBrokers.length) throw new Error('KAFKA_BROKERS must contain at least one broker.');

export const env = Object.freeze({
  port,
  mongoUri,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  kafkaBrokers,
  kafkaClientId: process.env.KAFKA_CLIENT_ID ?? 'eventguard-api',
  kafkaTopic: process.env.KAFKA_TOPIC ?? 'eventguard.test-runs',
  kafkaGroupId: process.env.KAFKA_GROUP_ID ?? 'eventguard-workers',
  workerMaxAttempts: Number(process.env.WORKER_MAX_ATTEMPTS ?? 3),
});

if (!Number.isInteger(env.workerMaxAttempts) || env.workerMaxAttempts < 1 || env.workerMaxAttempts > 10)
  throw new Error('WORKER_MAX_ATTEMPTS must be an integer from 1 to 10.');
