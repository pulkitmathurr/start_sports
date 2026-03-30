const { body }                = require('express-validator');
const { validatorMiddleware } = require('../../utils/response');

module.exports.validate = (method) => {
    switch (method) {

        case 'updateProfile': {
            return [
                body('name')
                    .notEmpty().withMessage('Name is required')
                    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

                body('email')
                    .notEmpty().withMessage('Email is required')
                    .isEmail().withMessage('Invalid email address'),

                body('phone')
                    .optional({ checkFalsy: true })
                    .matches(/^[0-9]{10}$/).withMessage('Phone must be a 10-digit number'),

                validatorMiddleware
            ];
        }

        case 'changePassword': {
            return [
                body('current_password')
                    .notEmpty().withMessage('Current password is required'),

                body('new_password')
                    .notEmpty().withMessage('New password is required')
                    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),

                body('confirm_password')
                    .notEmpty().withMessage('Please confirm your new password')
                    .custom((value, { req }) => {
                        if (value !== req.body.new_password) {
                            throw new Error('Passwords do not match');
                        }
                        return true;
                    }),

                validatorMiddleware
            ];
        }
    }
};