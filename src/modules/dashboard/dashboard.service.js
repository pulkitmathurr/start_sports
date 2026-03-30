const db = require('../../config/db.config');

const getDashboardData = async ({ user_id }) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const [
            [todayStats],
            [pendingApprovals],
            [todaySchedule],
            [grounds],
            [recentActivity],
            [weeklyTrend],
            [slotStats],
            [user],
            [monthlyBookings],
            [expenseStats],
            [expenseCategories],
            [recentExpenses],
            [financialSummary]
        ] = await Promise.all([

            // ── Today's stat cards ────────────────────────
            db.promise().query(`
                SELECT
                    COUNT(*) AS total_bookings,
                    SUM(CASE WHEN booking_status = 'confirmed'  THEN 1 ELSE 0 END) AS confirmed,
                    SUM(CASE WHEN booking_status = 'pending'    THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN booking_status = 'cancelled'  THEN 1 ELSE 0 END) AS cancelled,
                    COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END), 0) AS revenue,
                    COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN balance_amount ELSE 0 END), 0) AS balance_due
                FROM tbl_bookings
                WHERE slot_date = ? AND flag = 0`, [today]),

            // ── Pending approvals (online bookings) ───────
            db.promise().query(`
                SELECT b.id, b.booking_no, b.customer_name, b.customer_phone,
                       b.start_time, b.end_time, b.slot_date, b.total_amount,
                       b.booking_type, g.name AS ground_name
                FROM tbl_bookings b
                LEFT JOIN tbl_grounds g ON g.id = b.ground_id
                WHERE b.booking_status = 'pending'
                AND b.flag = 0
                ORDER BY b.created_at ASC
                LIMIT 10`),

            // ── Today's schedule (confirmed slots) ────────
            db.promise().query(`
                SELECT b.id, b.booking_no, b.customer_name, b.customer_phone,
                       b.start_time, b.end_time, b.booking_type, b.payment_status,
                       g.name AS ground_name
                FROM tbl_bookings b
                LEFT JOIN tbl_grounds g ON g.id = b.ground_id
                WHERE b.slot_date = ?
                AND b.booking_status = 'confirmed'
                AND b.flag = 0
                ORDER BY b.start_time ASC`, [today]),

            // ── Ground health ─────────────────────────────
            db.promise().query(`
                SELECT g.id, g.name, g.status, g.sport_type,
                    (SELECT filename FROM tbl_ground_images WHERE ground_id = g.id AND is_primary = 1 LIMIT 1) AS primary_image,
                    (SELECT COUNT(*) FROM tbl_bookings WHERE ground_id = g.id AND slot_date = ? AND booking_status = 'confirmed' AND flag = 0) AS today_confirmed,
                    (SELECT COUNT(*) FROM tbl_bookings WHERE ground_id = g.id AND slot_date = ? AND flag = 0) AS today_total,
                    (SELECT COUNT(*) FROM tbl_slots WHERE ground_id = g.id AND date = ?) AS total_slots
                FROM tbl_grounds g
                ORDER BY g.name ASC`, [today, today, today]),

            // ── Recent activity ───────────────────────────
            db.promise().query(`
                SELECT b.id, b.booking_no, b.customer_name, b.booking_status,
                       b.booking_type, b.total_amount, b.created_at,
                       g.name AS ground_name
                FROM tbl_bookings b
                LEFT JOIN tbl_grounds g ON g.id = b.ground_id
                WHERE b.flag = 0
                ORDER BY b.created_at DESC
                LIMIT 8`),

            // ── Last 7 days trend ─────────────────────────
            db.promise().query(`
                SELECT DATE_FORMAT(slot_date, '%Y-%m-%d') AS date,
                       COUNT(*) AS bookings,
                       COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END), 0) AS revenue
                FROM tbl_bookings
                WHERE slot_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                AND slot_date <= CURDATE()
                AND flag = 0
                GROUP BY slot_date
                ORDER BY slot_date ASC`),

            // ── Today's slot occupancy ────────────────────
            db.promise().query(`
                SELECT
                    COUNT(*) AS total_slots,
                    SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) AS booked_slots
                FROM tbl_slots
                WHERE date = ?`, [today]),

            // ── User ──────────────────────────────────────
            db.promise().query(
                'SELECT id, name, email FROM tbl_users WHERE id = ? LIMIT 1',
                [user_id]),

            // ── Monthly bookings for calendar ─────────────
            db.promise().query(`
                SELECT b.id, b.booking_no, b.customer_name, b.customer_phone,
                       b.slot_date, b.start_time, b.end_time,
                       b.booking_status, b.booking_type,
                       b.total_amount, b.advance_amount, b.balance_amount,
                       g.name AS ground_name
                FROM tbl_bookings b
                LEFT JOIN tbl_grounds g ON g.id = b.ground_id
                WHERE b.slot_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                  AND b.slot_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
                  AND b.flag = 0
                ORDER BY b.slot_date ASC, b.start_time ASC`),

            // ── Monthly Expenses Total ────────────────────
            db.promise().query(`
                SELECT 
                    COALESCE(SUM(amount), 0) AS total_expenses,
                    COUNT(*) AS expense_count
                FROM tbl_expenses 
                WHERE flag = 0 
                AND MONTH(expense_date) = ? 
                AND YEAR(expense_date) = ?`, [currentMonth, currentYear]),

            // ── Expense Category Breakdown (Top 5) ─────────
            db.promise().query(`
                SELECT 
                    category,
                    COALESCE(SUM(amount), 0) AS total,
                    COUNT(*) AS count
                FROM tbl_expenses 
                WHERE flag = 0 
                AND MONTH(expense_date) = ? 
                AND YEAR(expense_date) = ?
                GROUP BY category 
                ORDER BY total DESC 
                LIMIT 5`, [currentMonth, currentYear]),

            // ── Recent Expenses (Last 5) ──────────────────
            db.promise().query(`
                SELECT id, title, amount, category, expense_date, vendor, payment_mode
                FROM tbl_expenses 
                WHERE flag = 0 
                ORDER BY expense_date DESC, created_at DESC 
                LIMIT 5`),

            // ── Financial Summary (Revenue vs Expenses) ───
            db.promise().query(`
                SELECT 
                    (SELECT COALESCE(SUM(advance_amount), 0) FROM tbl_bookings 
                     WHERE booking_status = 'confirmed' AND flag = 0 
                     AND MONTH(confirmed_at) = ? AND YEAR(confirmed_at) = ?) AS monthly_revenue,
                    (SELECT COALESCE(SUM(amount), 0) FROM tbl_expenses 
                     WHERE flag = 0 
                     AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?) AS monthly_expenses
            `, [currentMonth, currentYear, currentMonth, currentYear])
        ]);

        const stats = todayStats[0];
        const slotData = slotStats[0];
        const occupancy = slotData.total_slots > 0
            ? Math.round((slotData.booked_slots / slotData.total_slots) * 100)
            : 0;

        const monthlyExpenses = expenseStats[0]?.total_expenses || 0;
        const monthlyRevenue = financialSummary[0]?.monthly_revenue || 0;
        const netProfit = monthlyRevenue - monthlyExpenses;
        const profitMargin = monthlyRevenue > 0 ? ((netProfit / monthlyRevenue) * 100).toFixed(1) : 0;

        return {
            user: user[0],
            stats: { ...stats, occupancy, total_slots: slotData.total_slots, booked_slots: slotData.booked_slots },
            pendingApprovals: pendingApprovals,
            todaySchedule: todaySchedule,
            grounds: grounds,
            recentActivity: recentActivity,
            weeklyTrend: weeklyTrend,
            monthlyBookings: monthlyBookings,
            financial: {
                monthly_expenses: monthlyExpenses,
                monthly_revenue: monthlyRevenue,
                net_profit: netProfit,
                profit_margin: profitMargin,
                expense_count: expenseStats[0]?.expense_count || 0
            },
            expenseCategories: expenseCategories,
            recentExpenses: recentExpenses
        };
    } catch (err) {
        throw err;
    }
};

module.exports = { getDashboardData };