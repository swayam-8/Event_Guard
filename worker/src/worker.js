import 'dotenv/config';
import { Kafka } from 'kafkajs';
import mongoose from 'mongoose';
import { maxAttempts, processTestRun, validateJobMessage } from './jobs/testRunProcessor.js';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092')
  .split(',')
  .map((broker) => broker.trim())
  .filter(Boolean);
if (!brokers.length) throw new Error('KAFKA_BROKERS must contain at least one broker.');
if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
  throw new Error('WORKER_MAX_ATTEMPTS must be an integer from 1 to 10.');
const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID ?? 'eventguard'}-worker`,
  brokers,
  retry: { initialRetryTime: 300, retries: 10 },
});
const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID ?? 'eventguard-workers',
});
const deadLetterProducer = kafka.producer();

await mongoose.connect(
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/eventguard',
  { serverSelectionTimeoutMS: 10000 },
);
await consumer.connect();
await deadLetterProducer.connect();
await consumer.subscribe({
  topic: process.env.KAFKA_TOPIC ?? 'eventguard.test-runs',
  fromBeginning: false,
});
console.info(
  JSON.stringify({
    level: 'info',
    message: 'EventGuard worker connected',
    brokers,
  }),
);

async function deadLetter(topic, partition, message) {
  await deadLetterProducer.send({
    topic: `${process.env.KAFKA_TOPIC ?? 'eventguard.test-runs'}.dlq`,
    messages: [
      {
        key: `${partition}:${message.offset}`,
        value: message.value?.toString() ?? '',
      },
    ],
  });
  await consumer.commitOffsets([
    { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
  ]);
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Malformed job moved to dead-letter topic.',
      topic,
      partition,
      offset: message.offset,
    }),
  );
}

await consumer.run({
  autoCommit: false,
  eachMessage: async ({ topic, partition, message, heartbeat }) => {
    let job;
    try {
      job = JSON.parse(message.value?.toString() ?? '{}');
    } catch {
      await deadLetter(topic, partition, message);
      return;
    }
    if (!validateJobMessage(job)) {
      await deadLetter(topic, partition, message);
      return;
    }
    try {
      await processTestRun(job.runId, job.projectId);
      await consumer.commitOffsets([
        { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
      ]);
    } catch (error) {
      if (error?.code === 'INVALID_RUN_REFERENCE') {
        await deadLetter(topic, partition, message);
        return;
      }
      console.error(
        JSON.stringify({
          level: 'error',
          message:
          'Worker processing failed; the persisted run state determines bounded retries.',
          offset: message.offset,
          reason: error?.code ?? error?.name ?? 'PROCESSING_ERROR',
        }),
      );
      await heartbeat();
      throw error;
    }
  },
});

let shutdownPromise;
async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    await consumer.stop();
    await consumer.disconnect();
    await deadLetterProducer.disconnect();
    await mongoose.disconnect();
  })();
  return shutdownPromise;
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
