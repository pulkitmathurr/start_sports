const db = require('../../config/db.config');

// ── Generate Customer ID — SS-CUST-YYYYMMDD-001 ───────────────────────
const generateCustomerId = async () => {
    const today = new Date();
    const dd    = String(today.getDate()).padStart(2, '0');
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const yy    = today.getFullYear();
    const prefix = `SS-CUST-${yy}${mm}${dd}`;

    const [rows] = await db.promise().query(
        'SELECT COUNT(*) as count FROM tbl_customers WHERE customer_id LIKE ?',
        [`${prefix}%`]
    );

    const count = rows[0].count + 1;
    return `${prefix}-${String(count).padStart(3, '0')}`;
};

// ── Find or Create Customer (called during booking) ───────────────────
// If phone already exists → return existing customer_id
// If not → create new customer and return new customer_id
const findOrCreateCustomer = async ({ name, phone, email }) => {
    try {
        // Check if customer already exists by phone
        const [existing] = await db.promise().query(
            'SELECT customer_id FROM tbl_customers WHERE phone = ? LIMIT 1',
            [phone]
        );

        if (existing.length > 0) {
            // Customer exists — update name/email if changed
            await db.promise().query(
                'UPDATE tbl_customers SET name = ?, email = ? WHERE phone = ?',
                [name, email || null, phone]
            );
            return existing[0].customer_id;
        }

        // New customer — generate ID and insert
        const customer_id = await generateCustomerId();

        await db.promise().query(
            `INSERT INTO tbl_customers (customer_id, name, phone, email)
             VALUES (?, ?, ?, ?)`,
            [customer_id, name, phone, email || null]
        );

        return customer_id;
    } catch (err) {
        throw err;
    }
};

// ── Update Customer Stats (called after booking is confirmed) ─────────
const updateCustomerStats = async (phone) => {
    try {
        await db.promise().query(
            `UPDATE tbl_customers
             SET
               total_bookings = (
                 SELECT COUNT(*) FROM tbl_bookings
                 WHERE customer_phone = ? AND booking_status = 'confirmed'
               ),
               total_spent = (
                 SELECT COALESCE(SUM(advance_amount), 0) FROM tbl_bookings
                 WHERE customer_phone = ? AND booking_status = 'confirmed'
               )
             WHERE phone = ?`,
            [phone, phone, phone]
        );
    } catch (err) {
        throw err;
    }
};

// ── Get All Customers (with search + pagination) ──────────────────────
// ── Get All Customers (with search + pagination) ──────────────────────
const getAllCustomers = async ({ search, limit = 10, offset = 0 }) => {
    try {
        let query  = `SELECT * FROM tbl_customers WHERE flag = 0`;
        const params = [];

        if (search) {
            // Remove name from search - only customer_id and phone
            query += ' AND (customer_id LIKE ? OR phone LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get Total Customers Count (for pagination) ────────────────────────
const getTotalCustomersCount = async ({ search }) => {
    try {
        let query    = `SELECT COUNT(*) as total FROM tbl_customers WHERE flag = 0`;
        const params = [];

        if (search) {
            // Remove name from search - only customer_id and phone
            query += ' AND (customer_id LIKE ? OR phone LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        const [rows] = await db.promise().query(query, params);
        return rows[0].total;
    } catch (err) {
        throw err;
    }
};
// ── Get Single Customer Profile ───────────────────────────────────────
const getCustomerById = async (customer_id) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT * FROM tbl_customers WHERE customer_id = ? AND flag = 0 LIMIT 1',
            [customer_id]
        );

        if (rows.length === 0) {
            const err = new Error('Customer not found');
            err.statusCode = 404;
            throw err;
        }

        return rows[0];
    } catch (err) {
        throw err;
    }
};

// ── Get Customer Booking History ──────────────────────────────────────
const getCustomerHistory = async ({ customer_id, status, date_from, date_to, search, limit = 10, offset = 0 }) => {
    try {
        // Get customer info first
        const customer = await getCustomerById(customer_id);

        // Build booking query
        let query = `
            SELECT b.*, g.name AS ground_name
            FROM tbl_bookings b
            LEFT JOIN tbl_grounds g ON g.id = b.ground_id
            WHERE b.customer_id = ? AND b.flag = 0
        `;
        const params = [customer_id];

        if (status)    { query += ' AND b.booking_status = ?'; params.push(status); }
        if (date_from) { query += ' AND b.slot_date >= ?';     params.push(date_from); }
        if (date_to)   { query += ' AND b.slot_date <= ?';     params.push(date_to); }
        if (search) {
            query += ' AND (b.booking_no LIKE ? OR g.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY b.slot_date DESC, b.start_time ASC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [bookings] = await db.promise().query(query, params);

        // Stats for this customer
        const [stats] = await db.promise().query(
            `SELECT
                COUNT(*)                                                               AS total_bookings,
                SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END)         AS confirmed,
                SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END)         AS cancelled,
                SUM(CASE WHEN booking_status = 'pending'   THEN 1 ELSE 0 END)         AS pending,
                COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END), 0) AS total_spent,
                (
                    SELECT g.name FROM tbl_bookings b2
                    LEFT JOIN tbl_grounds g ON g.id = b2.ground_id
                    WHERE b2.customer_id = ? AND b2.booking_status = 'confirmed'
                    GROUP BY b2.ground_id
                    ORDER BY COUNT(*) DESC LIMIT 1
                ) AS favourite_ground,
                (
                    SELECT CASE
                        WHEN HOUR(b3.start_time) < 12 THEN 'Morning'
                        WHEN HOUR(b3.start_time) < 17 THEN 'Afternoon'
                        ELSE 'Evening'
                    END
                    FROM tbl_bookings b3
                    WHERE b3.customer_id = ? AND b3.booking_status = 'confirmed'
                    GROUP BY CASE
                        WHEN HOUR(b3.start_time) < 12 THEN 'Morning'
                        WHEN HOUR(b3.start_time) < 17 THEN 'Afternoon'
                        ELSE 'Evening'
                    END
                    ORDER BY COUNT(*) DESC LIMIT 1
                ) AS preferred_slot
             FROM tbl_bookings
             WHERE customer_id = ? AND flag = 0`,
            [customer_id, customer_id, customer_id]
        );

        return { customer, bookings, stats: stats[0] };
    } catch (err) {
        throw err;
    }
};

// ── Get Customer History Count (for pagination) ───────────────────────
const getCustomerHistoryCount = async ({ customer_id, status, date_from, date_to, search }) => {
    try {
        let query    = `SELECT COUNT(*) as total FROM tbl_bookings b LEFT JOIN tbl_grounds g ON g.id = b.ground_id WHERE b.customer_id = ? AND b.flag = 0`;
        const params = [customer_id];

        if (status)    { query += ' AND b.booking_status = ?'; params.push(status); }
        if (date_from) { query += ' AND b.slot_date >= ?';     params.push(date_from); }
        if (date_to)   { query += ' AND b.slot_date <= ?';     params.push(date_to); }
        if (search) {
            query += ' AND (b.booking_no LIKE ? OR g.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        const [rows] = await db.promise().query(query, params);
        return rows[0].total;
    } catch (err) {
        throw err;
    }
};

// ── Update Customer Address (admin can fill later) ────────────────────
const updateCustomerAddress = async ({ customer_id, address }) => {
    try {
        await db.promise().query(
            'UPDATE tbl_customers SET address = ? WHERE customer_id = ?',
            [address, customer_id]
        );
        return true;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    findOrCreateCustomer,
    updateCustomerStats,
    getAllCustomers,
    getTotalCustomersCount,
    getCustomerById,
    getCustomerHistory,
    getCustomerHistoryCount,
    updateCustomerAddress
};