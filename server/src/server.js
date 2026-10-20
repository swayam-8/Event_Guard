import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

try {
  await connectDatabase(env.mongoUri);
  const app = createApp();
  app.listen(env.port, () => {
    console.info(JSON.stringify({ level: 'info', message: 'EventGuard API listening', port: env.port }));
  });
} catch (error) {
  console.error(JSON.stringify({ level: 'error', message: 'API startup failed', reason: error.message }));
  process.exitCode = 1;
}
