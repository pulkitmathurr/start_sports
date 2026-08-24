const logger = require('../utils/logger');
const { errorResponse } = require('../utils/response');

const SENSITIVE_KEYS = new Set([
  'password', 'current_password', 'new_password',
  'access_token', 'refresh_token', 'token'
]);

const redactBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  const redacted = { ...body };
  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_KEYS.has(key)) redacted[key] = '[REDACTED]';
  }
  return redacted;
};

const errorMiddleware = (err, req, res, next) => {
  logger.error('Unhandled application error', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    body: redactBody(req.body),
    params: req.params,
    query: req.query,
    error_message: err.message,
    stack: err.stack
  });

  const isProd    = process.env.NODE_ENV === 'production';
  const isAppError = !!err.statusCode; // errors we threw intentionally (404, 409, etc.)

  return res.status(err.statusCode || 500).json(
    errorResponse(
      isProd && !isAppError
        ? 'An unexpected error occurred. Please try again.'
        : err.message || 'Internal Server Error'
    )
  );
};

module.exports = errorMiddleware;
