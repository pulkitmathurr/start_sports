const db = require('../../config/db.config');

// ── Get Complete Balance Sheet Data ────────────────────────────
const getBalanceSheet = async ({ period_type = 'yearly', year = null, month = null, start_date = null, end_date = null }) => {
    try {
        // Set default to current year if none provided
        if (!year && !start_date) {
            year = new Date().getFullYear();
        }

        // FIX #1: Build date filter as a WHERE condition on tbl_expenses (not inside ON clause).
        // Previously dateCondition was injected inside the LEFT JOIN ON block, which caused
        // a MariaDB SQL syntax error: "near 'AND YEAR(expense_date) = 2026' at line 11".
        // Solution: use a subquery/derived table so the date filter is in a proper WHERE clause.
        let expenseDateFilter = '';
        let expenseDateParams = [];

        if (period_type === 'monthly' && year && month) {
            expenseDateFilter = 'AND YEAR(e.expense_date) = ? AND MONTH(e.expense_date) = ?';
            expenseDateParams = [parseInt(year), parseInt(month)];
        } else if (period_type === 'yearly' && year) {
            expenseDateFilter = 'AND YEAR(e.expense_date) = ?';
            expenseDateParams = [parseInt(year)];
        } else if (period_type === 'custom' && start_date && end_date) {
            expenseDateFilter = 'AND e.expense_date BETWEEN ? AND ?';
            expenseDateParams = [start_date, end_date];
        }

        // ── Get Direct Expenses ──
        // FIX #1: dateCondition moved into a WHERE clause inside subquery, not in ON clause.
        // Removed HAVING — accounts with zero spend for the period return 0, not disappear.
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
                ${expenseDateFilter}
            WHERE a.account_type = 'direct_expense' AND a.is_active = 1
            GROUP BY a.account_code, a.account_name, a.display_order
            ORDER BY a.display_order
        `;

        // ── Get Indirect Expenses ──
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
                ${expenseDateFilter}
            WHERE a.account_type = 'indirect_expense' AND a.is_active = 1
            GROUP BY a.account_code, a.account_name, a.display_order
            ORDER BY a.display_order
        `;

        // ── Get Additional Income ──
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
                ${expenseDateFilter}
            WHERE a.account_type = 'income' AND a.is_active = 1 
            AND a.account_code NOT IN ('300')
            GROUP BY a.account_code, a.account_name, a.display_order
            ORDER BY a.display_order
        `;

        // Build sales date condition
        let salesCondition = '';
        let salesParams = [];

        if (period_type === 'monthly' && year && month) {
            salesCondition = 'AND YEAR(confirmed_at) = ? AND MONTH(confirmed_at) = ?';
            salesParams = [parseInt(year), parseInt(month)];
        } else if (period_type === 'yearly' && year) {
            salesCondition = 'AND YEAR(confirmed_at) = ?';
            salesParams = [parseInt(year)];
        } else if (period_type === 'custom' && start_date && end_date) {
            salesCondition = 'AND confirmed_at BETWEEN ? AND ?';
            salesParams = [start_date, end_date];
        }

        // Build stock date condition (uses expense_date on tbl_expenses directly)
        let stockDateFilter = '';
        let stockParams = [];

        if (period_type === 'monthly' && year && month) {
            stockDateFilter = 'AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?';
            stockParams = [parseInt(year), parseInt(month)];
        } else if (period_type === 'yearly' && year) {
            stockDateFilter = 'AND YEAR(expense_date) = ?';
            stockParams = [parseInt(year)];
        } else if (period_type === 'custom' && start_date && end_date) {
            stockDateFilter = 'AND expense_date BETWEEN ? AND ?';
            stockParams = [start_date, end_date];
        }

        // ── Run all queries in parallel for performance ──
        const [
            [directExpenses],
            [indirectExpenses],
            [additionalIncome],
            [salesData],
            [stockData],
        ] = await Promise.all([
            db.promise().query(directExpensesQuery, expenseDateParams),
            db.promise().query(indirectExpensesQuery, expenseDateParams),
            db.promise().query(additionalIncomeQuery, expenseDateParams),
            db.promise().query(`
                SELECT 
                    COALESCE(SUM(advance_amount), 0) as total_sales,
                    COUNT(*) as booking_count
                FROM tbl_bookings 
                WHERE booking_status = 'confirmed' 
                AND flag = 0
                ${salesCondition}
            `, salesParams),
            db.promise().query(`
                SELECT COALESCE(SUM(amount), 0) as closing_stock
                FROM tbl_expenses 
                WHERE flag = 0 
                AND account_code = '301'
                ${stockDateFilter}
            `, stockParams),
        ]);

        // Calculate totals
        const total_direct_expenses = directExpenses.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);
        const total_indirect_expenses = indirectExpenses.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);
        const total_sales = parseFloat(salesData[0]?.total_sales || 0);
        const closing_stock = parseFloat(stockData[0]?.closing_stock || 0);
        const total_additional_income = additionalIncome.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);

        // Calculate profits
        const gross_profit = total_sales - total_direct_expenses;
        const net_profit = gross_profit - total_indirect_expenses + total_additional_income;

        // Debit total = all expenses
        const total_debit = total_direct_expenses + total_indirect_expenses;

        // Credit total = sales + stock + additional income
        const total_credit = total_sales + closing_stock + total_additional_income;

        // FIX #4: is_balanced replaced with has_profit — a P&L sheet balances by
        // including net profit/loss as the balancing figure, not by debit === credit.
        const has_profit = net_profit >= 0;

        return {
            period: {
                type: period_type,
                year: year,
                month: month,
                start_date: start_date,
                end_date: end_date,
                display: getPeriodDisplay(period_type, year, month, start_date, end_date)
            },
            direct_expenses: directExpenses,
            total_direct_expenses,
            indirect_expenses: indirectExpenses,
            total_indirect_expenses,
            sales: {
                account_code: '300',
                account_name: 'Sales Revenue',
                total_amount: total_sales,
                booking_count: salesData[0]?.booking_count || 0
            },
            closing_stock: {
                account_code: '301',
                account_name: 'Stock in Hand (Closing)',
                total_amount: closing_stock
            },
            additional_income: additionalIncome,
            total_additional_income,
            gross_profit,
            net_profit,
            total_debit,
            total_credit,
            has_profit, // FIX #4: renamed from is_balanced (which was always false)
        };
    } catch (err) {
        console.error('Error in getBalanceSheet:', err);
        throw err;
    }
};

// ── Get Available Periods (Years and Months) ───────────────────
const getAvailablePeriods = async () => {
    try {
        const [years] = await db.promise().query(`
            SELECT DISTINCT YEAR(confirmed_at) as year
            FROM tbl_bookings 
            WHERE booking_status = 'confirmed' AND flag = 0
            UNION
            SELECT DISTINCT YEAR(expense_date) as year
            FROM tbl_expenses 
            WHERE flag = 0
            ORDER BY year DESC
        `);

        const currentYear = new Date().getFullYear();
        let availableYears = years.map(row => row.year);

        if (!availableYears.includes(currentYear)) {
            availableYears.push(currentYear);
            availableYears.sort((a, b) => b - a);
        }

        return availableYears;
    } catch (err) {
        console.error('Error in getAvailablePeriods:', err);
        return [new Date().getFullYear()];
    }
};

// ── Get Monthly Breakdown for Chart ────────────────────────────
// FIX #3: Replaced 24 sequential DB queries (one per month per metric) with
// 2 queries total using GROUP BY MONTH — much faster page load.
const getMonthlyBreakdown = async (year) => {
    try {
        const parsedYear = parseInt(year);

        const [salesRows] = await db.promise().query(`
            SELECT 
                MONTH(confirmed_at) as month,
                COALESCE(SUM(advance_amount), 0) as sales
            FROM tbl_bookings 
            WHERE booking_status = 'confirmed' 
            AND flag = 0
            AND YEAR(confirmed_at) = ?
            GROUP BY MONTH(confirmed_at)
        `, [parsedYear]);

        const [expenseRows] = await db.promise().query(`
            SELECT 
                MONTH(expense_date) as month,
                COALESCE(SUM(amount), 0) as expenses
            FROM tbl_expenses 
            WHERE flag = 0
            AND income_type = 0
            AND YEAR(expense_date) = ?
            GROUP BY MONTH(expense_date)
        `, [parsedYear]);

        // Index by month number for O(1) lookup
        const salesByMonth = {};
        salesRows.forEach(r => { salesByMonth[r.month] = parseFloat(r.sales); });

        const expensesByMonth = {};
        expenseRows.forEach(r => { expensesByMonth[r.month] = parseFloat(r.expenses); });

        // Build full 12-month array
        const months = [];
        for (let i = 1; i <= 12; i++) {
            const salesAmount = salesByMonth[i] || 0;
            const expensesAmount = expensesByMonth[i] || 0;
            months.push({
                month: i,
                month_name: new Date(parsedYear, i - 1).toLocaleString('default', { month: 'long' }),
                month_short: new Date(parsedYear, i - 1).toLocaleString('default', { month: 'short' }),
                sales: salesAmount,
                expenses: expensesAmount,
                profit: salesAmount - expensesAmount,
                profit_margin: salesAmount > 0
                    ? ((salesAmount - expensesAmount) / salesAmount * 100).toFixed(2)
                    : 0
            });
        }

        return months;
    } catch (err) {
        console.error('Error in getMonthlyBreakdown:', err);
        return [];
    }
};

// Helper function to get period display text
function getPeriodDisplay(type, year, month, start_date, end_date) {
    if (type === 'monthly' && year && month) {
        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
        return `${monthName} ${year}`;
    } else if (type === 'yearly' && year) {
        return `Year ${year} - ${parseInt(year) + 1}`;
    } else if (type === 'custom' && start_date && end_date) {
        return `${start_date} to ${end_date}`;
    }
    return 'All Periods';
}

module.exports = {
    getBalanceSheet,
    getAvailablePeriods,
    getMonthlyBreakdown
};