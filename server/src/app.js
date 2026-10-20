import express from 'express';
import mongoose from 'mongoose';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_request, response) => {
    const connected = mongoose.connection.readyState === 1;
    response.status(connected ? 200 : 503).json({
      success: connected,
      data: { status: connected ? 'ok' : 'unavailable', database: connected ? 'connected' : 'disconnected' },
    });
  });

  app.use((_request, response) => {
    response.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'The requested API route was not found.' },
    });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({
        success: false,
        error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' },
      });
    }
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 256 KB limit.' },
      });
    }
    return response.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
    });
  });

  return app;
}
