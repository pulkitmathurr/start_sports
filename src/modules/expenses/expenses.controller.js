const expenseService = require('./expenses.service');
const { successResponse } = require('../../utils/response');

// ➕ Add Expense
const addExpense = async (req, res, next) => {
  try {
    const result = await expenseService.addExpense(req.body);
    return res.status(201).json(successResponse('Expense added successfully', result));
  } catch (err) {
    next(err);
  }
};

// 📋 Get Expenses with Pagination & Filters
const getExpenses = async (req, res, next) => {
  try {
    const category = req.query.category || null;
    const date_from = req.query.date_from || null;
    const date_to = req.query.date_to || null;
    const search = req.query.search || null;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const expenses = await expenseService.getExpenses({ category, date_from, date_to, search, limit, offset });
    const totalRecords = await expenseService.getTotalExpensesCount({ category, date_from, date_to, search });
    const totalPages = Math.ceil(totalRecords / limit);

    return res.json(successResponse('Expenses fetched', {
      expenses,
      pagination: { currentPage: page, totalPages, totalRecords, limit }
    }));
  } catch (err) {
    next(err);
  }
};

// 📊 Get Expense Stats
const getExpenseStats = async (req, res, next) => {
  try {
    const stats = await expenseService.getExpenseStats();
    return res.json(successResponse('Stats fetched', stats));
  } catch (err) {
    next(err);
  }
};

// 🗑️ Delete Expense
const deleteExpense = async (req, res, next) => {
  try {
    await expenseService.deleteExpense(req.params.id);
    return res.json(successResponse('Expense deleted successfully'));
  } catch (err) {
    next(err);
  }
};

// 📝 Get Expense by ID
const getExpenseById = async (req, res, next) => {
  try {
    const expense = await expenseService.getExpenseById(req.params.id);
    return res.json(successResponse('Expense fetched', expense));
  } catch (err) {
    next(err);
  }
};

// ✏️ Update Expense
const updateExpense = async (req, res, next) => {
  try {
    await expenseService.updateExpense(req.params.id, req.body);
    return res.json(successResponse('Expense updated successfully'));
  } catch (err) {
    next(err);
  }
};

const getExpensesPage = (req, res) => {
  return res.render('expenses/index', {
    title: 'Expenses',
    activePage: 'expenses'
  });
};

module.exports = {
  addExpense,
  getExpenses,
  getExpenseStats,
  deleteExpense,
  getExpenseById,
  updateExpense,
  getExpensesPage,
};