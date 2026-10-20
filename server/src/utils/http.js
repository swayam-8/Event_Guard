export class HttpError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncRoute(handler) {
  return (request, response, next) =>
    Promise.resolve(handler(request, response, next)).catch(next);
}

export function sendData(response, data, status = 200) {
  return response.status(status).json({ success: true, data });
}

export function validateObjectId(value, label = 'resource') {
  if (!/^[a-f\d]{24}$/i.test(value ?? ''))
    throw new HttpError(400, 'INVALID_ID', `${label} id is invalid.`);
}

export function pagination(query) {
  const parse = (key, fallback, max = Number.MAX_SAFE_INTEGER) => {
    if (query[key] === undefined) return fallback;
    const value = Number(query[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new HttpError(
        400,
        'INVALID_PAGINATION',
        `${key} must be an integer between 1 and ${max}.`,
      );
    return value;
  };
  const page = parse('page', 1, Math.floor(Number.MAX_SAFE_INTEGER / 100));
  const limit = parse('limit', 25, 100);
  return { page, limit, skip: (page - 1) * limit };
}

export function assertObjectBody(body, allowedFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  const unexpected = Object.keys(body).filter(
    (key) => !allowedFields.includes(key),
  );
  if (unexpected.length)
    throw new HttpError(
      400,
      'UNEXPECTED_FIELDS',
      'Request contains unsupported fields.',
      unexpected.map((field) => ({ field, message: 'Field is not allowed.' })),
    );
}

export function requiredString(value, field, maxLength) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maxLength
  )
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must be a non-empty string of at most ${maxLength} characters.`,
      [{ field, message: `Expected 1 to ${maxLength} characters.` }],
    );
  return value.trim();
}

export function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must be a positive integer.`,
      [{ field, message: 'Expected a positive integer.' }],
    );
  return value;
}
