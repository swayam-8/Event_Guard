import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

class SchemaValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'INVALID_SCHEMA';
  }
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateSchema: true,
});
addFormats(ajv);

export function assertJsonSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw new SchemaValidationError('Schema must be a JSON object.');
  try {
    ajv.compile(schema);
  } catch (error) {
    throw new SchemaValidationError(`Invalid JSON Schema: ${error.message}`);
  }
}

export function validatePayload(schema, payload) {
  const validator = ajv.compile(schema);
  const valid = validator(payload);
  return {
    valid,
    errors: (validator.errors ?? []).map(
      ({ instancePath, keyword, message, params }) => ({
        path: instancePath || '/',
        keyword,
        message,
        params,
      }),
    ),
  };
}
