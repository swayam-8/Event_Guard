import request from 'supertest';
import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { Project } from '../../../shared/src/models.js';

describe('API integration', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('creates a project with the common response envelope', async () => {
    vi.spyOn(Project, 'create').mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      name: 'Orders',
      description: '',
    });
    const response = await request(createApp())
      .post('/api/projects')
      .send({ name: 'Orders' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { name: 'Orders' },
    });
  });

  it('rejects missing project names and malformed JSON', async () => {
    const app = createApp();
    const missingName = await request(app)
      .post('/api/projects')
      .send({ description: 'no name' });
    const invalidJson = await request(app)
      .post('/api/projects')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(missingName.status).toBe(400);
    expect(invalidJson.status).toBe(400);
  });

  it('validates malformed resource identifiers before database access', async () => {
    const response = await request(createApp()).get('/api/projects/not-an-id');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 for missing projects and supports bounded pagination', async () => {
    const app = createApp();
    vi.spyOn(Project, 'findById').mockReturnValue({
      select: () => Promise.resolve(null),
    });
    const missing = await request(app).get(
      '/api/projects/507f1f77bcf86cd799439011',
    );
    expect(missing.status).toBe(404);
    const items = [{ name: 'page two' }];
    const list = {
      sort: () => ({
        skip: (value) => {
          expect(value).toBe(5);
          return {
            limit: (limit) => {
              expect(limit).toBe(5);
              return Promise.resolve(items);
            },
          };
        },
      }),
    };
    vi.spyOn(Project, 'find').mockReturnValue(list);
    vi.spyOn(Project, 'countDocuments').mockResolvedValue(6);
    const paginated = await request(app).get('/api/projects?page=2&limit=5');
    expect(paginated.body.data).toMatchObject({
      items,
      page: 2,
      limit: 5,
      total: 6,
    });
  });

  it('reports database readiness through the health endpoint', async () => {
    const originalState = mongoose.connection.readyState;
    try {
      mongoose.connection.readyState = 0;
      const unavailable = await request(createApp()).get('/api/health');
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.data.database).toBe('disconnected');
      mongoose.connection.readyState = 1;
      const ready = await request(createApp()).get('/api/health');
      expect(ready.status).toBe(200);
      expect(ready.body.data.database).toBe('connected');
    } finally {
      mongoose.connection.readyState = originalState;
    }
  });
});
