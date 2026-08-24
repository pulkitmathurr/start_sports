const dashboardService = require('./dashboard.service');

const getDashboard = async (req, res, next) => {
    try {
        const data = await dashboardService.getDashboardData({
            user_id: req.user.user_id,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        return res.render('dashboard', {
            title:      'Dashboard',
            activePage: 'dashboard',
            data,
            user: res.locals.user,
            tenant: req.tenant
        });
    } catch (error) { next(error); }
};

// ── Approve booking (AJAX from dashboard) ────────
const approveBooking = async (req, res, next) => {
    try {
        const { booking_id } = req.body;

        let tenantCondition = '';
        let params = [booking_id];
        if (req.user.role === 'admin' && req.tenant) {
            tenantCondition = ' AND tenant_id = ?';
            params.push(req.tenant.id);
        }

        await require('../../config/db.config').promise().query(
            `UPDATE tbl_bookings SET booking_status = 'approved', approved_at = NOW() WHERE id = ? ${tenantCondition}`,
            params
        );
        return res.json({ success: true });
    } catch (error) { next(error); }
};

// ── Reject booking (AJAX from dashboard) ─────────
const rejectBooking = async (req, res, next) => {
    try {
        const { booking_id } = req.body;

        let tenantCondition = '';
        let params = [booking_id];
        if (req.user.role === 'admin' && req.tenant) {
            tenantCondition = ' AND tenant_id = ?';
            params.push(req.tenant.id);
        }

        await require('../../config/db.config').promise().query(
            `UPDATE tbl_bookings SET booking_status = 'rejected' WHERE id = ? ${tenantCondition}`,
            params
        );
        return res.json({ success: true });
    } catch (error) { next(error); }
};

// ── Get bookings for a specific date (AJAX from calendar) ────────
const getBookingsByDate = async (req, res, next) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'Date is required' });
        }

        const db = require('../../config/db.config');

        let tenantCondition = '';
        let params = [date];
        if (req.user.role === 'admin' && req.tenant) {
            tenantCondition = ' AND b.tenant_id = ?';
            params.push(req.tenant.id);
        }

        const [bookings] = await db.promise().query(`
            SELECT b.id, b.booking_no, b.customer_name, b.customer_phone,
                    b.start_time, b.end_time, b.booking_status, b.booking_type,
                    b.total_amount, b.advance_amount, b.balance_amount,
                    b.payment_status, g.name AS ground_name
             FROM tbl_bookings b
             LEFT JOIN tbl_grounds g ON g.id = b.ground_id
             WHERE b.slot_date = ? AND b.flag = 0 ${tenantCondition}
             ORDER BY b.start_time ASC
        `, params);

        return res.json({ success: true, bookings });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ── GET /dashboard/month-bookings?year=2026&month=7 ───────────
const getMonthBookings = async (req, res, next) => {
    try {
        const year  = parseInt(req.query.year);
        const month = parseInt(req.query.month);
        if (!year || !month) return res.status(400).json({ success: false, message: 'year and month required' });

        const db = require('../../config/db.config');
        let tenantCondition = '';
        const params = [year, month];
        if (req.user.role === 'admin' && req.tenant) {
            tenantCondition = ' AND tenant_id = ?';
            params.push(req.tenant.id);
        }

        const [rows] = await db.promise().query(`
            SELECT DATE_FORMAT(slot_date, '%Y-%m-%d') AS date, COUNT(*) AS count
            FROM tbl_bookings
            WHERE YEAR(slot_date) = ? AND MONTH(slot_date) = ?
              AND flag = 0 AND booking_status != 'cancelled'
              ${tenantCondition}
            GROUP BY slot_date
        `, params);

        return res.json({ success: true, bookings: rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getDashboard, approveBooking, rejectBooking, getBookingsByDate, getMonthBookings };