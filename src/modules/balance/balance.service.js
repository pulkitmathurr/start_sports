const db = require("../../config/db.config");

// ── Get Grounds List for Tenant ──
const getGroundsForTenant = async (tenant_id = null, user_role = "admin") => {
  try {
    let query = `SELECT id, name FROM tbl_grounds WHERE flag = 0 AND status = 'active'`;
    let params = [];
    if (user_role === "admin" && tenant_id) {
      query += " AND tenant_id = ?";
      params.push(tenant_id);
    }
    query += " ORDER BY name ASC";
    const [rows] = await db.promise().query(query, params);
    return rows;
  } catch (err) {
    return [];
  }
};

// ── Get Complete Balance Sheet Data ──
const getBalanceSheet = async ({
  period_type = "yearly",
  year = null,
  month = null,
  start_date = null,
  end_date = null,
  tenant_id = null,
  user_role = "admin",
  ground_id = null, // NEW: null = All Grounds
}) => {
  try {
    if (!year && !start_date) {
      year = new Date().getFullYear();
    }

    const isAdmin = user_role === "admin" && tenant_id;

    // Build date filters for expenses
    let dateFilter = "";
    let dateParams = [];
    if (period_type === "monthly" && year && month) {
      dateFilter = "AND YEAR(e.expense_date) = ? AND MONTH(e.expense_date) = ?";
      dateParams = [parseInt(year), parseInt(month)];
    } else if (period_type === "yearly" && year) {
      dateFilter = "AND YEAR(e.expense_date) = ?";
      dateParams = [parseInt(year)];
    } else if (period_type === "custom" && start_date && end_date) {
      dateFilter = "AND e.expense_date BETWEEN ? AND ?";
      dateParams = [start_date, end_date];
    }

    // Ground filter for expenses
    // If ground_id is set: show expenses for that specific ground + expenses marked as 'all' (ground_id=0 or NULL)
    // If ground_id is null: show ALL expenses (total view)
    let groundExpenseFilter = "";
    if (ground_id) {
      groundExpenseFilter = `AND (e.ground_id = ? OR e.ground_id = 0 OR e.ground_id IS NULL)`;
    }

    // ── Get Direct Expenses ──
    let directParams = [...dateParams];
    if (isAdmin) directParams.push(tenant_id);
    if (ground_id) directParams.push(parseInt(ground_id));

    const directExpensesQuery = `
            SELECT 
                a.account_code,
                a.account_name,
                COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN e.amount ELSE 0 END), 0) as total_amount,
                COUNT(e.id) as transaction_count
            FROM tbl_accounts a
            LEFT JOIN tbl_expenses e 
                ON e.account_code = a.account_code 
                AND e.flag = 0 
                AND e.income_type = 0
                ${dateFilter}
                ${isAdmin ? "AND e.tenant_id = ?" : ""}
                ${groundExpenseFilter}
            WHERE a.account_type = 'direct_expense' AND a.is_active = 1
            GROUP BY a.account_code, a.account_name, a.display_order
            ORDER BY a.display_order
        `;

    // ── Get Indirect Expenses ──
    let indirectParams = [...dateParams];
    if (isAdmin) indirectParams.push(tenant_id);
    if (ground_id) indirectParams.push(parseInt(ground_id));

    const indirectExpensesQuery = `
            SELECT 
                a.account_code,
                a.account_name,
                COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN e.amount ELSE 0 END), 0) as total_amount,
                COUNT(e.id) as transaction_count
            FROM tbl_accounts a
            LEFT JOIN tbl_expenses e 
                ON e.account_code = a.account_code 
                AND e.flag = 0 
                AND e.income_type = 0
                ${dateFilter}
                ${isAdmin ? "AND e.tenant_id = ?" : ""}
                ${groundExpenseFilter}
            WHERE a.account_type = 'indirect_expense' AND a.is_active = 1
            GROUP BY a.account_code, a.account_name, a.display_order
            ORDER BY a.display_order
        `;

    // ── Get Additional Income ──
    let incomeParams = [...dateParams];
    if (isAdmin) incomeParams.push(tenant_id);
    if (ground_id) incomeParams.push(parseInt(ground_id));

    const additionalIncomeQuery = `
            SELECT 
                a.account_code,
                a.account_name,
                COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN e.amount ELSE 0 END), 0) as total_amount,
                COUNT(e.id) as transaction_count
            FROM tbl_accounts a
            LEFT JOIN tbl_expenses e 
                ON e.account_code = a.account_code 
                AND e.flag = 0 
                AND e.income_type = 1
                ${dateFilter}
                ${isAdmin ? "AND e.tenant_id = ?" : ""}
                ${groundExpenseFilter}
            WHERE a.account_type = 'income' AND a.is_active = 1 
            AND a.account_code NOT IN ('300')
            GROUP BY a.account_code, a.account_name, a.display_order
            ORDER BY a.display_order
        `;

    // Build sales date condition
    // For ground-specific view, filter bookings by ground_id
    let salesCondition = "";
    let salesParams = [];
    if (period_type === "monthly" && year && month) {
      salesCondition = "AND YEAR(confirmed_at) = ? AND MONTH(confirmed_at) = ?";
      salesParams = [parseInt(year), parseInt(month)];
    } else if (period_type === "yearly" && year) {
      salesCondition = "AND YEAR(confirmed_at) = ?";
      salesParams = [parseInt(year)];
    } else if (period_type === "custom" && start_date && end_date) {
      salesCondition = "AND confirmed_at BETWEEN ? AND ?";
      salesParams = [start_date, end_date];
    }

    let groundSalesFilter = "";
    if (ground_id) {
      groundSalesFilter = "AND ground_id = ?";
    }

    // Build stock date condition
    let stockCondition = "";
    let stockParams = [];
    if (period_type === "monthly" && year && month) {
      stockCondition = "AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?";
      stockParams = [parseInt(year), parseInt(month)];
    } else if (period_type === "yearly" && year) {
      stockCondition = "AND YEAR(expense_date) = ?";
      stockParams = [parseInt(year)];
    } else if (period_type === "custom" && start_date && end_date) {
      stockCondition = "AND expense_date BETWEEN ? AND ?";
      stockParams = [start_date, end_date];
    }

    let groundStockFilter = "";
    if (ground_id) {
      groundStockFilter = `AND (ground_id = ? OR ground_id = 0 OR ground_id IS NULL)`;
    }

    // ── Run all queries ──
    const [
      [directExpenses],
      [indirectExpenses],
      [additionalIncome],
      [salesData],
      [stockData],
    ] = await Promise.all([
      db.promise().query(directExpensesQuery, directParams),
      db.promise().query(indirectExpensesQuery, indirectParams),
      db.promise().query(additionalIncomeQuery, incomeParams),

      // Sales query
      db.promise().query(
        `
                SELECT 
                    COALESCE(SUM(advance_amount), 0) as total_sales,
                    COUNT(*) as booking_count
                FROM tbl_bookings 
                WHERE booking_status = 'confirmed' 
                AND flag = 0
                ${salesCondition}
                ${isAdmin ? "AND tenant_id = ?" : ""}
                ${groundSalesFilter}
            `,
        [
          ...salesParams,
          ...(isAdmin ? [tenant_id] : []),
          ...(ground_id ? [parseInt(ground_id)] : []),
        ],
      ),

      // Stock query
      db.promise().query(
        `
                SELECT COALESCE(SUM(amount), 0) as closing_stock
                FROM tbl_expenses 
                WHERE flag = 0 
                AND account_code = '301'
                ${stockCondition}
                ${isAdmin ? "AND tenant_id = ?" : ""}
                ${groundStockFilter}
            `,
        [
          ...stockParams,
          ...(isAdmin ? [tenant_id] : []),
          ...(ground_id ? [parseInt(ground_id)] : []),
        ],
      ),
    ]);

    // Calculate totals
    const total_direct_expenses = directExpenses.reduce(
      (sum, item) => sum + parseFloat(item.total_amount),
      0,
    );
    const total_indirect_expenses = indirectExpenses.reduce(
      (sum, item) => sum + parseFloat(item.total_amount),
      0,
    );
    const total_sales = parseFloat(salesData[0]?.total_sales || 0);
    const closing_stock = parseFloat(stockData[0]?.closing_stock || 0);
    const total_additional_income = additionalIncome.reduce(
      (sum, item) => sum + parseFloat(item.total_amount),
      0,
    );

    const gross_profit = total_sales - total_direct_expenses;
    const net_profit =
      gross_profit - total_indirect_expenses + total_additional_income;
    const total_debit = total_direct_expenses + total_indirect_expenses;
    const total_credit = total_sales + closing_stock + total_additional_income;
    const has_profit = net_profit >= 0;

    return {
      period: {
        type: period_type,
        year,
        month,
        start_date,
        end_date,
        display: getPeriodDisplay(
          period_type,
          year,
          month,
          start_date,
          end_date,
        ),
      },
      ground_id: ground_id ? parseInt(ground_id) : null,
      direct_expenses: directExpenses,
      total_direct_expenses,
      indirect_expenses: indirectExpenses,
      total_indirect_expenses,
      sales: {
        account_code: "300",
        account_name: "Sales Revenue",
        total_amount: total_sales,
        booking_count: salesData[0]?.booking_count || 0,
      },
      closing_stock: {
        account_code: "301",
        account_name: "Stock in Hand (Closing)",
        total_amount: closing_stock,
      },
      additional_income: additionalIncome,
      total_additional_income,
      gross_profit,
      net_profit,
      total_debit,
      total_credit,
      has_profit,
    };
  } catch (err) {
    console.error("Error in getBalanceSheet:", err);
    throw err;
  }
};

// ── Get Available Periods (Years and Months) ──
const getAvailablePeriods = async (tenant_id = null, user_role = "admin") => {
  try {
    let bookingQuery = `SELECT DISTINCT YEAR(confirmed_at) as year FROM tbl_bookings WHERE booking_status = 'confirmed' AND flag = 0`;
    let expenseQuery = `SELECT DISTINCT YEAR(expense_date) as year FROM tbl_expenses WHERE flag = 0`;
    let bookingParams = [];
    let expenseParams = [];

    if (user_role === "admin" && tenant_id) {
      bookingQuery += " AND tenant_id = ?";
      bookingParams.push(tenant_id);
      expenseQuery += " AND tenant_id = ?";
      expenseParams.push(tenant_id);
    }

    const [years] = await db.promise().query(
      `
            SELECT year FROM (
                ${bookingQuery}
                UNION
                ${expenseQuery}
            ) AS combined_years
            ORDER BY year DESC
        `,
      [...bookingParams, ...expenseParams],
    );

    const currentYear = new Date().getFullYear();
    let availableYears = years.map((row) => row.year);
    if (!availableYears.includes(currentYear)) {
      availableYears.push(currentYear);
      availableYears.sort((a, b) => b - a);
    }
    return availableYears;
  } catch (err) {
    return [new Date().getFullYear()];
  }
};

// ── Get Monthly Breakdown for Chart ──
const getMonthlyBreakdown = async (
  year,
  tenant_id = null,
  user_role = "admin",
  ground_id = null,
) => {
  try {
    const parsedYear = parseInt(year);
    let salesParams = [parsedYear];
    let expenseParams = [parsedYear];

    let salesQuery = `
            SELECT MONTH(confirmed_at) as month, COALESCE(SUM(advance_amount), 0) as sales
            FROM tbl_bookings 
            WHERE booking_status = 'confirmed' AND flag = 0 AND YEAR(confirmed_at) = ?
        `;
    let expenseQuery = `
            SELECT MONTH(expense_date) as month, COALESCE(SUM(amount), 0) as expenses
            FROM tbl_expenses 
            WHERE flag = 0 AND income_type = 0 AND YEAR(expense_date) = ?
        `;

    if (user_role === "admin" && tenant_id) {
      salesQuery += " AND tenant_id = ?";
      salesParams.push(tenant_id);
      expenseQuery += " AND tenant_id = ?";
      expenseParams.push(tenant_id);
    }

    if (ground_id) {
      salesQuery += " AND ground_id = ?";
      salesParams.push(parseInt(ground_id));
      expenseQuery += ` AND (ground_id = ? OR ground_id = 0 OR ground_id IS NULL)`;
      expenseParams.push(parseInt(ground_id));
    }

    salesQuery += " GROUP BY MONTH(confirmed_at)";
    expenseQuery += " GROUP BY MONTH(expense_date)";

    const [salesRows] = await db.promise().query(salesQuery, salesParams);
    const [expenseRows] = await db.promise().query(expenseQuery, expenseParams);

    const salesByMonth = {};
    salesRows.forEach((r) => {
      salesByMonth[r.month] = parseFloat(r.sales);
    });
    const expensesByMonth = {};
    expenseRows.forEach((r) => {
      expensesByMonth[r.month] = parseFloat(r.expenses);
    });

    const months = [];
    for (let i = 1; i <= 12; i++) {
      const salesAmount = salesByMonth[i] || 0;
      const expensesAmount = expensesByMonth[i] || 0;
      months.push({
        month: i,
        month_name: new Date(parsedYear, i - 1).toLocaleString("default", {
          month: "long",
        }),
        month_short: new Date(parsedYear, i - 1).toLocaleString("default", {
          month: "short",
        }),
        sales: salesAmount,
        expenses: expensesAmount,
        profit: salesAmount - expensesAmount,
        profit_margin:
          salesAmount > 0
            ? (((salesAmount - expensesAmount) / salesAmount) * 100).toFixed(2)
            : 0,
      });
    }
    return months;
  } catch (err) {
    return [];
  }
};

function getPeriodDisplay(type, year, month, start_date, end_date) {
  if (type === "monthly" && year && month) {
    const monthName = new Date(year, month - 1).toLocaleString("default", {
      month: "long",
    });
    return `${monthName} ${year}`;
  } else if (type === "yearly" && year) {
    return `Year ${year} - ${parseInt(year) + 1}`;
  } else if (type === "custom" && start_date && end_date) {
    return `${start_date} to ${end_date}`;
  }
  return "All Periods";
}

// ── Get Individual Expense Entries for a specific account_code ─
const getExpenseDetails = async ({
  account_code,
  period_type = "yearly",
  year = null,
  month = null,
  ground_id = null,
  tenant_id = null,
  user_role = "admin",
  income_type = 0,
}) => {
  try {
    const isAdmin = user_role === "admin" && tenant_id;

    let dateFilter = "";
    let params = [];

    if (period_type === "monthly" && year && month) {
      dateFilter = "AND YEAR(e.expense_date) = ? AND MONTH(e.expense_date) = ?";
      params.push(parseInt(year), parseInt(month));
    } else if (period_type === "yearly" && year) {
      dateFilter = "AND YEAR(e.expense_date) = ?";
      params.push(parseInt(year));
    }

    let groundFilter = "";
    if (ground_id) {
      groundFilter =
        "AND (e.ground_id = ? OR e.ground_id = 0 OR e.ground_id IS NULL)";
      params.push(parseInt(ground_id));
    }

    if (isAdmin) params.push(tenant_id);

    params.push(account_code);

    const incomeTypeVal = income_type === 1 ? 1 : 0;
    const query = `
            SELECT e.id,e.title,e.amount,e.category,e.expense_type,e.payment_mode,e.expense_date,e.notes,e.vendor,e.account_code,
                COALESCE(g.name, 'All Grounds') as ground_name,
                a.account_name
            FROM tbl_expenses e
            LEFT JOIN tbl_grounds g ON g.id = e.ground_id AND g.flag = 0
            LEFT JOIN tbl_accounts a ON a.account_code = e.account_code
            WHERE e.flag = 0
            AND e.income_type = ${incomeTypeVal}
            ${dateFilter}
            ${groundFilter}
            ${isAdmin ? "AND e.tenant_id = ?" : ""}
            AND e.account_code = ?
            ORDER BY e.expense_date DESC, e.created_at DESC
        `;

    const [rows] = await db.promise().query(query, params);

    // Get account info
    const [[accountInfo]] = await db
      .promise()
      .query(
        `SELECT account_code, account_name, account_type FROM tbl_accounts WHERE account_code = ?`,
        [account_code],
      );

    const total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    return {
      account: accountInfo || {
        account_code,
        account_name: "Unknown",
        account_type: "",
      },
      entries: rows,
      total,
      count: rows.length,
    };
  } catch (err) {
    console.error("Error in getExpenseDetails:", err);
    throw err;
  }
};



// ── Get All Accounts by Type ──────────────────────────────────
const getAccountsByType = async (account_type = null) => {
    try {
        let query = `SELECT id, account_code, account_name, account_type, display_order, is_active FROM tbl_accounts WHERE is_active = 1`;
        const params = [];
        if (account_type) { query += ` AND account_type = ?`; params.push(account_type); }
        query += ` ORDER BY account_type, display_order ASC`;
        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) { throw err; }
};

// ── Create Account (new category) ────────────────────────────
const createAccount = async ({ account_name, account_type }) => {
    try {
        // Define safe code ranges per type — using 4xx to avoid conflicts with existing 2xx/3xx
        const ranges = {
            direct_expense:   { start: 400, end: 499 },
            indirect_expense: { start: 500, end: 599 },
            income:           { start: 600, end: 699 },
        };
        if (!ranges[account_type]) throw Object.assign(new Error('Invalid account type'), { statusCode: 400 });

        // Find next available code in range
        const { start, end } = ranges[account_type];
        const [existing] = await db.promise().query(
            `SELECT account_code FROM tbl_accounts WHERE CAST(account_code AS UNSIGNED) BETWEEN ? AND ? ORDER BY CAST(account_code AS UNSIGNED) ASC`,
            [start, end]
        );
        const usedCodes = new Set(existing.map(r => parseInt(r.account_code)));
        let nextCode = null;
        for (let c = start; c <= end; c++) {
            if (!usedCodes.has(c)) { nextCode = c; break; }
        }
        if (!nextCode) throw Object.assign(new Error('No available account codes in this range. Maximum categories reached.'), { statusCode: 400 });

        // Get next display_order for this type
        const [[maxOrder]] = await db.promise().query(
            `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM tbl_accounts WHERE account_type = ?`,
            [account_type]
        );

        const [result] = await db.promise().query(
            `INSERT INTO tbl_accounts (account_code, account_name, account_type, display_order, is_active) VALUES (?, ?, ?, ?, 1)`,
            [String(nextCode), account_name.trim(), account_type, maxOrder.next_order]
        );
        return { id: result.insertId, account_code: String(nextCode), account_name: account_name.trim(), account_type };
    } catch (err) { throw err; }
};

// ── Delete Account ─────────────────────────────────────────────
// force=true: delete category AND all its expense entries
// force=false: check if entries exist, return count if they do
const deleteAccount = async ({ account_code, force = false }) => {
    try {
        // Cannot delete system/core accounts (original 250-313 range)
        const code = parseInt(account_code);
        if (code >= 250 && code <= 399) {
            throw Object.assign(new Error('Core system categories cannot be deleted'), { statusCode: 403 });
        }

        // Check if entries exist
        const [[countRow]] = await db.promise().query(
            `SELECT COUNT(*) as cnt FROM tbl_expenses WHERE account_code = ? AND flag = 0`,
            [account_code]
        );
        const entryCount = countRow.cnt;

        if (entryCount > 0 && !force) {
            // Return count so frontend can show confirmation modal
            return { requiresConfirmation: true, entryCount };
        }

        if (force && entryCount > 0) {
            // Hard delete all entries for this category
            await db.promise().query(
                `UPDATE tbl_expenses SET flag = 1 WHERE account_code = ?`,
                [account_code]
            );
        }

        // Delete the account
        await db.promise().query(`DELETE FROM tbl_accounts WHERE account_code = ?`, [account_code]);
        return { deleted: true, entryCount };
    } catch (err) { throw err; }
};

// ── Get Accounts for Expense Form (dynamic, replaces hardcoded CATS) ──
const getAccountsForExpenseForm = async () => {
    try {
        const [rows] = await db.promise().query(
            `SELECT account_code, account_name, account_type FROM tbl_accounts WHERE is_active = 1 ORDER BY account_type, display_order ASC`
        );
        // Group by type
        const grouped = { direct_expense: [], indirect_expense: [], income: [], asset: [] };
        rows.forEach(r => { if (grouped[r.account_type]) grouped[r.account_type].push(r); });
        return grouped;
    } catch (err) { throw err; }
};

module.exports = {
    getBalanceSheet,
    getAvailablePeriods,
    getMonthlyBreakdown,
    getGroundsForTenant,
    getExpenseDetails,
    getAccountsByType,
    createAccount,
    deleteAccount,
    getAccountsForExpenseForm,
};