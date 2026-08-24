const expenseService = require('./expenses.service');
const { successResponse } = require('../../utils/response');

// ➕ Add Expense
const addExpense = async (req, res, next) => {
  try {
    const result = await expenseService.addExpense({
      ...req.body,
      tenant_id: req.tenant ? req.tenant.id : null,
      ground_id: req.body.ground_id || 0,
    });
    return res.status(201).json(successResponse('Expense added successfully', result));
  } catch (err) { next(err); }
};

// 📋 Get Expenses with Pagination & Filters
const getExpenses = async (req, res, next) => {
  try {
    const category     = req.query.category     || null;
    const expense_type = req.query.expense_type || null;
    const ground_id    = (req.query.ground_id && req.query.ground_id !== 'all') ? req.query.ground_id : null;
    const date_from    = req.query.date_from    || null;
    const date_to      = req.query.date_to      || null;
    const search       = req.query.search       || null;
    const page         = parseInt(req.query.page) || 1;
    const limit        = parseInt(req.query.limit) || 10;
    const offset       = (page - 1) * limit;

    const expenses = await expenseService.getExpenses({ 
      category, expense_type, ground_id, date_from, date_to, search, limit, offset,
      tenant_id: req.tenant ? req.tenant.id : null,
      user_role: req.user.role
    });
    
    const totalRecords = await expenseService.getTotalExpensesCount({ 
      category, expense_type, ground_id, date_from, date_to, search,
      tenant_id: req.tenant ? req.tenant.id : null,
      user_role: req.user.role
    });
    
    const totalPages = Math.ceil(totalRecords / limit);
    return res.json(successResponse('Expenses fetched', {
      expenses,
      pagination: { currentPage: page, totalPages, totalRecords, limit }
    }));
  } catch (err) { next(err); }
};

// 📊 Get Expense Stats
const getExpenseStats = async (req, res, next) => {
  try {
    const stats = await expenseService.getExpenseStats(
      req.tenant ? req.tenant.id : null, req.user.role
    );
    return res.json(successResponse('Stats fetched', stats));
  } catch (err) { next(err); }
};

// 🗑️ Delete Expense
const deleteExpense = async (req, res, next) => {
  try {
    await expenseService.deleteExpense(
      req.params.id, req.tenant ? req.tenant.id : null, req.user.role
    );
    return res.json(successResponse('Expense deleted successfully'));
  } catch (err) { next(err); }
};

// 📝 Get Expense by ID
const getExpenseById = async (req, res, next) => {
  try {
    const expense = await expenseService.getExpenseById(
      req.params.id, req.tenant ? req.tenant.id : null, req.user.role
    );
    return res.json(successResponse('Expense fetched', expense));
  } catch (err) { next(err); }
};

// ✏️ Update Expense
const updateExpense = async (req, res, next) => {
  try {
    await expenseService.updateExpense(
      req.params.id, req.body,
      req.tenant ? req.tenant.id : null, req.user.role
    );
    return res.json(successResponse('Expense updated successfully'));
  } catch (err) { next(err); }
};

// 🏠 Expenses Page — fetches grounds list, safe fallback if DB not migrated yet
const getExpensesPage = async (req, res, next) => {
  try {
    let grounds = [];
    try {
      grounds = await expenseService.getGroundsForExpense(
        req.tenant ? req.tenant.id : null,
        req.user.role
      );
    } catch (groundErr) {
      console.error('Could not load grounds for expense page (non-fatal):', groundErr.message);
    }
    return res.render('expenses/index', {
      title: 'Expenses',
      activePage: 'expenses',
      user: res.locals.user,
      tenant: req.tenant,
      grounds,
    });
  } catch (err) { next(err); }
};

module.exports = {
  addExpense, getExpenses, getExpenseStats,
  deleteExpense, getExpenseById, updateExpense, getExpensesPage,
};