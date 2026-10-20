import client from './apiClient';

export const getProjects = async () => (await client.get('/projects')).items;
export const createProject = (data) => client.post('/projects', data);
export const getResource = async (projectId, resource) =>
  (await client.get(`/projects/${projectId}/${resource}`)).items;
export const createResource = (projectId, resource, data) =>
  client.post(`/projects/${projectId}/${resource}`, data);
export const createTestRun = (projectId, data) =>
  client.post(`/projects/${projectId}/test-runs`, data);
export const getTestRun = (projectId, runId) =>
  client.get(`/projects/${projectId}/test-runs/${runId}`);
export const getHealth = () => client.get('/health');
