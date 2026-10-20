import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { closeQueue } from './services/testRunQueue.js';

try {
  await connectDatabase(env.mongoUri);
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.info(
      JSON.stringify({
        level: 'info',
        message: 'EventGuard API listening',
        port: env.port,
      }),
    );
  });
  const shutdown = () =>
    server.close(async () => {
      try {
        await closeQueue();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'Queue shutdown failed',
            reason: error.message,
          }),
        );
      }
      await (await import('mongoose')).default.disconnect();
      process.exit(0);
    });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'API startup failed',
      reason: error.message,
    }),
  );
  process.exitCode = 1;
}
