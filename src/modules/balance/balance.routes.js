const express = require('express');
const router = express.Router();
const balanceController = require('./balance.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

// Page routes
router.get('/page', balanceController.getBalanceSheetPage);

// API routes
router.get('/api/data', balanceController.getBalanceSheetData);
router.get('/api/monthly', balanceController.getMonthlyData);

module.exports = router;