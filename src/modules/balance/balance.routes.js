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
router.get('/expense-detail/page', balanceController.getExpenseDetailPage);
router.get('/api/expense-detail', balanceController.getExpenseDetailData);

// Account (category) management
router.get('/api/accounts',                    balanceController.getAccounts);
router.get('/api/accounts/for-form',           balanceController.getAccountsForForm);
router.post('/api/accounts',                   balanceController.createAccount);
router.post('/api/accounts/:code/delete',      balanceController.deleteAccount);

module.exports = router;