const db = require("../../config/db.config");

// ── Generate Customer ID — SS-CUST-YYYYMMDD-001 ───────────────────────
const generateCustomerId = async () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yy = today.getFullYear();
  const prefix = `SS-CUST-${yy}${mm}${dd}`;

  const [rows] = await db
    .promise()
    .query(
      "SELECT COUNT(*) as count FROM tbl_customers WHERE customer_id LIKE ?",
      [`${prefix}%`],
    );

  const count = rows[0].count + 1;
  return `${prefix}-${String(count).padStart(3, "0")}`;
};

// ── Find or Create Customer (called during booking) ───────────────────
const findOrCreateCustomer = async ({
  name,
  phone,
  email,
  tenant_id = null,
}) => {
  try {
    // Bug 3 fix: always scope lookup to tenant_id + phone (not phone alone).
    // The old global UNIQUE KEY `phone` on tbl_customers caused a duplicate-entry
    // crash when two different tenants booked the same phone number.
    // The correct schema has UNIQUE KEY `tenant_phone` (tenant_id, phone) — see migration SQL.
    // This query is also safe against the old global-unique schema: it checks
    // tenant_id + phone before attempting an insert, so it never hits a dupe.
    const [existing] = await db
      .promise()
      .query(
        "SELECT customer_id FROM tbl_customers WHERE phone = ? AND tenant_id = ? LIMIT 1",
        [phone, tenant_id],
      );

    if (existing.length > 0) {
      // Customer exists for this tenant — update name/email if they changed
      await db
        .promise()
        .query(
          "UPDATE tbl_customers SET name = ?, email = ? WHERE phone = ? AND tenant_id = ?",
          [name, email || null, phone, tenant_id],
        );
      return existing[0].customer_id;
    }

    // New customer for this tenant — generate ID and insert
    const customer_id = await generateCustomerId();

    try {
      await db.promise().query(
        `INSERT INTO tbl_customers (customer_id, name, phone, email, tenant_id)
                 VALUES (?, ?, ?, ?, ?)`,
        [customer_id, name, phone, email || null, tenant_id],
      );
    } catch (insertErr) {
      // Race condition: another request inserted the same tenant+phone between
      // our SELECT and INSERT. Re-fetch and return the existing record.
      if (insertErr.code === "ER_DUP_ENTRY") {
        const [retry] = await db
          .promise()
          .query(
            "SELECT customer_id FROM tbl_customers WHERE phone = ? AND tenant_id = ? LIMIT 1",
            [phone, tenant_id],
          );
        if (retry.length > 0) return retry[0].customer_id;
      }
      throw insertErr;
    }

    return customer_id;
  } catch (err) {
    throw err;
  }
};

// ── Update Customer Stats (called after booking is confirmed) ─────────
const updateCustomerStats = async (phone, tenant_id = null) => {
    try {
        await db.promise().query(`
            UPDATE tbl_customers
            SET
               total_bookings = (
                 SELECT COUNT(*) FROM tbl_bookings
                 WHERE customer_phone = ? AND booking_status = 'confirmed' AND tenant_id = ?
               ),
               total_spent = (
                 SELECT COALESCE(SUM(advance_amount), 0) FROM tbl_bookings
                 WHERE customer_phone = ? AND booking_status = 'confirmed' AND tenant_id = ?
               )
            WHERE phone = ? AND tenant_id = ?
        `, [phone, tenant_id, phone, tenant_id, phone, tenant_id]);
    } catch (err) {
        throw err;
    }
};

// ── Get All Customers (with search + pagination) ──────────────────────
const getAllCustomers = async ({
  search,
  sort_by = null,
  limit = 10,
  offset = 0,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    let query = `SELECT * FROM tbl_customers WHERE flag = 0`;
    const params = [];

    // ADD TENANT FILTER - THIS IS THE FIX!
    if (user_role === "admin" && tenant_id) {
      query += " AND tenant_id = ?";
      params.push(tenant_id);
    }

    if (search) {
      query += " AND (customer_id LIKE ? OR phone LIKE ? OR name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const validSorts = { bookings: 'total_bookings DESC', revenue: 'total_spent DESC' };
    const orderBy = validSorts[sort_by] || 'created_at DESC';
    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.promise().query(query, params);
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Get Total Customers Count (for pagination) ────────────────────────
const getTotalCustomersCount = async ({
  search,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    let query = `SELECT COUNT(*) as total FROM tbl_customers WHERE flag = 0`;
    const params = [];

    // ADD TENANT FILTER - THIS IS THE FIX!
    if (user_role === "admin" && tenant_id) {
      query += " AND tenant_id = ?";
      params.push(tenant_id);
    }

    if (search) {
      query += " AND (customer_id LIKE ? OR phone LIKE ? OR name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await db.promise().query(query, params);
    return rows[0].total;
  } catch (err) {
    throw err;
  }
};

// ── Get Single Customer Profile ───────────────────────────────────────
const getCustomerById = async (
  customer_id,
  tenant_id = null,
  user_role = "admin",
) => {
  try {
    let query =
      "SELECT * FROM tbl_customers WHERE customer_id = ? AND flag = 0";
    let params = [customer_id];

    // ADD TENANT FILTER
    if (user_role === "admin" && tenant_id) {
      query += " AND tenant_id = ?";
      params.push(tenant_id);
    }
    query += " LIMIT 1";

    const [rows] = await db.promise().query(query, params);

    if (rows.length === 0) {
      const err = new Error("Customer not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    return rows[0];
  } catch (err) {
    throw err;
  }
};

// ── Get Customer Booking History ──────────────────────────────────────
const getCustomerHistory = async ({
  customer_id,
  status,
  date_from,
  date_to,
  search,
  limit = 10,
  offset = 0,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    // Get customer info first with tenant check
    const customer = await getCustomerById(customer_id, tenant_id, user_role);

    // Build booking query
    let query = `
            SELECT b.*, g.name AS ground_name
            FROM tbl_bookings b
            LEFT JOIN tbl_grounds g ON g.id = b.ground_id
            WHERE b.customer_id = ? AND b.flag = 0
        `;
    const params = [customer_id];

    // ADD TENANT FILTER TO BOOKINGS
    if (user_role === "admin" && tenant_id) {
      query += " AND b.tenant_id = ?";
      params.push(tenant_id);
    }

    if (status) {
      query += " AND b.booking_status = ?";
      params.push(status);
    }
    if (date_from) {
      query += " AND b.slot_date >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND b.slot_date <= ?";
      params.push(date_to);
    }
    if (search) {
      query += " AND (b.booking_no LIKE ? OR g.name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY b.slot_date DESC, b.start_time ASC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [bookings] = await db.promise().query(query, params);

    // Stats for this customer
    let statsQuery = `
            SELECT
                COUNT(*)                                                               AS total_bookings,
                SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END)         AS confirmed,
                SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END)         AS cancelled,
                SUM(CASE WHEN booking_status = 'pending'   THEN 1 ELSE 0 END)         AS pending,
                COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END), 0) AS total_spent,
                (
    SELECT g.name FROM tbl_bookings b2
    LEFT JOIN tbl_grounds g ON g.id = b2.ground_id
    WHERE b2.customer_id = ? AND b2.booking_status = 'confirmed'
    GROUP BY g.id ORDER BY COUNT(*) DESC LIMIT 1
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
             WHERE customer_id = ? AND flag = 0
        `;
    let statsParams = [customer_id, customer_id, customer_id];

    // ADD TENANT FILTER TO STATS
    if (user_role === "admin" && tenant_id) {
      statsQuery += " AND tenant_id = ?";
      statsParams.push(tenant_id);
    }

    const [stats] = await db.promise().query(statsQuery, statsParams);

    return { customer, bookings, stats: stats[0] };
  } catch (err) {
    throw err;
  }
};

// ── Get Customer History Count (for pagination) ───────────────────────
const getCustomerHistoryCount = async ({
  customer_id,
  status,
  date_from,
  date_to,
  search,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    let query = `SELECT COUNT(*) as total FROM tbl_bookings b LEFT JOIN tbl_grounds g ON g.id = b.ground_id WHERE b.customer_id = ? AND b.flag = 0`;
    const params = [customer_id];

    // ADD TENANT FILTER
    if (user_role === "admin" && tenant_id) {
      query += " AND b.tenant_id = ?";
      params.push(tenant_id);
    }

    if (status) {
      query += " AND b.booking_status = ?";
      params.push(status);
    }
    if (date_from) {
      query += " AND b.slot_date >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND b.slot_date <= ?";
      params.push(date_to);
    }
    if (search) {
      query += " AND (b.booking_no LIKE ? OR g.name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await db.promise().query(query, params);
    return rows[0].total;
  } catch (err) {
    throw err;
  }
};

// ── Update Customer Address (admin can fill later) ────────────────────
const updateCustomerAddress = async ({
  customer_id,
  address,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    let query = "UPDATE tbl_customers SET address = ? WHERE customer_id = ?";
    let params = [address, customer_id];

    // ADD TENANT FILTER
    if (user_role === "admin" && tenant_id) {
      query += " AND tenant_id = ?";
      params.push(tenant_id);
    }

    const [result] = await db.promise().query(query, params);

    if (result.affectedRows === 0) {
      const err = new Error("Customer not found or unauthorized");
      err.statusCode = 404;
      throw err;
    }

    return true;
  } catch (err) {
    throw err;
  }
};

// ── Search Customers for Quick Book (live search) ─────────────
const searchCustomers = async (query, tenant_id = null) => {
  try {
    const like = `%${query}%`;
    let sql = `
      SELECT c.id, c.customer_id, c.name, c.phone, c.email, c.total_bookings, c.total_spent,
             COALESCE(SUM(CASE WHEN b.payment_status IN ('partial','pending') AND b.booking_status != 'cancelled' AND b.flag = 0 THEN b.balance_amount ELSE 0 END), 0) AS pending_balance
      FROM tbl_customers c
      LEFT JOIN tbl_bookings b ON b.customer_id = c.customer_id AND b.flag = 0
      WHERE c.flag = 0
      AND (c.name LIKE ? OR c.phone LIKE ?)
    `;
    const params = [like, like];
    if (tenant_id) {
      sql += ' AND c.tenant_id = ?';
      params.push(tenant_id);
    }
    sql += ' GROUP BY c.id ORDER BY c.total_bookings DESC LIMIT 8';
    const [rows] = await db.promise().query(sql, params);
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Manually Create Customer (from Customer Directory) ───────────────
const createCustomer = async ({ name, phone, email, tenant_id }) => {
  try {
    // Check if phone already exists for this tenant
    const [existing] = await db.promise().query(
      'SELECT customer_id, name FROM tbl_customers WHERE phone = ? AND tenant_id = ? LIMIT 1',
      [phone, tenant_id]
    );
    if (existing.length > 0) {
      const err = new Error(`A customer with this phone number already exists: ${existing[0].name}`);
      err.code = 'DUPLICATE_PHONE';
      throw err;
    }

    const customer_id = await generateCustomerId();
    await db.promise().query(
      `INSERT INTO tbl_customers (customer_id, name, phone, email, tenant_id) VALUES (?, ?, ?, ?, ?)`,
      [customer_id, name.trim(), phone.trim(), email ? email.trim() : null, tenant_id]
    );
    return { customer_id, name: name.trim(), phone: phone.trim() };
  } catch (err) {
    throw err;
  }
};


// ── Edit Customer (name, email, address only — phone is locked) ───────
const updateCustomer = async ({ customer_id, name, email, address, tenant_id = null, user_role = 'admin' }) => {
  try {
    if (!name || !name.trim()) {
      const err = new Error('Name is required');
      err.code = 'VALIDATION';
      throw err;
    }

    let query = `UPDATE tbl_customers SET name = ?, email = ?, address = ? WHERE customer_id = ? AND flag = 0`;
    let params = [name.trim(), email ? email.trim() : null, address ? address.trim() : null, customer_id];

    if (user_role === 'admin' && tenant_id) {
      query += ' AND tenant_id = ?';
      params.push(tenant_id);
    }

    const [result] = await db.promise().query(query, params);
    if (result.affectedRows === 0) {
      const err = new Error('Customer not found or unauthorized');
      err.statusCode = 404;
      throw err;
    }
    return true;
  } catch (err) {
    throw err;
  }
};

module.exports = {
  findOrCreateCustomer,
  createCustomer,
  updateCustomer,
  updateCustomerStats,
  getAllCustomers,
  getTotalCustomersCount,
  getCustomerById,
  getCustomerHistory,
  getCustomerHistoryCount,
  updateCustomerAddress,
  searchCustomers,
};