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
                body('password')
                    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
                    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
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