const balanceService = require('./balance.service');

// ── GET /balance-sheet/page ────────────────────────────────────
const getBalanceSheetPage = async (req, res, next) => {
    try {
        const years = await balanceService.getAvailablePeriods();
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        // Get yearly data by default
        const balanceData = await balanceService.getBalanceSheet({
            period_type: 'yearly',
            year: currentYear
        });

        const monthlyBreakdown = await balanceService.getMonthlyBreakdown(currentYear);

        return res.render('balance/index', {
            title: 'Balance Sheet',
            activePage: 'balance',
            years,
            currentYear,
            currentMonth,
            balanceData,
            monthlyBreakdown
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

        // FIX #2: Parse year and month as integers — query params arrive as strings.
        // Without parseInt, "2026" (string) is passed to SQL and the empty-string
        // check `if (!year)` never fires even when year is omitted from the request.
        const year = req.query.year ? parseInt(req.query.year) : null;
        const month = req.query.month ? parseInt(req.query.month) : null;

        const balanceData = await balanceService.getBalanceSheet({
            period_type,
            year,
            month,
            start_date,
            end_date
        });

        return res.json({
            success: true,
            data: balanceData
        });
    } catch (error) {
        console.error('Error in getBalanceSheetData:', error);
        next(error);
    }
};

// ── GET /balance-sheet/api/monthly ─────────────────────────────
const getMonthlyData = async (req, res, next) => {
    try {
        // FIX #2: Parse year as integer here too
        const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
        const monthlyData = await balanceService.getMonthlyBreakdown(year);
        return res.json({ success: true, data: monthlyData });
    } catch (error) {
        console.error('Error in getMonthlyData:', error);
        next(error);
    }
};

module.exports = {
    getBalanceSheetPage,
    getBalanceSheetData,
    getMonthlyData
};