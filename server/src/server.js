import { env } from './config/env.js';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { closeQueue } from './services/testRunQueue.js';

let stopping = false;
let retryTimer;
let retryDelay = 1000;

const server = createApp().listen(env.port, () => {
  console.info(
    JSON.stringify({
      level: 'info',
      message: 'EventGuard API listening',
      port: env.port,
    }),
  );
});

async function connectWithRetry() {
  try {
    await connectDatabase(env.mongoUri);
    retryDelay = 1000;
    console.info(
      JSON.stringify({ level: 'info', message: 'MongoDB connected' }),
    );
  } catch {
    if (stopping) return;
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'MongoDB unavailable; API health will report degraded status',
      }),
    );
    retryTimer = setTimeout(connectWithRetry, retryDelay);
    retryTimer.unref();
    retryDelay = Math.min(retryDelay * 2, 30000);
  }
}

void connectWithRetry();

const shutdown = () => {
  stopping = true;
  clearTimeout(retryTimer);
  server.close(async () => {
    try {
      await closeQueue();
    } catch {
      console.error(
        JSON.stringify({ level: 'error', message: 'Queue shutdown failed' }),
      );
    }
    await (await import('mongoose')).default.disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
