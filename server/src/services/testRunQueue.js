import { Kafka } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092')
  .split(',')
  .map((broker) => broker.trim());
const kafka = new Kafka({
  clientId: 'eventguard-api',
  brokers,
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

export async function enqueueTestRun(runId) {
  const client = await producer();
  await client.send({
    topic: process.env.KAFKA_TOPIC ?? 'eventguard.test-runs',
    acks: -1,
    messages: [{ key: runId, value: JSON.stringify({ runId }) }],
  });
}

export async function closeQueue() {
  if (producerPromise) await (await producerPromise).disconnect();
}
