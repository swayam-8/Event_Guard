import {
  handlerNames,
  validateInvariants,
} from '../../../shared/src/handlers.js';
import {
  assertObjectBody,
  HttpError,
  positiveInteger,
  requiredString,
} from '../utils/http.js';

const optionalDescription = (value) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 1000)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'description must be a string of at most 1000 characters.',
      [{ field: 'description', message: 'Expected at most 1000 characters.' }],
    );
  return value.trim();
};

export function validateProjectBody(body, { partial = false } = {}) {
  assertObjectBody(body, ['name', 'description']);
  const data = {};
  if (body.name !== undefined)
    data.name = requiredString(body.name, 'name', 120);
  else if (!partial) requiredString(undefined, 'name', 120);
  if (body.description !== undefined)
    data.description = optionalDescription(body.description);
  if (partial && !Object.keys(data).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Provide at least one project field to update.',
    );
  return data;
}

export function validateSchemaBody(body) {
  assertObjectBody(body, ['eventName', 'version', 'schemaDefinition']);
  return {
    eventName: requiredString(body.eventName, 'eventName', 160),
    version: positiveInteger(body.version, 'version'),
    schemaDefinition: body.schemaDefinition,
  };
}

export function validateConsumerBody(body, { partial = false } = {}) {
  assertObjectBody(body, [
    'name',
    'eventName',
    'expectedSchemaVersion',
    'handlerType',
    'enabled',
    'invariants',
  ]);
  const data = {};
  if (body.name !== undefined)
    data.name = requiredString(body.name, 'name', 120);
  else if (!partial) requiredString(undefined, 'name', 120);
  if (body.eventName !== undefined)
    data.eventName = requiredString(body.eventName, 'eventName', 160);
  else if (!partial) requiredString(undefined, 'eventName', 160);
  if (body.expectedSchemaVersion !== undefined)
    data.expectedSchemaVersion = positiveInteger(
      body.expectedSchemaVersion,
      'expectedSchemaVersion',
    );
  else if (!partial) positiveInteger(undefined, 'expectedSchemaVersion');
  if (body.handlerType !== undefined) {
    if (!handlerNames.includes(body.handlerType))
      throw new HttpError(
        400,
        'INVALID_HANDLER_TYPE',
        `handlerType must be one of: ${handlerNames.join(', ')}.`,
        [{ field: 'handlerType', message: 'Unsupported handler type.' }],
      );
    data.handlerType = body.handlerType;
  } else if (!partial) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'handlerType is required.', [
      { field: 'handlerType', message: 'Field is required.' },
    ]);
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean')
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'enabled must be a boolean.',
        [{ field: 'enabled', message: 'Expected true or false.' }],
      );
    data.enabled = body.enabled;
  }
  if (body.invariants !== undefined) {
    try {
      validateInvariants(body.invariants);
    } catch (error) {
      throw new HttpError(400, 'INVALID_INVARIANTS', error.message, [
        { field: 'invariants', message: error.message },
      ]);
    }
    data.invariants = body.invariants;
  }
  if (partial && !Object.keys(data).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Provide at least one consumer field to update.',
    );
  return data;
}

export function validateFixtureBody(body) {
  assertObjectBody(body, [
    'eventName',
    'schemaVersion',
    'payload',
    'description',
  ]);
  const payload = body.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'payload must be a JSON object.',
      [{ field: 'payload', message: 'Expected an object.' }],
    );
  const description = body.description === undefined ? '' : body.description;
  if (typeof description !== 'string' || description.length > 500)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'description must be a string of at most 500 characters.',
      [{ field: 'description', message: 'Expected at most 500 characters.' }],
    );
  return {
    eventName: requiredString(body.eventName, 'eventName', 160),
    schemaVersion: positiveInteger(body.schemaVersion, 'schemaVersion'),
    payload,
    description: description.trim(),
  };
}

export function validateSchemaComparisonBody(body) {
  assertObjectBody(body, ['oldSchemaId', 'newSchemaId']);
  return {
    oldSchemaId: requiredString(body.oldSchemaId, 'oldSchemaId', 24),
    newSchemaId: requiredString(body.newSchemaId, 'newSchemaId', 24),
  };
}

export function validatePreviewBody(body) {
  assertObjectBody(body, ['eventName', 'fromVersion', 'toVersion']);
  const eventName = requiredString(body.eventName, 'eventName', 160);
  const fromVersion = positiveInteger(body.fromVersion, 'fromVersion');
  const toVersion = positiveInteger(body.toVersion, 'toVersion');
  if (fromVersion >= toVersion)
    throw new HttpError(400, 'INVALID_SCHEMA_PAIR', 'toVersion must be greater than fromVersion.');
  return { eventName, fromVersion, toVersion };
}

export function validateSchemaPayloadBody(body) {
  assertObjectBody(body, ['payload']);
  if (!Object.hasOwn(body, 'payload'))
    throw new HttpError(400, 'VALIDATION_ERROR', 'payload is required.', [
      { field: 'payload', message: 'Field is required.' },
    ]);
  return body.payload;
}
