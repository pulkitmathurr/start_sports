const { body, query } = require('express-validator');
const { validatorMiddleware } = require('../../utils/response');

module.exports.validate = (method) => {
    switch (method) {

        // ── GET /api/slots?date= ───────
        case 'getSlots': {
            return [
                query('date')
                    .notEmpty().withMessage('date is required')
                    .isDate().withMessage('date must be in YYYY-MM-DD format'),
                validatorMiddleware
            ];
        }

        // ── POST /api/bookings ──
        case 'submitBooking': {
            return [
                body('slot_id')
                    .notEmpty().withMessage('slot_id is required')
                    .isInt({ min: 1 }).withMessage('slot_id must be a valid integer'),

                body('slot_date')
                    .notEmpty().withMessage('slot_date is required')
                    .isDate().withMessage('slot_date must be in YYYY-MM-DD format'),

                body('customer_name')
                    .notEmpty().withMessage('customer_name is required')
                    .isLength({ min: 2, max: 100 }).withMessage('customer_name must be 2-100 characters'),

                body('customer_phone')
                    .notEmpty().withMessage('customer_phone is required')
                    .matches(/^[0-9]{10}$/).withMessage('customer_phone must be a 10-digit number'),

                body('customer_email')
                    .optional()
                    .isEmail().withMessage('customer_email must be a valid email address'),

                body('notes')
                    .optional()
                    .isLength({ max: 500 }).withMessage('notes must not exceed 500 characters'),

                validatorMiddleware
            ];
        }

        // ── GET /api/bookings/status ──────────────
        case 'getStatus': {
            return [
                query('booking_no')
                    .notEmpty().withMessage('booking_no is required'),

                query('customer_phone')
                    .notEmpty().withMessage('customer_phone is required')
                    .matches(/^[0-9]{10}$/).withMessage('customer_phone must be a 10-digit number'),

                validatorMiddleware
            ];
        }

        // ── POST /api/grounds/bookings ────────────
        case 'submitGroundBooking': {
            return [
                body('ground_id')
                    .notEmpty().withMessage('ground_id is required')
                    .isInt({ min: 1 }).withMessage('ground_id must be a valid integer'),

                body('slot_id')
                    .notEmpty().withMessage('slot_id is required')
                    .isInt({ min: 1 }).withMessage('slot_id must be a valid integer'),

                body('slot_date')
                    .notEmpty().withMessage('slot_date is required')
                    .isDate().withMessage('slot_date must be in YYYY-MM-DD format'),

                body('customer_name')
                    .notEmpty().withMessage('customer_name is required')
                    .isLength({ min: 2, max: 100 }).withMessage('customer_name must be 2-100 characters'),

                body('customer_phone')
                    .notEmpty().withMessage('customer_phone is required')
                    .matches(/^[0-9]{10}$/).withMessage('customer_phone must be a 10-digit number'),

                body('customer_email')
                    .optional()
                    .isEmail().withMessage('customer_email must be a valid email address'),

                body('notes')
                    .optional()
                    .isLength({ max: 500 }).withMessage('notes must not exceed 500 characters'),

                validatorMiddleware
            ];
        }
    }
};