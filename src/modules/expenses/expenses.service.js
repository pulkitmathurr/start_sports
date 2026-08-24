const db = require("../../config/db.config");

// ════════════════════════════════════════════════
//  ACCOUNT CODE MAP
// ════════════════════════════════════════════════
const DIRECT = {
  Labour:              "250",
  Production:          "251",
  Selling:             "252",
  Warehouse:           "253",
  Vehicle:             "254",
  "Turf Maintenance":  "255",
  "Pitch Preparation": "256",
  "Equipment Repair":  "257",
  Consumables:         "258",
  Other:               "259",
};
const INDIRECT = {
  Salary:        "260",
  Communication: "261",
  Utilities:     "262",
  Electricity:   "263",
  Maintenance:   "264",
  Rent:          "265",
  Insurance:     "266",
  Taxes:         "267",
  Other:         "268",
};
const ADDITIONAL_INCOME = {
  "Interest Income": "310",
  "Scrap / Salvage": "311",
  "Penalty Income":  "312",
  "Other Income":    "313",
};
const ASSET = {
  Equipment:          "301",
  "Sports Gear":      "302",
  "Ground Equipment": "303",
  "IT Equipment":     "304",
  Furniture:          "305",
  Other:              "306",
};

// Maps expense_type string to tbl_accounts account_type value
const EXPENSE_TYPE_TO_ACCOUNT_TYPE = {
  direct:            'direct_expense',
  indirect:          'indirect_expense',
  additional_income: 'income',
  asset:             'asset',
};

// Fallback account codes when DB lookup fails (original hardcoded values)
const FALLBACK_CODES = {
  direct:            '259',
  indirect:          '268',
  additional_income: '313',
  asset:             '306',
};

// DB-driven account code resolver — looks up by account_name + account_type in tbl_accounts
// Falls back to hardcoded constants if not found (for backward compatibility)
const resolveAccountCode = async (category, expense_type) => {
  try {
    const accountType = EXPENSE_TYPE_TO_ACCOUNT_TYPE[expense_type];
    if (!accountType) return FALLBACK_CODES[expense_type] || '268';

    const [rows] = await db.promise().query(
      `SELECT account_code FROM tbl_accounts WHERE account_name = ? AND account_type = ? AND is_active = 1 LIMIT 1`,
      [category, accountType]
    );
    if (rows.length > 0) return rows[0].account_code;

    // Fallback: try legacy hardcoded maps
    const legacyCode = DIRECT[category] || INDIRECT[category] || ADDITIONAL_INCOME[category] || ASSET[category];
    if (legacyCode) return legacyCode;

    return FALLBACK_CODES[expense_type] || '268';
  } catch (err) {
    // On DB error, fall back to hardcoded
    const legacyCode = DIRECT[category] || INDIRECT[category] || ADDITIONAL_INCOME[category] || ASSET[category];
    return legacyCode || FALLBACK_CODES[expense_type] || '268';
  }
};

const resolveIncomeType = (expense_type) =>
  expense_type === "additional_income" ? 1 : 0;

// ── Get Grounds for Expense Modal ─────────────────────────────
const getGroundsForExpense = async (tenant_id = null, user_role = "admin") => {
  let query = `SELECT id, name FROM tbl_grounds WHERE flag = 0 AND status = 'active'`;
  let params = [];
  if (user_role === "admin" && tenant_id) {
    query += " AND tenant_id = ?";
    params.push(tenant_id);
  }
  query += " ORDER BY name ASC";
  const [rows] = await db.promise().query(query, params);
  return rows;
};

// ════════════════════════════════════════════════
//  CRUD
// ════════════════════════════════════════════════

// ➕ Add Expense
// ground_id: 0 or null = "All Grounds", positive int = specific ground
const addExpense = async ({
  title, amount, category, custom_category, expense_type,
  payment_mode, expense_date, notes, vendor, tenant_id = null,
  ground_id = null,
}) => {
  if (!title || !amount || !expense_date)
    throw new Error("Title, amount and date are required");
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0)
    throw new Error("Amount must be a positive number");

  const finalCategory =
    category === "Other" && custom_category?.trim()
      ? custom_category.trim()
      : category || "Other";

  const finalExpenseType = expense_type || "indirect";
  const account_code = await resolveAccountCode(finalCategory, finalExpenseType);
  const income_type  = resolveIncomeType(finalExpenseType);

  // ground_id = 0 means "All Grounds" — stored as 0
  const finalGroundId = ground_id ? parseInt(ground_id) : 0;

  const [result] = await db.promise().query(
    `INSERT INTO tbl_expenses
       (title, amount, category, account_code, income_type, expense_type,
        payment_mode, expense_date, notes, vendor, tenant_id, ground_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, parsedAmount, finalCategory, account_code, income_type,
     finalExpenseType, payment_mode || "cash", expense_date,
     notes || null, vendor || null, tenant_id, finalGroundId]
  );
  return { id: result.insertId };
};

// 📋 Get Expenses with Pagination & Filters
const getExpenses = async ({
  category, expense_type, date_from, date_to, search, ground_id,
  limit = 10, offset = 0, tenant_id = null, user_role = "admin",
}) => {
  // Try with ground_id join first; fall back to plain query if column not yet migrated
  try {
    let query = "SELECT e.*, g.name as ground_name FROM tbl_expenses e LEFT JOIN tbl_grounds g ON g.id = e.ground_id AND g.flag = 0 WHERE e.flag = 0";
    const params = [];

    if (user_role === "admin" && tenant_id) { query += " AND e.tenant_id = ?"; params.push(tenant_id); }
    if (category     && category     !== "all") { query += " AND e.category = ?";     params.push(category); }
    if (expense_type && expense_type !== "all") { query += " AND e.expense_type = ?"; params.push(expense_type); }
    if (ground_id && ground_id !== "all") {
      const gId = parseInt(ground_id);
      if (!isNaN(gId)) {
        if (gId === 0) {
          query += " AND (e.ground_id = 0 OR e.ground_id IS NULL)";
        } else {
          query += " AND e.ground_id = ?"; params.push(gId);
        }
      }
    }
    if (date_from) { query += " AND e.expense_date >= ?"; params.push(date_from); }
    if (date_to)   { query += " AND e.expense_date <= ?"; params.push(date_to); }
    if (search)    { query += " AND (e.title LIKE ? OR e.vendor LIKE ? OR e.notes LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    query += " ORDER BY e.expense_date DESC, e.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));
    const [rows] = await db.promise().query(query, params);
    return rows;
  } catch (err) {
    // Fallback: ground_id column may not exist yet — run without it
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      let query = "SELECT * FROM tbl_expenses WHERE flag = 0";
      const params = [];
      if (user_role === "admin" && tenant_id) { query += " AND tenant_id = ?"; params.push(tenant_id); }
      if (category     && category     !== "all") { query += " AND category = ?";     params.push(category); }
      if (expense_type && expense_type !== "all") { query += " AND expense_type = ?"; params.push(expense_type); }
      if (date_from) { query += " AND expense_date >= ?"; params.push(date_from); }
      if (date_to)   { query += " AND expense_date <= ?"; params.push(date_to); }
      if (search)    { query += " AND (title LIKE ? OR vendor LIKE ? OR notes LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      query += " ORDER BY expense_date DESC, created_at DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));
      const [rows] = await db.promise().query(query, params);
      return rows;
    }
    throw err;
  }
};

// 📊 Get Total Count
const getTotalExpensesCount = async ({
  category, expense_type, date_from, date_to, search, ground_id,
  tenant_id = null, user_role = "admin",
}) => {
  let query = "SELECT COUNT(*) as total FROM tbl_expenses WHERE flag = 0";
  const params = [];

  if (user_role === "admin" && tenant_id) { query += " AND tenant_id = ?"; params.push(tenant_id); }
  if (category     && category     !== "all") { query += " AND category = ?";     params.push(category); }
  if (expense_type && expense_type !== "all") { query += " AND expense_type = ?"; params.push(expense_type); }
  if (ground_id    && ground_id    !== "all") {
    const gId = parseInt(ground_id);
    if (gId === 0) {
      query += " AND (ground_id = 0 OR ground_id IS NULL)";
    } else {
      query += " AND ground_id = ?"; params.push(gId);
    }
  }
  if (date_from) { query += " AND expense_date >= ?"; params.push(date_from); }
  if (date_to)   { query += " AND expense_date <= ?"; params.push(date_to); }
  if (search)    { query += " AND (title LIKE ? OR vendor LIKE ? OR notes LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const [rows] = await db.promise().query(query, params);
  return rows[0].total;
};

// 📊 Stats
const getExpenseStats = async (tenant_id = null, user_role = "admin") => {
  let baseWhere = "flag = 0";
  let params = [];
  if (user_role === "admin" && tenant_id) { baseWhere += " AND tenant_id = ?"; params.push(tenant_id); }

  const [total] = await db.promise().query(
    `SELECT COALESCE(SUM(amount),0) as total_amount, COUNT(*) as total_count,
     COALESCE(SUM(CASE WHEN MONTH(expense_date)=MONTH(CURDATE()) AND YEAR(expense_date)=YEAR(CURDATE()) THEN amount ELSE 0 END),0) as monthly_total
     FROM tbl_expenses WHERE ${baseWhere}`, params
  );
  const [categoryStats] = await db.promise().query(
    `SELECT category, expense_type, COALESCE(SUM(amount),0) as total, COUNT(*) as count
     FROM tbl_expenses WHERE ${baseWhere}
     GROUP BY category, expense_type ORDER BY total DESC LIMIT 5`, params
  );
  return { total: total[0], categoryStats };
};

// 🗑️ Delete
const deleteExpense = async (id, tenant_id = null, user_role = "admin") => {
  let query = "UPDATE tbl_expenses SET flag = 1 WHERE id = ?";
  let params = [id];
  if (user_role === "admin" && tenant_id) { query += " AND tenant_id = ?"; params.push(tenant_id); }
  const [result] = await db.promise().query(query, params);
  if (result.affectedRows === 0) { const e = new Error("Expense not found or unauthorized"); e.statusCode = 404; throw e; }
  return true;
};

// 📝 Get by ID
const getExpenseById = async (id, tenant_id = null, user_role = "admin") => {
  try {
    let query = "SELECT e.*, g.name as ground_name FROM tbl_expenses e LEFT JOIN tbl_grounds g ON g.id = e.ground_id AND g.flag = 0 WHERE e.id = ? AND e.flag = 0";
    let params = [id];
    if (user_role === "admin" && tenant_id) { query += " AND e.tenant_id = ?"; params.push(tenant_id); }
    const [rows] = await db.promise().query(query, params);
    if (rows.length === 0) { const e = new Error("Expense not found or unauthorized"); e.statusCode = 404; throw e; }
    return rows[0];
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      let query = "SELECT * FROM tbl_expenses WHERE id = ? AND flag = 0";
      let params = [id];
      if (user_role === "admin" && tenant_id) { query += " AND tenant_id = ?"; params.push(tenant_id); }
      const [rows] = await db.promise().query(query, params);
      if (rows.length === 0) { const e = new Error("Expense not found or unauthorized"); e.statusCode = 404; throw e; }
      return rows[0];
    }
    throw err;
  }
};

// ✏️ Update
const updateExpense = async (id, data, tenant_id = null, user_role = "admin") => {
  const { title, amount, category, custom_category, expense_type, payment_mode, expense_date, notes, vendor, ground_id } = data;
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error("Amount must be a positive number");

  const finalCategory =
    category === "Other" && custom_category?.trim()
      ? custom_category.trim()
      : category || "Other";

  const finalExpenseType = expense_type || "indirect";
  const account_code = await resolveAccountCode(finalCategory, finalExpenseType);
  const income_type  = resolveIncomeType(finalExpenseType);
  const finalGroundId = ground_id ? parseInt(ground_id) : 0;

  let query = `UPDATE tbl_expenses SET title=?, amount=?, category=?, account_code=?, income_type=?,
    expense_type=?, payment_mode=?, expense_date=?, notes=?, vendor=?, ground_id=? WHERE id=? AND flag=0`;
  let params = [title, parsedAmount, finalCategory, account_code, income_type,
    finalExpenseType, payment_mode, expense_date, notes || null, vendor || null, finalGroundId, id];

  if (user_role === "admin" && tenant_id) { query += " AND tenant_id = ?"; params.push(tenant_id); }
  const [result] = await db.promise().query(query, params);
  if (result.affectedRows === 0) { const e = new Error("Expense not found or unauthorized"); e.statusCode = 404; throw e; }
  return true;
};

module.exports = {
  addExpense, getExpenses, getTotalExpensesCount,
  getExpenseStats, deleteExpense, getExpenseById, updateExpense,
  getGroundsForExpense,
};