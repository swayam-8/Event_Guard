import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

export const env = Object.freeze({
  port,
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/eventguard',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
});
