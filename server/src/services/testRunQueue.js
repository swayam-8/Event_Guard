import { Kafka } from 'kafkajs';
import { env } from '../config/env.js';

const kafka = new Kafka({
  clientId: env.kafkaClientId,
  brokers: env.kafkaBrokers,
  retry: { initialRetryTime: 300, retries: 5 },
});
let producerPromise;

async function producer() {
  producerPromise ??= (async () => {
    const instance = kafka.producer();
    await instance.connect();
    return instance;
  })();
  try {
    return await producerPromise;
  } catch (error) {
    producerPromise = undefined;
    throw error;
  }
}

export async function enqueueTestRun({ runId, projectId, createdAt = new Date() }) {
  const client = await producer();
  await client.send({
    topic: env.kafkaTopic,
    acks: -1,
    messages: [{
      key: runId,
      value: JSON.stringify({
        version: 1,
        runId,
        projectId: String(projectId),
        createdAt: new Date(createdAt).toISOString(),
      }),
    }],
  });
}

export async function closeQueue() {
  if (producerPromise) await (await producerPromise).disconnect();
}
