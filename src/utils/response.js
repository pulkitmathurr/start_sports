const { validationResult } = require('express-validator');

const successResponse = (message, data = {}) => {
  return {
    success: true,
    message,
    data
  };
};

const errorResponse = (message, data = {}) => {
  return {
    success: false,
    message,
    data
  };
};

function validatorMiddleware(req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res
            .status(422)
            .json(errorResponse(errors.errors[0].msg, {}))
    } else {
        next()
    }
}

module.exports = {
  successResponse,
  errorResponse,
  validatorMiddleware
};