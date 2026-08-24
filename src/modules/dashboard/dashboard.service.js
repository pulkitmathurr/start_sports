const db = require('../../config/db.config');

const getDashboardData = async ({ user_id, tenant_id, user_role }) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const isAdmin = user_role === 'admin' && tenant_id;

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
            [financialSummary],
            [todayExpenses],
            [activeGrounds],
            [monthlyConfirmed],
            [announcements]
        ] = await Promise.all([

            // ── Today's stat cards ────────────────────────
            db.promise().query(`
                SELECT
                    COUNT(*) AS total_bookings,
                    SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
                    SUM(CASE WHEN booking_status = 'pending' THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
                    COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END), 0) AS revenue,
                    COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN balance_amount ELSE 0 END), 0) AS balance_due,
                    SUM(CASE WHEN booking_type = 'walkin' THEN 1 ELSE 0 END) AS walkin_count,
                    SUM(CASE WHEN booking_type = 'online' THEN 1 ELSE 0 END) AS online_count
                FROM tbl_bookings b
                WHERE b.slot_date = ? AND b.flag = 0
                ${isAdmin ? 'AND b.tenant_id = ?' : ''}
            `, isAdmin ? [today, tenant_id] : [today]),

            // ── Pending approvals (online bookings) ───────
            db.promise().query(`
                SELECT b.id, b.booking_no, b.customer_name, b.customer_phone,
                       b.start_time, b.end_time, b.slot_date, b.total_amount,
                       b.booking_type, g.name AS ground_name
                FROM tbl_bookings b
                LEFT JOIN tbl_grounds g ON g.id = b.ground_id
                WHERE b.booking_status = 'pending'
                AND b.flag = 0
                ${isAdmin ? 'AND b.tenant_id = ?' : ''}
                ORDER BY b.created_at ASC
                LIMIT 10
            `, isAdmin ? [tenant_id] : []),

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
                ${isAdmin ? 'AND b.tenant_id = ?' : ''}
                ORDER BY b.start_time ASC
            `, isAdmin ? [today, tenant_id] : [today]),

            // ── Ground health ─────────────────────────────
            db.promise().query(`
                SELECT g.id, g.name, g.status, g.sport_type,
                    (SELECT filename FROM tbl_ground_images WHERE ground_id = g.id AND is_primary = 1 LIMIT 1) AS primary_image,
                    (SELECT COUNT(*) FROM tbl_bookings 
                     WHERE ground_id = g.id 
                     AND slot_date = ? 
                     AND booking_status = 'confirmed' 
                     AND flag = 0 
                     ${isAdmin ? 'AND tenant_id = ?' : ''}
                    ) AS today_confirmed,
                    (SELECT COUNT(*) FROM tbl_bookings 
                     WHERE ground_id = g.id 
                     AND slot_date = ? 
                     AND flag = 0 
                     ${isAdmin ? 'AND tenant_id = ?' : ''}
                    ) AS today_total,
                    (SELECT COUNT(*) FROM tbl_slots WHERE ground_id = g.id AND date = ? ${isAdmin ? 'AND tenant_id = ?' : ''}) AS total_slots
                FROM tbl_grounds g
                WHERE g.flag = 0
                ${isAdmin ? 'AND g.tenant_id = ?' : ''}
                ORDER BY g.name ASC
            `, isAdmin ? [today, tenant_id, today, tenant_id, today, tenant_id, tenant_id] : [today, today, today]),

            // ── Recent activity ───────────────────────────
            db.promise().query(`
                SELECT b.id, b.booking_no, b.customer_name, b.booking_status,
                       b.booking_type, b.total_amount, b.created_at,
                       g.name AS ground_name
                FROM tbl_bookings b
                LEFT JOIN tbl_grounds g ON g.id = b.ground_id
                WHERE b.flag = 0
                ${isAdmin ? 'AND b.tenant_id = ?' : ''}
                ORDER BY b.created_at DESC
                LIMIT 8
            `, isAdmin ? [tenant_id] : []),

            // ── Last 7 days trend ─────────────────────────
            db.promise().query(`
                SELECT DATE_FORMAT(b.slot_date, '%Y-%m-%d') AS date,
                       COUNT(*) AS bookings,
                       COALESCE(SUM(CASE WHEN b.booking_status = 'confirmed' THEN b.advance_amount ELSE 0 END), 0) AS revenue
                FROM tbl_bookings b
                WHERE b.slot_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                AND b.slot_date <= CURDATE()
                AND b.flag = 0
                ${isAdmin ? 'AND b.tenant_id = ?' : ''}
                GROUP BY b.slot_date
                ORDER BY b.slot_date ASC
            `, isAdmin ? [tenant_id] : []),

            // ── Today's slot occupancy ────────────────────────────
            // Counts only slots from current time onwards (remaining slots today).
            // s.flag = 0 excludes soft-deleted stale slots from old generations.
            // No GROUP BY so it always returns exactly one row even with no data.
            db.promise().query(`
                SELECT
                    COUNT(DISTINCT s.id) AS total_slots,
                    COUNT(DISTINCT CASE
                        WHEN b.booking_status IN ('confirmed', 'approved', 'pending') THEN s.id
                        ELSE NULL
                    END) AS booked_slots
                FROM tbl_slots s
                INNER JOIN tbl_grounds g ON g.id = s.ground_id AND g.flag = 0
                LEFT JOIN tbl_bookings b ON b.slot_id = s.id
                    AND b.slot_date = s.date
                    AND b.booking_status IN ('confirmed', 'approved', 'pending')
                    AND b.flag = 0
                WHERE s.date = ?
                AND s.flag = 0
                ${isAdmin ? 'AND g.tenant_id = ?' : ''}
            `, isAdmin ? [today, tenant_id] : [today]),

            // ── User ──────────────────────────────────────
            db.promise().query(
                'SELECT id, name, email FROM tbl_users WHERE id = ? LIMIT 1',
                [user_id]
            ),

            // ── Monthly bookings for calendar (counts per day) ──
            db.promise().query(`
                SELECT DATE_FORMAT(b.slot_date, '%Y-%m-%d') AS date,
                       COUNT(*) AS count
                FROM tbl_bookings b
                WHERE b.slot_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  AND b.slot_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 12 MONTH), '%Y-%m-01')
                  AND b.flag = 0
                ${isAdmin ? 'AND b.tenant_id = ?' : ''}
                GROUP BY DATE_FORMAT(b.slot_date, '%Y-%m-%d')
                ORDER BY date ASC
            `, isAdmin ? [tenant_id] : []),

            // ── Monthly Expenses Total (expenseStats) ────
            db.promise().query(`
                SELECT
                    COALESCE(SUM(amount), 0) AS total_expenses,
                    COUNT(*) AS expense_count
                FROM tbl_expenses
                WHERE flag = 0
                AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?
                ${isAdmin ? 'AND tenant_id = ?' : ''}
            `, isAdmin ? [currentMonth, currentYear, tenant_id] : [currentMonth, currentYear]),

            // ── Expense Category Breakdown (expenseCategories) ─
            db.promise().query(`
                SELECT
                    category,
                    COALESCE(SUM(amount), 0) AS total,
                    COUNT(*) AS count
                FROM tbl_expenses
                WHERE flag = 0
                AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?
                ${isAdmin ? 'AND tenant_id = ?' : ''}
                GROUP BY category ORDER BY total DESC LIMIT 5
            `, isAdmin ? [currentMonth, currentYear, tenant_id] : [currentMonth, currentYear]),

            // ── Recent Expenses (recentExpenses) ─────────────
            db.promise().query(`
                SELECT id, title, amount, category, expense_date, vendor, payment_mode
                FROM tbl_expenses
                WHERE flag = 0
                ${isAdmin ? 'AND tenant_id = ?' : ''}
                ORDER BY expense_date DESC, created_at DESC LIMIT 5
            `, isAdmin ? [tenant_id] : []),

            // ── Financial Summary (financialSummary) ──────────
            db.promise().query(`
                SELECT
                    (SELECT COALESCE(SUM(advance_amount), 0) FROM tbl_bookings
                     WHERE booking_status = 'confirmed' AND flag = 0
                     AND MONTH(slot_date) = ? AND YEAR(slot_date) = ?
                     ${isAdmin ? 'AND tenant_id = ?' : ''}
                    ) AS monthly_revenue,
                    (SELECT COALESCE(SUM(amount), 0) FROM tbl_expenses
                     WHERE flag = 0
                     AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?
                     ${isAdmin ? 'AND tenant_id = ?' : ''}
                    ) AS monthly_expenses
            `, isAdmin ? [currentMonth, currentYear, tenant_id, currentMonth, currentYear, tenant_id] : [currentMonth, currentYear, currentMonth, currentYear]),

            // ── Today's Expenses (todayExpenses) ─────────────
            db.promise().query(`
                SELECT COALESCE(SUM(amount), 0) AS today_expenses, COUNT(*) AS today_expense_count
                FROM tbl_expenses
                WHERE flag = 0 AND expense_date = ?
                ${isAdmin ? 'AND tenant_id = ?' : ''}
            `, isAdmin ? [today, tenant_id] : [today]),

            // ── Active Grounds Count (activeGrounds) ──────────
            db.promise().query(`
                SELECT COUNT(*) AS active_grounds
                FROM tbl_grounds
                WHERE flag = 0 AND status = 'active'
                ${isAdmin ? 'AND tenant_id = ?' : ''}
            `, isAdmin ? [tenant_id] : []),

            // ── Monthly Confirmed Bookings (monthlyConfirmed) ──
            db.promise().query(`
                SELECT COUNT(*) AS monthly_confirmed
                FROM tbl_bookings
                WHERE flag = 0 AND booking_status = 'confirmed'
                AND MONTH(slot_date) = ? AND YEAR(slot_date) = ?
                ${isAdmin ? 'AND tenant_id = ?' : ''}
            `, isAdmin ? [currentMonth, currentYear, tenant_id] : [currentMonth, currentYear]),

            // ── Active announcements for tenant admins ────
            db.promise().query(`
                SELECT id, title, message, type
                FROM tbl_announcements
                WHERE is_active = 1
                  AND show_from <= CURDATE()
                  AND (show_until IS NULL OR show_until >= CURDATE())
                ORDER BY created_at DESC
            `)
        ]);

        const stats = todayStats[0];
        
        // FIXED: Handle case where slotStats might be empty
        const slotData = slotStats[0] || { total_slots: 0, booked_slots: 0 };
        const occupancy = slotData.total_slots > 0
            ? Math.round((slotData.booked_slots / slotData.total_slots) * 100)
            : 0;

        const monthlyExpenses = expenseStats[0]?.total_expenses || 0;
        const monthlyRevenue = financialSummary[0]?.monthly_revenue || 0;
        const netProfit = monthlyRevenue - monthlyExpenses;
        const profitMargin = monthlyRevenue > 0 ? ((netProfit / monthlyRevenue) * 100).toFixed(1) : 0;

        return {
            user: user[0],
            stats: {
                ...stats,
                occupancy,
                total_slots: slotData.total_slots,
                booked_slots: slotData.booked_slots,
                today_expenses: todayExpenses[0]?.today_expenses || 0,
                today_expense_count: todayExpenses[0]?.today_expense_count || 0,
                active_grounds: activeGrounds[0]?.active_grounds || 0,
                monthly_confirmed: monthlyConfirmed[0]?.monthly_confirmed || 0
            },
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
            recentExpenses: recentExpenses,
            announcements: announcements
        };
    } catch (err) {
        throw err;
    }
};

module.exports = { getDashboardData };