export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Express 4 does not catch rejected promises, so wrap async handlers. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'not_found', 'Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: 'Request is too large' } });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Invalid JSON body' } });
  }
  console.error(err);
  return res
    .status(500)
    .json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
}
