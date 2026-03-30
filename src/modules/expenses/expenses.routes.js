const express = require('express');
const router = express.Router();
const controller = require('./expenses.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

// Page routes
router.get('/page', controller.getExpensesPage);

// FIX #7: /stats MUST stay above /:id — if swapped, Express will treat
// "stats" as an id and return "Expense not found" instead of stats data.
router.get('/stats', controller.getExpenseStats);

// API routes
router.get('/', controller.getExpenses);
router.get('/:id', controller.getExpenseById);
router.post('/add', controller.addExpense);
router.put('/:id', controller.updateExpense);
router.delete('/:id', controller.deleteExpense);

module.exports = router;