import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', apiRouter);

  app.get('/api/health', (_request, response) => {
    const connected = mongoose.connection.readyState === 1;
    response.status(connected ? 200 : 503).json({
      success: connected,
      data: {
        status: connected ? 'ok' : 'unavailable',
        database: connected ? 'connected' : 'disconnected',
      },
    });
  });

  app.use((_request, response) => {
    response.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested API route was not found.',
        details: [],
      },
    });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must contain valid JSON.',
          details: [],
        },
      });
    }
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the 256 KB limit.',
          details: [],
        },
      });
    }
    if (error?.name === 'ValidationError') {
      return response.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'One or more fields are invalid.',
          details: Object.values(error.errors ?? {}).map((item) => ({
            field: item.path,
            message: item.message,
          })),
        },
      });
    }
    if (error?.name === 'CastError') {
      return response.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A field has an invalid value.',
          details: [{ field: error.path, message: 'Invalid value.' }],
        },
      });
    }
    if (error?.code === 11000) {
      return response.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A resource with these unique fields already exists.',
          details: [],
        },
      });
    }
    if (!error?.status || error.status >= 500)
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'API request failed',
          method: _request.method,
          path: _request.path,
          error: error?.code ?? error?.name ?? 'UNKNOWN',
        }),
      );
    return response.status(error?.status ?? 500).json({
      success: false,
      error: {
        code: error?.code ?? 'INTERNAL_ERROR',
        message: error?.status
          ? error.message
          : 'An unexpected server error occurred.',
        details:
          error?.status && Array.isArray(error.details) ? error.details : [],
      },
    });
  });

  return app;
}
