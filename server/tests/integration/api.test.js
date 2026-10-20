import request from 'supertest';
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
});
