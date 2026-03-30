const db = require('../../config/db.config');

// ── Get All Grounds with booking stats ────────────
const getAllGrounds = async () => {
    try {
        const [rows] = await db.promise().query(
            `SELECT g.*,
                (SELECT filename FROM tbl_ground_images
                 WHERE ground_id = g.id AND is_primary = 1 LIMIT 1) AS primary_image,
                (SELECT COUNT(*) FROM tbl_bookings WHERE ground_id = g.id) AS total_bookings,
                (SELECT COUNT(*) FROM tbl_bookings WHERE ground_id = g.id AND booking_status = 'confirmed') AS confirmed_bookings,
                (SELECT COUNT(*) FROM tbl_bookings WHERE ground_id = g.id AND booking_status = 'pending') AS pending_bookings,
                (SELECT COALESCE(SUM(advance_amount),0) FROM tbl_bookings WHERE ground_id = g.id AND booking_status = 'confirmed') AS total_revenue,
                (SELECT slot_date FROM tbl_bookings WHERE ground_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_booking_date
             FROM tbl_grounds g ORDER BY g.created_at DESC`
        );
        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get History for a specific Ground ─────────────
// ── Get Total History Count (for pagination) ──────
const getTotalHistoryCount = async ({ ground_id, status, date_from, date_to, search }) => {
    try {
        let query = `SELECT COUNT(*) AS total FROM tbl_bookings b WHERE b.ground_id = ? AND b.flag = 0`;
        const params = [ground_id];

        if (status)    { query += ' AND b.booking_status = ?'; params.push(status); }
        if (date_from) { query += ' AND b.slot_date >= ?';     params.push(date_from); }
        if (date_to)   { query += ' AND b.slot_date <= ?';     params.push(date_to); }
        if (search) {
            query += ' AND (b.customer_name LIKE ? OR b.customer_phone LIKE ? OR b.booking_no LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const [rows] = await db.promise().query(query, params);
        return rows[0].total;
    } catch (err) {
        throw err;
    }
};

const getGroundHistory = async ({ ground_id, status, date_from, date_to, search, limit = 10, offset = 0 }) => {
    try {
        const [groundRows] = await db.promise().query(
            `SELECT g.*,
                (SELECT filename FROM tbl_ground_images
                 WHERE ground_id = g.id AND is_primary = 1 LIMIT 1) AS primary_image
             FROM tbl_grounds g WHERE g.id = ?`,
            [ground_id]
        );
        if (groundRows.length === 0) {
            const err = new Error('Ground not found');
            err.statusCode = 404;
            throw err;
        }

        let query = `SELECT b.* FROM tbl_bookings b WHERE b.ground_id = ? AND b.flag = 0`;
        const params = [ground_id];

        if (status)    { query += ' AND b.booking_status = ?'; params.push(status); }
        if (date_from) { query += ' AND b.slot_date >= ?';     params.push(date_from); }
        if (date_to)   { query += ' AND b.slot_date <= ?';     params.push(date_to); }
        if (search) {
            query += ' AND (b.customer_name LIKE ? OR b.customer_phone LIKE ? OR b.booking_no LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY b.slot_date DESC, b.start_time ASC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [bookings] = await db.promise().query(query, params);

        const [stats] = await db.promise().query(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN booking_status = 'pending'   THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
                SUM(CASE WHEN booking_status = 'rejected'  THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN booking_status = 'expired'   THEN 1 ELSE 0 END) AS expired,
                COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END),0) AS revenue
             FROM tbl_bookings WHERE ground_id = ?`,
            [ground_id]
        );

        return { ground: groundRows[0], bookings, stats: stats[0] };
    } catch (err) {
        throw err;
    }
};

// ── Soft Delete Booking ───────────────────────────
const softDeleteBooking = async (booking_id) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT id FROM tbl_bookings WHERE id = ? AND flag = 0',
            [booking_id]
        );
        if (rows.length === 0) {
            const err = new Error('Booking not found');
            err.statusCode = 404;
            throw err;
        }
        await db.promise().query(
            'UPDATE tbl_bookings SET flag = 1 WHERE id = ?',
            [booking_id]
        );
        return true;
    } catch (err) {
        throw err;
    }
};

module.exports = { getAllGrounds, getGroundHistory, getTotalHistoryCount, softDeleteBooking };