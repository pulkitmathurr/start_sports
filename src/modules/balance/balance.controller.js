const balanceService = require('./balance.service');

// ── GET /balance-sheet/page ────────────────────────────────────
const getBalanceSheetPage = async (req, res, next) => {
    try {
        const tenant_id = req.tenant ? req.tenant.id : null;
        const user_role = req.user.role;

        const [years, grounds] = await Promise.all([
            balanceService.getAvailablePeriods(tenant_id, user_role),
            balanceService.getGroundsForTenant(tenant_id, user_role),
        ]);

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        const balanceData = await balanceService.getBalanceSheet({
            period_type: 'yearly',
            year: currentYear,
            tenant_id,
            user_role,
            ground_id: null
        });

        const monthlyBreakdown = await balanceService.getMonthlyBreakdown(
            currentYear, tenant_id, user_role, null
        );

        return res.render('balance/index', {
            title: 'Balance Sheet',
            activePage: 'balance',
            years,
            grounds,
            currentYear,
            currentMonth,
            balanceData,
            monthlyBreakdown,
            tenant: req.tenant
        });
    } catch (error) {
        console.error('Error in getBalanceSheetPage:', error);
        next(error);
    }
};

// ── GET /balance-sheet/api/data (AJAX) ─────────────────────────
const getBalanceSheetData = async (req, res, next) => {
    try {
        const { period_type = 'yearly', start_date = null, end_date = null } = req.query;
        const year    = req.query.year     ? parseInt(req.query.year)     : null;
        const month   = req.query.month    ? parseInt(req.query.month)    : null;
        const ground_id = req.query.ground_id ? parseInt(req.query.ground_id) : null;

        const balanceData = await balanceService.getBalanceSheet({
            period_type, year, month, start_date, end_date,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role,
            ground_id
        });

        return res.json({ success: true, data: balanceData });
    } catch (error) {
        console.error('Error in getBalanceSheetData:', error);
        next(error);
    }
};

// ── GET /balance-sheet/api/monthly ─────────────────────────────
const getMonthlyData = async (req, res, next) => {
    try {
        const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
        const ground_id = req.query.ground_id ? parseInt(req.query.ground_id) : null;
        const monthlyData = await balanceService.getMonthlyBreakdown(
            year,
            req.tenant ? req.tenant.id : null,
            req.user.role,
            ground_id
        );
        return res.json({ success: true, data: monthlyData });
    } catch (error) {
        console.error('Error in getMonthlyData:', error);
        next(error);
    }
};

// ── GET /balance-sheet/expense-detail/page ─────────────────────
const getExpenseDetailPage = async (req, res, next) => {
    try {
        const tenant_id = req.tenant ? req.tenant.id : null;
        const user_role = req.user.role;
        const { account_code } = req.query;

        const [years, grounds] = await Promise.all([
            balanceService.getAvailablePeriods(tenant_id, user_role),
            balanceService.getGroundsForTenant(tenant_id, user_role),
        ]);

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        return res.render('balance/expense-detail', {
            title: 'Expense Detail',
            activePage: 'balance',
            years,
            grounds,
            currentYear,
            currentMonth,
            account_code: account_code || '',
            tenant: req.tenant
        });
    } catch (error) {
        next(error);
    }
};

// ── GET /balance-sheet/api/expense-detail ──────────────────────
const getExpenseDetailData = async (req, res, next) => {
    try {
        const { account_code, period_type = 'yearly', month } = req.query;
        const year     = req.query.year     ? parseInt(req.query.year)     : null;
        const ground_id = req.query.ground_id ? parseInt(req.query.ground_id) : null;

        if (!account_code) return res.status(400).json({ success: false, message: 'account_code is required' });

        const income_type = req.query.income_type ? parseInt(req.query.income_type) : 0;
        const data = await balanceService.getExpenseDetails({
            account_code, period_type, year,
            month: month ? parseInt(month) : null,
            ground_id,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role,
            income_type,
        });

        return res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
};


// ── GET /balance-sheet/api/accounts ─ list accounts by type ───
const getAccounts = async (req, res, next) => {
    try {
        const { account_type } = req.query;
        const accounts = await balanceService.getAccountsByType(account_type || null);
        return res.json({ success: true, accounts });
    } catch (err) { next(err); }
};

// ── POST /balance-sheet/api/accounts ─ create new category ────
const createAccount = async (req, res, next) => {
    try {
        const { account_name, account_type } = req.body;
        if (!account_name || !account_name.trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }
        const valid = ['direct_expense', 'indirect_expense', 'income'];
        if (!valid.includes(account_type)) {
            return res.status(400).json({ success: false, message: 'Invalid account type' });
        }
        const result = await balanceService.createAccount({ account_name, account_type });
        return res.json({ success: true, message: 'Category created successfully', account: result });
    } catch (err) { next(err); }
};

// ── POST /balance-sheet/api/accounts/:code/delete ─ delete ────
const deleteAccount = async (req, res, next) => {
    try {
        const account_code = req.params.code;
        const force = req.body.force === true || req.body.force === 'true';
        const result = await balanceService.deleteAccount({ account_code, force });
        if (result.requiresConfirmation) {
            return res.json({ success: false, requiresConfirmation: true, entryCount: result.entryCount,
                message: `This category has ${result.entryCount} expense entries. Deleting it will permanently remove all entries. Are you sure?` });
        }
        return res.json({ success: true, message: result.entryCount > 0
            ? `Category and ${result.entryCount} entries deleted successfully`
            : 'Category deleted successfully' });
    } catch (err) { next(err); }
};

// ── GET /balance-sheet/api/accounts/for-form ─ for expense form
const getAccountsForForm = async (req, res, next) => {
    try {
        const accounts = await balanceService.getAccountsForExpenseForm();
        return res.json({ success: true, accounts });
    } catch (err) { next(err); }
};

module.exports = {
    getBalanceSheetPage,
    getBalanceSheetData,
    getMonthlyData,
    getExpenseDetailPage,
    getExpenseDetailData,
    getAccounts,
    createAccount,
    deleteAccount,
    getAccountsForForm,
};