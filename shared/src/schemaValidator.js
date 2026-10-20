import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export class InvalidSchemaError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'InvalidSchemaError';
    this.status = 400;
    this.code = 'INVALID_SCHEMA';
    this.details = details;
  }
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateSchema: true,
});
addFormats(ajv);

export function assertJsonSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw new InvalidSchemaError('Schema must be a JSON object.', [
      { path: '$', keyword: 'type', message: 'Expected a JSON Schema object.' },
    ]);
  const supportedDraft = 'https://json-schema.org/draft/2020-12/schema';
  if (schema.$schema && schema.$schema !== supportedDraft)
    throw new InvalidSchemaError('Only JSON Schema Draft 2020-12 is supported.', [
      { field: 'schemaDefinition', path: '$.$schema', keyword: '$schema', message: 'Expected the Draft 2020-12 schema URI.' },
    ]);
  try {
    ajv.compile(schema);
  } catch (error) {
    throw new InvalidSchemaError('Schema document is invalid for JSON Schema Draft 2020-12.', [
      { field: 'schemaDefinition', path: '$', keyword: 'schema', message: error.message },
    ]);
  }
  return true;
}

export function validatePayload(schema, payload) {
  assertJsonSchema(schema);
  let validator;
  try {
    validator = ajv.compile(schema);
  } catch (error) {
    throw new InvalidSchemaError('Schema document is invalid for JSON Schema Draft 2020-12.', [
      { field: 'schemaDefinition', path: '$', keyword: 'schema', message: error.message },
    ]);
  }
  const valid = validator(payload);
  const toJsonPath = (instancePath) => {
    if (!instancePath) return '$';
    return instancePath.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
      .reduce((path, part) => /^\d+$/.test(part) ? `${path}[${part}]` :
        /^[A-Za-z_$][\w$]*$/.test(part) ? `${path}.${part}` : `${path}[${JSON.stringify(part)}]`, '$');
  };
  return {
    valid,
    errors: (validator.errors ?? []).map(({ instancePath, keyword, message, params }) => {
      const parentPath = toJsonPath(instancePath);
      const path = keyword === 'required' && params?.missingProperty
        ? `${parentPath}.${params.missingProperty}`
        : keyword === 'additionalProperties' && params?.additionalProperty
          ? `${parentPath}.${params.additionalProperty}`
          : parentPath;
      return { path, keyword, message, params };
    }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0),
  };
}
