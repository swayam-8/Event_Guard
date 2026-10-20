import client from './apiClient';

export const getProjects = async () => (await client.get('/projects')).items;
export const createProject = (data) => client.post('/projects', data);
export const updateProject = (projectId, data) =>
  client.patch(`/projects/${projectId}`, data);
export const deleteProject = (projectId) => client.delete(`/projects/${projectId}`);
export const getResource = async (projectId, resource) =>
  (await client.get(`/projects/${projectId}/${resource}`)).items;
export const createResource = (projectId, resource, data) =>
  client.post(`/projects/${projectId}/${resource}`, data);
export const deleteResource = (projectId, resource, resourceId) =>
  client.delete(`/projects/${projectId}/${resource}/${resourceId}`);
export const updateConsumer = (projectId, consumerId, data) =>
  client.patch(`/projects/${projectId}/consumers/${consumerId}`, data);
export const validateSchemaPayload = (projectId, schemaId, payload) =>
  client.post(`/projects/${projectId}/schemas/${schemaId}/validate`, { payload });
export const compareSchemas = (projectId, data) =>
  client.post(`/projects/${projectId}/schemas/compare`, data);
export const createTestRun = (projectId, data) =>
  client.post(`/projects/${projectId}/test-runs`, data);
export const getTestRun = (projectId, runId) =>
  client.get(`/projects/${projectId}/test-runs/${runId}`);
export const cancelTestRun = (projectId, runId) =>
  client.post(`/projects/${projectId}/test-runs/${runId}/cancel`);
export const getHealth = () => client.get('/health');
