const express       = require('express');
const router        = express.Router();
const ctrl          = require('./billing.controller');
const { csrfProtect } = require('../../middlewares/csrf.middleware');

// Page
router.get('/',                 ctrl.billingPage);

// Razorpay flow
router.post('/create-order',    csrfProtect, ctrl.createOrder);
router.post('/verify-payment',  csrfProtect, ctrl.verifyPayment);

module.exports = router;