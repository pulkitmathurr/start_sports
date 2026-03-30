const { body }               = require('express-validator');
const { validatorMiddleware } = require('../../utils/response');

// Validation rules for tenant signup form
const signupValidator = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Your full name is required'),

    body('email')
        .trim()
        .isEmail()
        .withMessage('Please enter a valid email address'),

    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),

    body('business_name')
        .trim()
        .notEmpty()
        .withMessage('Business / ground name is required'),

    body('phone')
        .optional({ checkFalsy: true })
        .isMobilePhone('en-IN')
        .withMessage('Please enter a valid Indian mobile number'),

    body('plan_id')
        .optional({ checkFalsy: true })
        .isInt({ min: 1 })
        .withMessage('Invalid plan selected'),

    validatorMiddleware
];

module.exports = { signupValidator };