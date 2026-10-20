export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
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
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 25),
  );
  return { page, limit, skip: (page - 1) * limit };
}
