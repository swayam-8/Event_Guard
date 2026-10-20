import client from './apiClient';

export const getProjects = async () => {
  const first = await client.get('/projects', { params: { page: 1, limit: 100 } });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await client.get('/projects', { params: { page, limit: 100 } });
    items.push(...next.items);
  }
  return items;
};
export const createProject = (data) => client.post('/projects', data);
export const updateProject = (projectId, data) =>
  client.patch(`/projects/${projectId}`, data);
export const deleteProject = (projectId) => client.delete(`/projects/${projectId}`);
export const getResource = async (projectId, resource) => {
  const path = `/projects/${projectId}/${resource}`;
  const first = await client.get(path, { params: { page: 1, limit: 100 } });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await client.get(path, { params: { page, limit: 100 } });
    items.push(...next.items);
  }
  return items;
};
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
export const previewTestRun = (projectId, data) =>
  client.post(`/projects/${projectId}/test-runs/preview`, data);
export const getTestRun = (projectId, runId) =>
  client.get(`/projects/${projectId}/test-runs/${runId}`);
export const cancelTestRun = (projectId, runId) =>
  client.post(`/projects/${projectId}/test-runs/${runId}/cancel`);
export const getHealth = () => client.get('/health');
