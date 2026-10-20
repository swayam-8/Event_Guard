import * as service from '../services/resourceService.js';
import {
  validateConsumerBody,
  validateFixtureBody,
  validateProjectBody,
  validateSchemaBody,
  validateSchemaComparisonBody,
  validateSchemaPayloadBody,
} from '../validators/requests.js';
import { sendData } from '../utils/http.js';

export const createProject = async (req, res) =>
  sendData(
    res,
    await service.createProject(validateProjectBody(req.body)),
    201,
  );
export const listProjects = async (req, res) =>
  sendData(res, await service.listProjects(req.query));
export const getProject = async (req, res) =>
  sendData(res, await service.getProject(req.params.projectId));
export const updateProject = async (req, res) =>
  sendData(
    res,
    await service.updateProject(
      req.params.projectId,
      validateProjectBody(req.body, { partial: true }),
    ),
  );
export const deleteProject = async (req, res) => {
  await service.deleteProject(req.params.projectId);
  return res.status(204).end();
};

export const createSchema = async (req, res) =>
  sendData(
    res,
    await service.createSchema(
      req.params.projectId,
      validateSchemaBody(req.body),
    ),
    201,
  );
export const listSchemas = async (req, res) =>
  sendData(res, await service.listSchemas(req.params.projectId, req.query));
export const getSchema = async (req, res) =>
  sendData(
    res,
    await service.getSchema(req.params.projectId, req.params.schemaId),
  );
export const validateSchema = async (req, res) =>
  sendData(
    res,
    await service.validateSchemaPayload(
      req.params.projectId,
      req.params.schemaId,
      validateSchemaPayloadBody(req.body),
    ),
  );
export const compareSchemas = async (req, res) =>
  sendData(
    res,
    await service.compareSchemaVersions(
      req.params.projectId,
      validateSchemaComparisonBody(req.body),
    ),
  );

export const createConsumer = async (req, res) =>
  sendData(
    res,
    await service.createConsumer(
      req.params.projectId,
      validateConsumerBody(req.body),
    ),
    201,
  );
export const listConsumers = async (req, res) =>
  sendData(res, await service.listConsumers(req.params.projectId, req.query));
export const updateConsumer = async (req, res) =>
  sendData(
    res,
    await service.updateConsumer(
      req.params.projectId,
      req.params.consumerId,
      validateConsumerBody(req.body, { partial: true }),
    ),
  );
export const deleteConsumer = async (req, res) => {
  await service.deleteConsumer(req.params.projectId, req.params.consumerId);
  return res.status(204).end();
};

export const createFixture = async (req, res) =>
  sendData(
    res,
    await service.createFixture(
      req.params.projectId,
      validateFixtureBody(req.body),
    ),
    201,
  );
export const listFixtures = async (req, res) =>
  sendData(res, await service.listFixtures(req.params.projectId, req.query));
export const getFixture = async (req, res) =>
  sendData(
    res,
    await service.getFixture(req.params.projectId, req.params.fixtureId),
  );
export const deleteFixture = async (req, res) => {
  await service.deleteFixture(req.params.projectId, req.params.fixtureId);
  return res.status(204).end();
};
