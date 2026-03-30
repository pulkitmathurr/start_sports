const dashboardService = require('./dashboard.service');

const getDashboard = async (req, res, next) => {
    try {
        const data = await dashboardService.getDashboardData({
            user_id: req.user.user_id
        });

        return res.render('dashboard', {
            title:      'Dashboard',
            activePage: 'dashboard',
            data
        });
    } catch (error) { next(error); }
};

// ── Approve booking (AJAX from dashboard) ────────
const approveBooking = async (req, res, next) => {
    try {
        const { booking_id } = req.body;
        await require('../../config/db.config').promise().query(
            `UPDATE tbl_bookings SET booking_status = 'approved', approved_at = NOW() WHERE id = ?`,
            [booking_id]
        );
        return res.json({ success: true });
    } catch (error) { next(error); }
};

// ── Reject booking (AJAX from dashboard) ─────────
const rejectBooking = async (req, res, next) => {
    try {
        const { booking_id } = req.body;
        await require('../../config/db.config').promise().query(
            `UPDATE tbl_bookings SET booking_status = 'rejected' WHERE id = ?`,
            [booking_id]
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
        const [bookings] = await db.promise().query(
            `SELECT b.id, b.booking_no, b.customer_name, b.customer_phone,
                    b.start_time, b.end_time, b.booking_status, b.booking_type,
                    b.total_amount, b.advance_amount, b.balance_amount,
                    b.payment_status, g.name AS ground_name
             FROM tbl_bookings b
             LEFT JOIN tbl_grounds g ON g.id = b.ground_id
             WHERE b.slot_date = ? AND b.flag = 0
             ORDER BY b.start_time ASC`,
            [date]
        );

        return res.json({ success: true, bookings });
    } catch (error) { next(error); }
};

module.exports = { getDashboard, approveBooking, rejectBooking, getBookingsByDate };