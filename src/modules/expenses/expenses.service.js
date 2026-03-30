const db = require("../../config/db.config");

// Account Code Mapping for Balance Sheet
const accountCodeMap = {
  // Direct Expenses
  Labour: "250",
  Production: "251",
  Selling: "252",
  Warehouse: "253",
  Vehicle: "254",
  "Turf Maintenance": "255",
  "Pitch Preparation": "256",
  "Equipment Repair": "257",
  Consumables: "258",

  // Indirect Expenses
  Salary: "260",
  Communication: "261",
  Utilities: "262",
  Electricity: "263",
  Maintenance: "264",
  Rent: "265",
  Insurance: "266",
  Taxes: "267",
  Other: "268", // FIX #5: was "265" (same as Rent) — changed to unique code "268"

  // Asset & Income
  Equipment: "301",
  Interest: "310",
  Scrap: "311",
};

// Income categories (these appear on Credit side)
const incomeCategories = ["Interest", "Scrap"];

// ➕ Add Expense
const addExpense = async ({
  title,
  amount,
  category,
  payment_mode,
  expense_date,
  notes,
  vendor,
}) => {
  if (!title || !amount || !expense_date) {
    throw new Error("Title, amount and date are required");
  }

  // FIX #6: Validate amount is a positive number
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  // Default category if not provided
  const expenseCategory = category || "Other";

  // Get account code based on category
  const account_code = accountCodeMap[expenseCategory] || "268";

  // Determine if this is income or expense
  const income_type = incomeCategories.includes(expenseCategory) ? 1 : 0;

  const [result] = await db.promise().query(
    `INSERT INTO tbl_expenses 
         (title, amount, category, account_code, income_type, payment_mode, expense_date, notes, vendor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      parsedAmount,
      expenseCategory,
      account_code,
      income_type,
      payment_mode || "cash",
      expense_date,
      notes || null,
      vendor || null,
    ],
  );

  return { id: result.insertId };
};

// 📋 Get Expenses with Pagination & Filters
const getExpenses = async ({
  category,
  date_from,
  date_to,
  search,
  limit = 10,
  offset = 0,
}) => {
  let query = `SELECT * FROM tbl_expenses WHERE flag = 0`;
  const params = [];

  if (category && category !== "all") {
    query += " AND category = ?";
    params.push(category);
  }

  if (date_from) {
    query += " AND expense_date >= ?";
    params.push(date_from);
  }

  if (date_to) {
    query += " AND expense_date <= ?";
    params.push(date_to);
  }

  if (search) {
    query += " AND (title LIKE ? OR vendor LIKE ? OR notes LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += " ORDER BY expense_date DESC, created_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));

  const [rows] = await db.promise().query(query, params);
  return rows;
};

// 📊 Get Total Expenses Count
const getTotalExpensesCount = async ({
  category,
  date_from,
  date_to,
  search,
}) => {
  let query = `SELECT COUNT(*) as total FROM tbl_expenses WHERE flag = 0`;
  const params = [];

  if (category && category !== "all") {
    query += " AND category = ?";
    params.push(category);
  }

  if (date_from) {
    query += " AND expense_date >= ?";
    params.push(date_from);
  }

  if (date_to) {
    query += " AND expense_date <= ?";
    params.push(date_to);
  }

  if (search) {
    query += " AND (title LIKE ? OR vendor LIKE ? OR notes LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const [rows] = await db.promise().query(query, params);
  return rows[0].total;
};

// 📊 Get Expense Stats
const getExpenseStats = async () => {
  const [total] = await db.promise().query(
    `SELECT 
            COALESCE(SUM(amount), 0) as total_amount,
            COUNT(*) as total_count,
            COALESCE(SUM(CASE WHEN MONTH(expense_date) = MONTH(CURDATE()) AND YEAR(expense_date) = YEAR(CURDATE()) THEN amount ELSE 0 END), 0) as monthly_total
        FROM tbl_expenses WHERE flag = 0`,
  );

  const [categoryStats] = await db.promise().query(
    `SELECT 
            category,
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as count
        FROM tbl_expenses 
        WHERE flag = 0 
        GROUP BY category 
        ORDER BY total DESC 
        LIMIT 5`,
  );

  return {
    total: total[0],
    categoryStats,
  };
};

// 🗑️ Delete Expense
const deleteExpense = async (id) => {
  await db
    .promise()
    .query("UPDATE tbl_expenses SET flag = 1 WHERE id = ?", [id]);
  return true;
};

// 📝 Get Expense by ID
const getExpenseById = async (id) => {
  const [rows] = await db
    .promise()
    .query("SELECT * FROM tbl_expenses WHERE id = ? AND flag = 0", [id]);
  if (rows.length === 0) throw new Error("Expense not found");
  return rows[0];
};

// ✏️ Update Expense
const updateExpense = async (id, data) => {
  const { title, amount, category, payment_mode, expense_date, notes, vendor } =
    data;

  // FIX #6: Validate amount on update too
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  // Get account code based on updated category
  const expenseCategory = category || "Other";
  const account_code = accountCodeMap[expenseCategory] || "268";
  const income_type = incomeCategories.includes(expenseCategory) ? 1 : 0;

  await db.promise().query(
    `UPDATE tbl_expenses 
         SET title = ?, amount = ?, category = ?, account_code = ?, income_type = ?,
             payment_mode = ?, expense_date = ?, notes = ?, vendor = ?
         WHERE id = ? AND flag = 0`,
    [
      title,
      parsedAmount,
      expenseCategory,
      account_code,
      income_type,
      payment_mode,
      expense_date,
      notes || null,
      vendor || null,
      id,
    ],
  );
  return true;
};

module.exports = {
  addExpense,
  getExpenses,
  getTotalExpensesCount,
  getExpenseStats,
  deleteExpense,
  getExpenseById,
  updateExpense,
};