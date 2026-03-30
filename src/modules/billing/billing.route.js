const express = require('express');
const router  = express.Router();
const ctrl    = require('./billing.controller');

// Page
router.get('/', ctrl.billingPage);

// Actions
router.post('/subscribe', ctrl.subscribe);

module.exports = router;