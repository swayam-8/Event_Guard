import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
import { Kafka } from 'kafkajs';
import mongoose from 'mongoose';
import { processTestRun, validRunId } from './jobs/testRunProcessor.js';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092')
  .split(',')
  .map((broker) => broker.trim());
const kafka = new Kafka({
  clientId: 'eventguard-worker',
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
    if (!validRunId(job.runId)) {
      await deadLetter(topic, partition, message);
      return;
    }
    try {
      await processTestRun(job.runId);
      await consumer.commitOffsets([
        { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
      ]);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          message:
            'Worker job failed; Kafka will retry according to consumer policy.',
          offset: message.offset,
          reason: error.message,
        }),
      );
      await heartbeat();
      throw error;
    }
  },
});

async function shutdown() {
  await consumer.disconnect();
  await deadLetterProducer.disconnect();
  await mongoose.disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
