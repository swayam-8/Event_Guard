import {
  Consumer,
  EventFixture,
  EventSchema,
  Project,
  TestRun,
} from '../../../shared/src/models.js';
import { compareSchemas } from '../../../shared/src/compatibility.js';
import {
  assertJsonSchema,
  validatePayload,
} from '../../../shared/src/schemaValidator.js';
import { HttpError, pagination, validateObjectId } from '../utils/http.js';

const childModels = [EventFixture, Consumer, EventSchema, TestRun];

export async function requireProject(projectId) {
  validateObjectId(projectId, 'Project');
  const record = await Project.findById(projectId).select('+deleting');
  if (!record)
    throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  if (record.deleting)
    throw new HttpError(
      409,
      'PROJECT_DELETING',
      'Project deletion is in progress.',
    );
  return record;
}

function duplicateConflict(error, message) {
  if (error?.code === 11000)
    throw new HttpError(409, 'DUPLICATE_RESOURCE', message);
  throw error;
}

async function list(Model, projectId, query, extraFilters = []) {
  await requireProject(projectId);
  const { page, limit, skip } = pagination(query);
  const filter = { projectId };
  for (const [key, queryKey] of extraFilters) {
    if (query[queryKey] !== undefined && query[queryKey] !== '') {
      const value = query[queryKey];
      if (key === 'schemaVersion') {
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed) || parsed < 1)
          throw new HttpError(
            400,
            'INVALID_FILTER',
            'schemaVersion must be a positive integer.',
          );
        filter[key] = parsed;
      } else {
        filter[key] = value;
      }
    }
  }
  const [items, total] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Model.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

async function findChild(Model, projectId, resourceId, label) {
  await requireProject(projectId);
  validateObjectId(resourceId, label);
  const record = await Model.findOne({ _id: resourceId, projectId });
  if (!record)
    throw new HttpError(
      404,
      `${label.toUpperCase()}_NOT_FOUND`,
      `${label} was not found in this project.`,
    );
  return record;
}

export const createProject = (data) => Project.create(data);
export const listProjects = (query) => {
  const { page, limit, skip } = pagination(query);
  return Promise.all([
    Project.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Project.countDocuments(),
  ]).then(([items, total]) => ({ items, page, limit, total }));
};
export async function getProject(projectId) {
  return requireProject(projectId);
}
export async function updateProject(projectId, data) {
  await requireProject(projectId);
  return Project.findByIdAndUpdate(projectId, data, {
    new: true,
    runValidators: true,
  });
}
export async function deleteProject(projectId) {
  validateObjectId(projectId, 'Project');
  let record = await Project.findById(projectId).select('+deleting');
  if (!record)
    throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  if (!record.deleting) {
    record = await Project.findByIdAndUpdate(
      projectId,
      { deleting: true },
      { new: true },
    ).select('+deleting');
    if (!record)
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  }
  // Keep the parent row until all children have been deleted. This is safe on
  // standalone MongoDB (no replica set transaction requirement) and retryable.
  for (const Model of childModels)
    await Model.deleteMany({ projectId: record._id });
  await Project.findByIdAndDelete(record._id);
}

export async function createSchema(projectId, data) {
  await requireProject(projectId);
  assertJsonSchema(data.schemaDefinition);
  try {
    return await EventSchema.create({ ...data, projectId });
  } catch (error) {
    duplicateConflict(
      error,
      'This event version already exists in the project.',
    );
  }
}
export const listSchemas = (projectId, query) =>
  list(EventSchema, projectId, query, [['eventName', 'eventName']]);
export const getSchema = (projectId, schemaId) =>
  findChild(EventSchema, projectId, schemaId, 'schema');
export async function validateSchemaPayload(projectId, schemaId, payload) {
  const schema = await getSchema(projectId, schemaId);
  const result = validatePayload(schema.schemaDefinition, payload);
  return { ...result, schemaId: schema.id, version: schema.version };
}
export async function compareSchemaVersions(
  projectId,
  { oldSchemaId, newSchemaId },
) {
  const [oldSchema, newSchema] = await Promise.all([
    getSchema(projectId, oldSchemaId),
    getSchema(projectId, newSchemaId),
  ]);
  if (
    oldSchema.eventName !== newSchema.eventName ||
    oldSchema.version >= newSchema.version
  )
    throw new HttpError(
      400,
      'INVALID_SCHEMA_PAIR',
      'Schemas must belong to the same event and the old version must be lower.',
    );
  const findings = compareSchemas(
    oldSchema.schemaDefinition,
    newSchema.schemaDefinition,
    {
      oldVersion: oldSchema.version,
      newVersion: newSchema.version,
    },
  );
  return {
    eventName: oldSchema.eventName,
    oldSchemaId: oldSchema.id,
    newSchemaId: newSchema.id,
    oldVersion: oldSchema.version,
    newVersion: newSchema.version,
    compatible: findings.length === 0,
    findings,
    preliminary: true,
  };
}

export async function createConsumer(projectId, data) {
  await requireProject(projectId);
  const schema = await EventSchema.findOne({
    projectId,
    eventName: data.eventName,
    version: data.expectedSchemaVersion,
  });
  if (!schema)
    throw new HttpError(
      400,
      'SCHEMA_VERSION_NOT_FOUND',
      'The expected event schema version does not exist in this project.',
    );
  try {
    return await Consumer.create({ ...data, projectId });
  } catch (error) {
    duplicateConflict(
      error,
      'A consumer with this name already exists in the project.',
    );
  }
}
export const listConsumers = (projectId, query) =>
  list(Consumer, projectId, query, [['eventName', 'eventName']]);
export async function updateConsumer(projectId, consumerId, data) {
  await findChild(Consumer, projectId, consumerId, 'consumer');
  const eventName = data.eventName;
  const version = data.expectedSchemaVersion;
  if (eventName !== undefined || version !== undefined) {
    const current = await Consumer.findOne({ _id: consumerId, projectId });
    const schema = await EventSchema.findOne({
      projectId,
      eventName: eventName ?? current.eventName,
      version: version ?? current.expectedSchemaVersion,
    });
    if (!schema)
      throw new HttpError(
        400,
        'SCHEMA_VERSION_NOT_FOUND',
        'The expected event schema version does not exist in this project.',
      );
  }
  try {
    return await Consumer.findOneAndUpdate(
      { _id: consumerId, projectId },
      data,
      { new: true, runValidators: true },
    );
  } catch (error) {
    duplicateConflict(
      error,
      'A consumer with this name already exists in the project.',
    );
  }
}
export async function deleteConsumer(projectId, consumerId) {
  await findChild(Consumer, projectId, consumerId, 'consumer');
  await Consumer.findOneAndDelete({ _id: consumerId, projectId });
}

export async function createFixture(projectId, data) {
  await requireProject(projectId);
  const schema = await EventSchema.findOne({
    projectId,
    eventName: data.eventName,
    version: data.schemaVersion,
  });
  if (!schema)
    throw new HttpError(
      400,
      'SCHEMA_VERSION_NOT_FOUND',
      'The referenced event schema version does not exist in this project.',
      [{ field: 'schemaVersion', message: 'No matching event schema exists.' }],
    );
  const result = validatePayload(schema.schemaDefinition, data.payload);
  if (!result.valid)
    throw new HttpError(
      422,
      'INVALID_FIXTURE',
      'Fixture payload does not match its event schema.',
      result.errors.map((item) => ({
        field: item.path,
        message: item.message,
        keyword: item.keyword,
      })),
    );
  return EventFixture.create({ ...data, projectId });
}
export const listFixtures = (projectId, query) =>
  list(EventFixture, projectId, query, [
    ['eventName', 'eventName'],
    ['schemaVersion', 'schemaVersion'],
  ]);
export const getFixture = (projectId, fixtureId) =>
  findChild(EventFixture, projectId, fixtureId, 'fixture');
export async function deleteFixture(projectId, fixtureId) {
  await findChild(EventFixture, projectId, fixtureId, 'fixture');
  await EventFixture.findOneAndDelete({ _id: fixtureId, projectId });
}
