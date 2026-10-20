import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

const api = vi.hoisted(() => ({
  cancelTestRun: vi.fn(), createProject: vi.fn(), createResource: vi.fn(),
  createTestRun: vi.fn(), compareSchemas: vi.fn(), deleteProject: vi.fn(),
  deleteResource: vi.fn(), getHealth: vi.fn(), getProjects: vi.fn(),
  getResource: vi.fn(), getTestRun: vi.fn(), previewTestRun: vi.fn(),
  updateConsumer: vi.fn(), updateProject: vi.fn(), validateSchemaPayload: vi.fn(),
}));
vi.mock('./api/eventGuardApi', () => api);

const project = { _id: '507f191e810c19729de860ea', name: 'Orders API', description: 'Contracts' };
const queuedRun = { _id: '507f1f77bcf86cd799439011', eventName: 'order.created', fromVersion: 1, toVersion: 2, status: 'queued', createdAt: '2026-10-20T12:00:00Z' };

function mount(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('EventGuard frontend flows', () => {
  it('renders the real project empty state and offers project navigation', async () => {
    api.getProjects.mockResolvedValue([]);
    api.getHealth.mockResolvedValue({ status: 'ok' });

    mount();

    expect(await screen.findByText(/Choose a project/)).toBeTruthy();
    expect(screen.getByText(/0\s*projects?/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Projects/ })).toBeTruthy();
  });

  it('validates and creates a project through the API', async () => {
    api.getProjects.mockResolvedValueOnce([]).mockResolvedValue([project]);
    api.getHealth.mockResolvedValue({ status: 'ok' });
    api.createProject.mockResolvedValue(project);

    mount('/projects');
    const form = screen.getByRole('button', { name: 'Create project' }).closest('form');
    const name = screen.getByLabelText('Project name');
    expect(name.required).toBe(true);
    fireEvent.change(name, { target: { value: 'Orders API' } });
    expect(form.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith({ name: 'Orders API', description: '' }));
    expect((await screen.findAllByText('Orders API')).length).toBeGreaterThan(0);
  });

  it('polls queued runs and shows completed execution separately from a failing outcome', async () => {
    api.getProjects.mockResolvedValue([project]);
    api.getHealth.mockResolvedValue({ status: 'ok' });
    api.getResource.mockImplementation((_id, type) => Promise.resolve(type === 'schemas' ? [
      { _id: 'schema-1', eventName: 'order.created', version: 1 },
      { _id: 'schema-2', eventName: 'order.created', version: 2 },
    ] : [queuedRun]));
    api.getTestRun
      .mockResolvedValueOnce(queuedRun)
      .mockResolvedValue({
        ...queuedRun,
        status: 'completed',
        outcome: 'fail',
        durationMs: 18,
        summary: { fixturesFailed: 1 },
        results: [{ type: 'compatibility', code: 'NEW_REQUIRED_PROPERTY', message: 'currency is now required', path: '$.currency' }],
        report: { compatibility: { compatible: false, analysisComplete: true, findings: [{ code: 'NEW_REQUIRED_PROPERTY', severity: 'error', message: 'currency is now required', path: '$.currency' }] }, fixtures: [] },
      });

    mount('/test-runs');
    await screen.findByText(/order.created · v1 → v2/);
    fireEvent.click(screen.getByText(/order.created · v1 → v2/).closest('button'));

    await waitFor(() => {
      expect(screen.getByText('EXECUTION').parentElement.querySelector('strong').textContent).toBe('completed');
      expect(screen.getByText('TEST OUTCOME').parentElement.querySelector('strong').textContent).toBe('fail');
    }, { timeout: 7000 });
    expect(screen.getAllByText(/NEW_REQUIRED_PROPERTY/).length).toBeGreaterThan(0);
    expect(api.getTestRun.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 10000);

  it('shows API failures as a user-facing workspace error', async () => {
    api.getProjects.mockRejectedValue(new Error('API unavailable'));
    api.getHealth.mockRejectedValue(new Error('API unavailable'));

    mount();

    expect((await screen.findByRole('alert')).textContent).toContain('API unavailable');
  });
});
