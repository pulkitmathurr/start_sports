const { body }              = require('express-validator');
const { validatorMiddleware } = require('../../utils/response.js');

module.exports.validate = (method) => {
    switch (method) {
        case 'login': {
            return [
                body('email').isEmail().withMessage('Enter Email and Password'),
                body('password').isString().withMessage('Password required'),
                validatorMiddleware
            ];
        }
        case 'register': {
            return [
                body('name').notEmpty().withMessage('Name required'),
                body('email').isEmail().withMessage('Invalid email'),
                body('password').isLength({ min: 6 }).withMessage('Password min 6 characters'),
                validatorMiddleware
            ];
        }
        case 'refresh': {
            return [
                body('refresh_token').notEmpty().withMessage('Refresh token required'),
                validatorMiddleware
            ];
        }
    }
};