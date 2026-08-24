const db = require("../../config/db.config");
const bcrypt = require("bcrypt");

// ── Super Admin Dashboard Stats ───────────────────────────────
const getDashboardStats = async () => {
  try {
    const [
      [overallStats],
      [revenueStats],
      [planBreakdown],
      [recentTenants],
      [signupTrend],
      [expiringTenants],
    ] = await Promise.all([
      // Overall counts
      db.promise().query(`
                SELECT
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status != 'deleted')          AS total_tenants,
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status = 'active')             AS active_tenants,
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status = 'suspended')          AS suspended_tenants,
                    (SELECT COUNT(*) FROM tbl_subscriptions s
                        INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                        WHERE s.status = 'active'
                          AND s.billing_cycle = 'trial'
                          AND t.status != 'deleted')                                       AS trial_tenants,
                    (SELECT COUNT(*) FROM tbl_subscriptions WHERE status = 'expired')      AS expired_tenants
            `),

      // Revenue
      db.promise().query(`
                SELECT
                    COALESCE(SUM(s.amount_paid), 0)                                                AS total_revenue,
                    COALESCE(SUM(CASE WHEN MONTH(s.created_at) = MONTH(NOW())
                        AND YEAR(s.created_at) = YEAR(NOW()) THEN s.amount_paid ELSE 0 END), 0)   AS this_month_revenue,
                    COUNT(CASE WHEN s.billing_cycle != 'trial' AND s.status = 'active' THEN 1 END) AS paying_tenants
                FROM tbl_subscriptions s
                INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                WHERE t.status != 'deleted'
            `),

      // Tenants per plan — count distinct active tenants only
      db.promise().query(`
                SELECT p.name AS plan_name, p.price_monthly,
                    COUNT(DISTINCT CASE
                        WHEN s.status = 'active'
                         AND s.billing_cycle != 'trial'
                         AND t.status NOT IN ('deleted', 'suspended')
                        THEN s.tenant_id
                    END) AS tenant_count
                FROM tbl_plans p
                LEFT JOIN tbl_subscriptions s ON s.plan_id = p.id
                LEFT JOIN tbl_tenants t ON t.id = s.tenant_id
                GROUP BY p.id ORDER BY p.price_monthly ASC
            `),

      // Recently joined
      db.promise().query(`
                SELECT t.id, t.business_name, t.slug, t.city, t.status, t.created_at,
                       u.name AS owner_name, u.email,
                       p.name AS plan_name,
                       s.billing_cycle, s.status AS sub_status, s.expires_at
                FROM tbl_tenants t
                LEFT JOIN tbl_users u         ON u.id = t.user_id
                LEFT JOIN tbl_subscriptions s ON s.tenant_id = t.id
                LEFT JOIN tbl_plans p         ON p.id = s.plan_id
                WHERE t.status != 'deleted'
                ORDER BY t.created_at DESC LIMIT 5
            `),

      // New signups last 12 months (for chart)
      db.promise().query(`
                SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
                FROM tbl_tenants
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                  AND status != 'deleted'
                GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                ORDER BY month ASC
            `),

      // Expiring within 7 days
      db.promise().query(`
                SELECT t.id, t.business_name, u.email,
                       p.name AS plan_name, s.expires_at,
                       DATEDIFF(s.expires_at, NOW()) AS days_left
                FROM tbl_subscriptions s
                INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                INNER JOIN tbl_users u   ON u.id = t.user_id
                LEFT JOIN tbl_plans p    ON p.id = s.plan_id
                WHERE s.status = 'active'
                  AND s.billing_cycle != 'trial'
                  AND t.status != 'deleted'
                  AND s.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
                ORDER BY s.expires_at ASC
                LIMIT 10
            `),
    ]);

    return {
      stats: overallStats[0],
      revenue: revenueStats[0],
      planBreakdown: planBreakdown,
      recentTenants: recentTenants,
      signupTrend: signupTrend,
      expiringTenants: expiringTenants,
    };
  } catch (err) {
    throw err;
  }
};

// ── Get All Tenants (with filters) ───────────────────────────
const getAllTenants = async ({
  status = "all",
  plan_id = "all",
  search = "",
  limit = 10,
  offset = 0,
}) => {
  try {
    let where = ["t.status != ?"];
    let params = ["deleted"];

    if (status !== "all") {
      where.push("t.status = ?");
      params.push(status);
    }
    if (plan_id !== "all") {
      where.push("s.plan_id = ?");
      params.push(plan_id);
    }
    if (search) {
      where.push("(t.business_name LIKE ? OR u.email LIKE ? OR u.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = where.join(" AND ");

    const [[{ total }]] = await db.promise().query(
      `
            SELECT COUNT(*) AS total
            FROM tbl_tenants t
            LEFT JOIN tbl_users u ON u.id = t.user_id
            LEFT JOIN (
                SELECT s1.*
                FROM tbl_subscriptions s1
                INNER JOIN (
                    SELECT tenant_id, MAX(id) AS max_id
                    FROM tbl_subscriptions
                    GROUP BY tenant_id
                ) s2 ON s1.tenant_id = s2.tenant_id AND s1.id = s2.max_id
            ) s ON s.tenant_id = t.id
            LEFT JOIN tbl_plans p ON p.id = s.plan_id
            WHERE ${whereClause}
        `,
      params,
    );

    const [tenants] = await db.promise().query(
      `
            SELECT t.id, t.business_name, t.slug, t.city, t.status, t.created_at,
                   u.name AS owner_name, u.email, u.phone,
                   p.name AS plan_name, p.price_monthly,
                   s.id AS sub_id, s.billing_cycle, s.status AS sub_status,
                   s.started_at, s.expires_at, s.amount_paid, s.payment_status,
                   (SELECT COUNT(*) FROM tbl_bookings WHERE tenant_id = t.id AND flag = 0) AS total_bookings,
                   (SELECT COUNT(*) FROM tbl_grounds  WHERE tenant_id = t.id AND flag = 0) AS total_grounds
            FROM tbl_tenants t
            LEFT JOIN tbl_users u ON u.id = t.user_id
            LEFT JOIN (
                SELECT s1.*
                FROM tbl_subscriptions s1
                INNER JOIN (
                    SELECT tenant_id, MAX(id) AS max_id
                    FROM tbl_subscriptions
                    GROUP BY tenant_id
                ) s2 ON s1.tenant_id = s2.tenant_id AND s1.id = s2.max_id
            ) s ON s.tenant_id = t.id
            LEFT JOIN tbl_plans p ON p.id = s.plan_id
            WHERE ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `,
      [...params, parseInt(limit), parseInt(offset)],
    );

    return { tenants, total };
  } catch (err) {
    throw err;
  }
};

// ── Get Single Tenant Detail ──────────────────────────────────
const getTenantDetail = async (tenant_id) => {
  try {
    const [[tenantRows], [subHistory], [recentBookings], [grounds]] =
      await Promise.all([
        db.promise().query(
          `
                SELECT t.*, u.name AS owner_name, u.email, u.phone, u.is_suspended,
                       u.created_at AS user_created, u.id AS user_id,
                       p.name AS plan_name, p.price_monthly, p.max_grounds,
                       s.id AS sub_id, s.billing_cycle, s.status AS sub_status,
                       s.started_at, s.expires_at, s.amount_paid, s.payment_ref,
                       s.payment_status, s.payment_date, s.payment_note,
                       (SELECT COUNT(*) FROM tbl_bookings WHERE tenant_id = t.id AND flag = 0) AS total_bookings,
                       (SELECT COUNT(*) FROM tbl_grounds  WHERE tenant_id = t.id AND flag = 0) AS total_grounds,
                       (SELECT COUNT(*) FROM tbl_customers WHERE tenant_id = t.id)             AS total_customers,
                       (SELECT COALESCE(SUM(advance_amount),0) FROM tbl_bookings
                        WHERE tenant_id = t.id AND booking_status = 'confirmed' AND flag = 0)  AS total_revenue
                FROM tbl_tenants t
                LEFT JOIN tbl_users u ON u.id = t.user_id
                LEFT JOIN (
                    SELECT s1.*
                    FROM tbl_subscriptions s1
                    INNER JOIN (
                        SELECT tenant_id, MAX(id) AS max_id
                        FROM tbl_subscriptions
                        GROUP BY tenant_id
                    ) s2 ON s1.tenant_id = s2.tenant_id AND s1.id = s2.max_id
                ) s ON s.tenant_id = t.id
                LEFT JOIN tbl_plans p ON p.id = s.plan_id
                WHERE t.id = ? LIMIT 1
            `,
          [tenant_id],
        ),

        // Subscription history
        db.promise().query(
          `
                SELECT s.*, p.name AS plan_name
                FROM tbl_subscriptions s
                LEFT JOIN tbl_plans p ON p.id = s.plan_id
                WHERE s.tenant_id = ?
                ORDER BY s.created_at DESC
            `,
          [tenant_id],
        ),

        // Recent bookings (last 10)
        db.promise().query(
          `
                SELECT b.booking_no, b.booking_status, b.slot_date AS booking_date,
                       b.advance_amount, b.created_at, g.name AS ground_name
                FROM tbl_bookings b
                LEFT JOIN tbl_grounds g ON g.id = b.ground_id
                WHERE b.tenant_id = ? AND b.flag = 0
                ORDER BY b.created_at DESC LIMIT 10
            `,
          [tenant_id],
        ),

        // Grounds
        db.promise().query(
          `
                SELECT id, name, sport_type, peak_price, off_peak_price, status
                FROM tbl_grounds WHERE tenant_id = ? AND flag = 0
                ORDER BY created_at ASC
            `,
          [tenant_id],
        ),
      ]);

    if (tenantRows.length === 0) {
      const err = new Error("Tenant not found");
      err.statusCode = 404;
      throw err;
    }

    return { tenant: tenantRows[0], subHistory, recentBookings, grounds };
  } catch (err) {
    throw err;
  }
};

// ── Create Tenant (by super admin — no auto-login) ───────────
const createTenant = async ({
  name,
  email,
  password,
  business_name,
  phone,
  city,
  plan_id,
}) => {
  const connection = await db.promise().getConnection();
  await connection.beginTransaction();
  try {
    const [existing] = await connection.query(
      "SELECT id FROM tbl_users WHERE email = ? LIMIT 1",
      [email],
    );
    if (existing.length > 0) {
      const err = new Error("Email already registered");
      err.statusCode = 409;
      throw err;
    }

    const [[plan]] = await connection.query(
      "SELECT * FROM tbl_plans WHERE id = ? AND is_active = 1 LIMIT 1",
      [plan_id],
    );
    if (!plan) {
      const err = new Error("Plan not found");
      err.statusCode = 400;
      throw err;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [userResult] = await connection.query(
      `INSERT INTO tbl_users (name, email, password, phone, role) VALUES (?, ?, ?, ?, 'admin')`,
      [name, email, hashedPassword, phone || null],
    );
    const user_id = userResult.insertId;

    let base = business_name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-");
    const [slugCheck] = await connection.query(
      "SELECT id FROM tbl_tenants WHERE slug = ? LIMIT 1",
      [base],
    );
    const slug =
      slugCheck.length === 0
        ? base
        : `${base}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [tenantResult] = await connection.query(
      `INSERT INTO tbl_tenants (user_id, business_name, slug, phone, city, status) VALUES (?, ?, ?, ?, ?, 'active')`,
      [user_id, business_name, slug, phone || null, city || null],
    );
    const tenant_id = tenantResult.insertId;

    const trial_days = plan.trial_days || 0;
    const started_at = new Date();
    const expires_at = new Date();
    if (trial_days > 0) {
      expires_at.setDate(expires_at.getDate() + trial_days);
    } else {
      expires_at.setMonth(expires_at.getMonth() + 1);
    }
    const fmt = (d) => d.toISOString().split("T")[0];

    await connection.query(
      `INSERT INTO tbl_subscriptions (tenant_id, plan_id, billing_cycle, status, started_at, expires_at, amount_paid)
             VALUES (?, ?, 'monthly', 'active', ?, ?, ?)`,
      [
        tenant_id,
        plan_id,
        fmt(started_at),
        fmt(expires_at),
        plan.price_monthly,
      ],
    );

    await connection.commit();
    return { tenant_id, user_id, slug };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// ── Reset Tenant Password ─────────────────────────────────────
const resetTenantPassword = async (tenant_id, new_password) => {
  try {
    const [[tenant]] = await db
      .promise()
      .query("SELECT user_id FROM tbl_tenants WHERE id = ? LIMIT 1", [
        tenant_id,
      ]);
    if (!tenant) return false;

    const hash = await bcrypt.hash(new_password, 12);
    await Promise.all([
      db
        .promise()
        .query("UPDATE tbl_users SET password = ? WHERE id = ?", [
          hash,
          tenant.user_id,
        ]),
      db
        .promise()
        .query("UPDATE tbl_sessions SET is_active = 0 WHERE user_id = ?", [
          tenant.user_id,
        ]),
    ]);
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Activate Tenant ───────────────────────────────────────────
const activateTenant = async (tenant_id) => {
  try {
    const [[tenant]] = await db
      .promise()
      .query("SELECT user_id FROM tbl_tenants WHERE id = ? LIMIT 1", [
        tenant_id,
      ]);
    if (!tenant) return false;

    await Promise.all([
      db
        .promise()
        .query(
          `UPDATE tbl_tenants SET status = 'active', suspended_reason = NULL WHERE id = ?`,
          [tenant_id],
        ),
      db
        .promise()
        .query(
          `UPDATE tbl_users SET is_suspended = 0, suspended_at = NULL, suspended_by = NULL WHERE id = ?`,
          [tenant.user_id],
        ),
    ]);
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Approve Pending Tenant (SA approval flow) ─────────────────
const approveTenant = async (tenant_id) => {
  const connection = await db.promise().getConnection();
  await connection.beginTransaction();
  try {
    const [[tenant]] = await connection.query(
      "SELECT user_id FROM tbl_tenants WHERE id = ? AND status = 'pending_approval' LIMIT 1",
      [tenant_id]
    );
    if (!tenant) {
      const err = new Error('Tenant not found or not pending approval');
      err.statusCode = 404;
      throw err;
    }

    // Activate tenant + user + subscription
    await Promise.all([
      connection.query(
        `UPDATE tbl_tenants SET status = 'active', suspended_reason = NULL WHERE id = ?`,
        [tenant_id]
      ),
      connection.query(
        `UPDATE tbl_users SET is_suspended = 0 WHERE id = ?`,
        [tenant.user_id]
      ),
      connection.query(
        `UPDATE tbl_subscriptions SET status = 'active' WHERE tenant_id = ? AND status = 'inactive'`,
        [tenant_id]
      )
    ]);

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// ── Reject Pending Tenant (SA approval flow) ──────────────────
const rejectTenant = async (tenant_id, { reason = null } = {}) => {
  const connection = await db.promise().getConnection();
  await connection.beginTransaction();
  try {
    const [[tenant]] = await connection.query(
      "SELECT user_id FROM tbl_tenants WHERE id = ? AND status = 'pending_approval' LIMIT 1",
      [tenant_id]
    );
    if (!tenant) {
      const err = new Error('Tenant not found or not pending approval');
      err.statusCode = 404;
      throw err;
    }

    // Soft-delete user and tenant — reject means no account created
    await Promise.all([
      connection.query(
        `UPDATE tbl_tenants SET status = 'deleted' WHERE id = ?`,
        [tenant_id]
      ),
      connection.query(
        `UPDATE tbl_users SET flag = 1, email = CONCAT('rejected_', id, '_', email) WHERE id = ? AND email NOT LIKE 'rejected_%'`,
        [tenant.user_id]
      ),
      connection.query(
        `UPDATE tbl_subscriptions SET status = 'cancelled' WHERE tenant_id = ?`,
        [tenant_id]
      )
    ]);

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// ── Suspend Tenant ────────────────────────────────────────────
const suspendTenant = async (
  tenant_id,
  { reason = null, admin_user_id = null } = {},
) => {
  try {
    const [[tenant]] = await db
      .promise()
      .query("SELECT user_id FROM tbl_tenants WHERE id = ? LIMIT 1", [
        tenant_id,
      ]);
    if (!tenant) return false;

    await Promise.all([
      db
        .promise()
        .query(
          `UPDATE tbl_tenants SET status = 'suspended', suspended_reason = ? WHERE id = ?`,
          [reason, tenant_id],
        ),
      db
        .promise()
        .query(
          `UPDATE tbl_users SET is_suspended = 1, suspended_at = NOW(), suspended_by = ? WHERE id = ?`,
          [admin_user_id, tenant.user_id],
        ),
      db
        .promise()
        .query("UPDATE tbl_sessions SET is_active = 0 WHERE user_id = ?", [
          tenant.user_id,
        ]),
    ]);
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Delete Tenant (soft delete) ───────────────────────────────
const deleteTenant = async (tenant_id) => {
  try {
    const [[tenant]] = await db
      .promise()
      .query("SELECT user_id FROM tbl_tenants WHERE id = ? LIMIT 1", [
        tenant_id,
      ]);
    if (!tenant) return false;

    await Promise.all([
      db
        .promise()
        .query(`UPDATE tbl_tenants SET status = 'deleted' WHERE id = ?`, [
          tenant_id,
        ]),
      db
        .promise()
        .query(
          `UPDATE tbl_users SET flag = 1, email = CONCAT('deleted_', id, '_', email) WHERE id = ? AND email NOT LIKE 'deleted_%'`,
          [tenant.user_id],
        ),
      db
        .promise()
        .query("UPDATE tbl_sessions SET is_active = 0 WHERE user_id = ?", [
          tenant.user_id,
        ]),
    ]);
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Extend Tenant Subscription ────────────────────────────────
const extendSubscription = async ({ tenant_id, extra_days }) => {
  try {
    const [[latest]] = await db
      .promise()
      .query(
        "SELECT id FROM tbl_subscriptions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1",
        [tenant_id],
      );
    if (!latest) return false;

    await db.promise().query(
      `
            UPDATE tbl_subscriptions
            SET expires_at = DATE_ADD(CASE WHEN expires_at > NOW() THEN expires_at ELSE NOW() END, INTERVAL ? DAY),
                status = 'active'
            WHERE id = ?
        `,
      [extra_days, latest.id],
    );
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Change Tenant Plan ────────────────────────────────────────
const changeTenantPlan = async ({
  tenant_id,
  plan_id,
  billing_cycle = "monthly",
  extend_days = null,
}) => {
  try {
    const [[latest]] = await db
      .promise()
      .query(
        "SELECT id, billing_cycle, expires_at FROM tbl_subscriptions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1",
        [tenant_id],
      );
    if (!latest) return false;

    const newCycle =
      latest.billing_cycle === "trial" ? billing_cycle : latest.billing_cycle;

    let expiresUpdate = "";
    let params = [plan_id, newCycle];
    if (extend_days) {
      expiresUpdate =
        ", expires_at = DATE_ADD(GREATEST(expires_at, NOW()), INTERVAL ? DAY)";
      params.push(parseInt(extend_days));
    }

    params.push(latest.id);
    await db
      .promise()
      .query(
        `UPDATE tbl_subscriptions SET plan_id = ?, billing_cycle = ?, status = 'active'${expiresUpdate} WHERE id = ?`,
        params,
      );
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Get all plans (for dropdowns) ────────────────────────────
const getPlans = async () => {
  try {
    const [plans] = await db
      .promise()
      .query("SELECT * FROM tbl_plans ORDER BY price_monthly ASC");
    return plans;
  } catch (err) {
    throw err;
  }
};

// ── Plans CRUD ────────────────────────────────────────────────

const getPlanById = async (plan_id) => {
  try {
    const [[row]] = await db
      .promise()
      .query("SELECT * FROM tbl_plans WHERE id = ? LIMIT 1", [plan_id]);
    return row || null;
  } catch (err) {
    throw err;
  }
};

const createPlan = async ({
  name,
  price_monthly,
  price_yearly,
  max_grounds,
  max_bookings,
  history_days,
  trial_days,
  is_active,
}) => {
  try {
    const [result] = await db.promise().query(
      `INSERT INTO tbl_plans (name, price_monthly, price_yearly, max_grounds, max_bookings, history_days, trial_days, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        parseFloat(price_monthly) || 0,
        parseFloat(price_yearly) || 0,
        parseInt(max_grounds) || 1,
        parseInt(max_bookings) || 0,
        parseInt(history_days) || 30,
        parseInt(trial_days) || 0,
        is_active ? 1 : 0,
      ],
    );
    return result.insertId;
  } catch (err) {
    throw err;
  }
};

const updatePlan = async (
  plan_id,
  {
    name,
    price_monthly,
    price_yearly,
    max_grounds,
    max_bookings,
    history_days,
    trial_days,
    is_active,
  },
) => {
  try {
    await db.promise().query(
      `UPDATE tbl_plans SET name=?, price_monthly=?, price_yearly=?, max_grounds=?,
             max_bookings=?, history_days=?, trial_days=?, is_active=? WHERE id=?`,
      [
        name,
        parseFloat(price_monthly) || 0,
        parseFloat(price_yearly) || 0,
        parseInt(max_grounds) || 1,
        parseInt(max_bookings) || 0,
        parseInt(history_days) || 30,
        parseInt(trial_days) || 0,
        is_active ? 1 : 0,
        plan_id,
      ],
    );
    return true;
  } catch (err) {
    throw err;
  }
};

const deletePlan = async (plan_id) => {
  try {
    const [[usage]] = await db
      .promise()
      .query(
        `SELECT COUNT(*) AS cnt FROM tbl_subscriptions WHERE plan_id = ? AND status = 'active'`,
        [plan_id],
      );
    if (usage.cnt > 0) {
      const err = new Error(
        `Cannot delete — ${usage.cnt} active subscription(s) on this plan.`,
      );
      err.statusCode = 409;
      throw err;
    }
    await db.promise().query("DELETE FROM tbl_plans WHERE id = ?", [plan_id]);
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Plans with stats — count distinct active tenants only ─────
const getPlansWithStats = async () => {
  try {
    const [plans] = await db.promise().query(`
            SELECT p.*,
                   COUNT(DISTINCT CASE
                       WHEN s.status = 'active'
                        AND s.billing_cycle != 'trial'
                        AND t.status NOT IN ('deleted','suspended')
                       THEN s.tenant_id END)   AS active_subscribers,
                   COUNT(DISTINCT CASE
                       WHEN s.status = 'active'
                        AND s.billing_cycle = 'trial'
                       THEN s.tenant_id END)   AS trial_subscribers,
                   COUNT(DISTINCT s.tenant_id) AS total_subscribers
            FROM tbl_plans p
            LEFT JOIN tbl_subscriptions s ON s.plan_id = p.id
            LEFT JOIN tbl_tenants t ON t.id = s.tenant_id
            GROUP BY p.id ORDER BY p.price_monthly ASC
        `);
    return plans;
  } catch (err) {
    throw err;
  }
};

// ── Billing: Mark payment paid/unpaid ────────────────────────
const markPayment = async (
  sub_id,
  { payment_status, payment_date, payment_note, payment_mode, admin_user_id },
) => {
  try {
    await db.promise().query(
      `UPDATE tbl_subscriptions
             SET payment_status = ?, payment_date = ?, payment_note = ?,
                 payment_mode = ?, marked_paid_by = ?, marked_paid_at = NOW()
             WHERE id = ?`,
      [
        payment_status,
        payment_date || null,
        payment_note || null,
        payment_mode || null,
        admin_user_id,
        sub_id,
      ],
    );
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Billing: Get all payments (all tenants) ───────────────────
const getAllPayments = async ({
  status = "all",
  search = "",
  limit = 10,
  offset = 0,
}) => {
  try {
    let where = ["s.billing_cycle != 'trial'"];
    let params = [];

    if (status !== "all") {
      where.push("s.payment_status = ?");
      params.push(status);
    }
    if (search) {
      where.push("(t.business_name LIKE ? OR u.email LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = where.join(" AND ");

    const [[{ total }]] = await db.promise().query(
      `
            SELECT COUNT(*) AS total
            FROM tbl_subscriptions s
            INNER JOIN tbl_tenants t ON t.id = s.tenant_id
            INNER JOIN tbl_users u   ON u.id = t.user_id
            LEFT JOIN tbl_plans p    ON p.id = s.plan_id
            WHERE ${whereClause}
        `,
      params,
    );

    const [rows] = await db.promise().query(
      `
            SELECT s.id AS sub_id, s.billing_cycle, s.status AS sub_status,
                   s.amount_paid, s.started_at, s.expires_at,
                   s.payment_status, s.payment_date, s.payment_note, s.payment_mode, s.marked_paid_at,
                   t.id AS tenant_id, t.business_name,
                   u.name AS owner_name, u.email,
                   p.name AS plan_name
            FROM tbl_subscriptions s
            INNER JOIN tbl_tenants t ON t.id = s.tenant_id
            INNER JOIN tbl_users u   ON u.id = t.user_id
            LEFT JOIN tbl_plans p    ON p.id = s.plan_id
            WHERE ${whereClause}
            ORDER BY s.started_at DESC
            LIMIT ? OFFSET ?
        `,
      [...params, parseInt(limit), parseInt(offset)],
    );

    return { payments: rows, total };
  } catch (err) {
    throw err;
  }
};

// ── App Settings ──────────────────────────────────────────────
const getAppSettings = async () => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM tbl_app_settings ORDER BY setting_key ASC");
    const map = {};
    rows.forEach((r) => {
      map[r.setting_key] = r;
    });
    return { rows, map };
  } catch (err) {
    throw err;
  }
};

const updateAppSetting = async (key, value, admin_user_id) => {
  try {
    await db.promise().query(
      `INSERT INTO tbl_app_settings (setting_key, setting_value, updated_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [key, value, admin_user_id],
    );
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Announcements ─────────────────────────────────────────────
const getAnnouncements = async () => {
  try {
    const [rows] = await db
      .promise()
      .query(`SELECT * FROM tbl_announcements ORDER BY created_at DESC`);
    return rows;
  } catch (err) {
    throw err;
  }
};

const createAnnouncement = async ({
  title,
  message,
  type,
  show_from,
  show_until,
  is_active,
  created_by,
}) => {
  try {
    const [result] = await db.promise().query(
      `INSERT INTO tbl_announcements (title, message, type, show_from, show_until, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        message,
        type || "info",
        show_from,
        show_until || null,
        is_active ? 1 : 0,
        created_by,
      ],
    );
    return result.insertId;
  } catch (err) {
    throw err;
  }
};

const deleteAnnouncement = async (id) => {
  try {
    await db
      .promise()
      .query("DELETE FROM tbl_announcements WHERE id = ?", [id]);
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Get customers for a specific tenant ──────────────────────
const getTenantCustomers = async (tenant_id) => {
  try {
    const [customers] = await db.promise().query(
      `SELECT customer_id, name, phone, email, total_bookings, created_at
             FROM tbl_customers
             WHERE tenant_id = ? AND flag = 0
             ORDER BY created_at DESC`,
      [tenant_id],
    );
    return customers;
  } catch (err) {
    throw err;
  }
};

// ── Super Admin Profile ───────────────────────────────────────
const getSuperAdminProfile = async (user_id) => {
  try {
    const [[user]] = await db.promise().query(
      `
            SELECT id, name, email, role, created_at
            FROM tbl_users
            WHERE id = ? AND role = 'super_admin' LIMIT 1
        `,
      [user_id],
    );

    if (!user)
      throw Object.assign(new Error("Profile not found"), { statusCode: 404 });

    const [[lastSession]] = await db.promise().query(
      `
            SELECT ip_address, browser, os, device_name, created_at AS logged_in_at
            FROM tbl_sessions
            WHERE user_id = ? AND is_active = 1
            ORDER BY created_at DESC LIMIT 1
        `,
      [user_id],
    );

    return { user, lastSession: lastSession || null };
  } catch (err) {
    throw err;
  }
};

// ── Change Super Admin Password ───────────────────────────────
const changeSuperAdminPassword = async (
  user_id,
  current_password,
  new_password,
) => {
  try {
    const [[user]] = await db
      .promise()
      .query("SELECT id, password FROM tbl_users WHERE id = ? LIMIT 1", [
        user_id,
      ]);
    if (!user)
      throw Object.assign(new Error("User not found"), { statusCode: 404 });

    const match = await bcrypt.compare(current_password, user.password);
    if (!match)
      throw Object.assign(new Error("Current password is incorrect"), {
        statusCode: 400,
      });

    const hash = await bcrypt.hash(new_password, 12);
    await db
      .promise()
      .query("UPDATE tbl_users SET password = ? WHERE id = ?", [hash, user_id]);
    await db
      .promise()
      .query("UPDATE tbl_sessions SET is_active = 0 WHERE user_id = ?", [
        user_id,
      ]);

    return true;
  } catch (err) {
    throw err;
  }
};

// ── Get All Active Sessions ───────────────────────────────────
const getSuperAdminSessions = async (user_id) => {
  try {
    const [sessions] = await db.promise().query(
      `
            SELECT session_id, device_name, device_type, browser, os,
                   ip_address, created_at AS logged_in_at, last_used_at,
                   access_expires_at, refresh_expires_at
            FROM tbl_sessions
            WHERE user_id = ? AND is_active = 1
              AND refresh_expires_at > NOW()
            ORDER BY created_at DESC
        `,
      [user_id],
    );
    return sessions;
  } catch (err) {
    throw err;
  }
};

// ── Terminate All Other Sessions ──────────────────────────────
const terminateOtherSessions = async (user_id, current_session_id) => {
  try {
    const [result] = await db.promise().query(
      `UPDATE tbl_sessions SET is_active = 0
             WHERE user_id = ? AND session_id != ?`,
      [user_id, current_session_id],
    );
    return result.affectedRows;
  } catch (err) {
    throw err;
  }
};

// ── logActivity stub ──────────────────────────────────────────
const logActivity = async () => {
  /* no-op */
};

// ── Reports Page Data ─────────────────────────────────────────
const getReportData = async ({ from_date, to_date } = {}) => {
  try {
    const [
      [platformOverview],
      [revenueByMonth],
      [revenueByPlan],
      [tenantPerformance],
      [bookingActivity],
      [topTenants],
      [churnData],
      [upcomingRenewals],
    ] = await Promise.all([
      // Platform overview stats
      db.promise().query(`
                SELECT
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status != 'deleted')          AS total_tenants,
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status = 'active')            AS active_tenants,
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status = 'suspended')         AS suspended_tenants,
                    (SELECT COUNT(*) FROM tbl_subscriptions s
                     INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                     WHERE s.status = 'active'
                       AND s.billing_cycle = 'trial'
                       AND t.status != 'deleted')                                         AS trial_tenants,
                    (SELECT COUNT(*) FROM tbl_subscriptions s
                     INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                     WHERE s.status = 'expired'
                       AND t.status != 'deleted')                                         AS expired_tenants,
                    (SELECT COALESCE(SUM(s.amount_paid),0) FROM tbl_subscriptions s
                     INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                     WHERE s.payment_status = 'paid'
                       AND t.status != 'deleted')                                         AS total_revenue,
                    (SELECT COALESCE(SUM(s.amount_paid),0) FROM tbl_subscriptions s
                     INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                     WHERE s.payment_status = 'paid'
                       AND t.status != 'deleted'
                       AND MONTH(s.created_at) = MONTH(NOW())
                       AND YEAR(s.created_at) = YEAR(NOW()))                              AS this_month_revenue,
                    (SELECT COALESCE(SUM(s.amount_paid),0) FROM tbl_subscriptions s
                     INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                     WHERE s.payment_status = 'paid'
                       AND t.status != 'deleted'
                       AND MONTH(s.created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))
                       AND YEAR(s.created_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH))) AS last_month_revenue,
                    (SELECT COUNT(*) FROM tbl_tenants
                     WHERE status != 'deleted'
                       AND MONTH(created_at) = MONTH(NOW())
                       AND YEAR(created_at) = YEAR(NOW()))                                AS signups_this_month,
                    (SELECT COUNT(*) FROM tbl_tenants
                     WHERE status != 'deleted'
                       AND MONTH(created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))
                       AND YEAR(created_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)))   AS signups_last_month
            `),

      // Revenue by month (last 12 months)
      db.promise().query(`
                SELECT
                    DATE_FORMAT(created_at, '%Y-%m') AS month,
                    DATE_FORMAT(created_at, '%b %Y') AS label,
                    COALESCE(SUM(amount_paid), 0)    AS revenue,
                    COUNT(*)                          AS subscriptions
                FROM tbl_subscriptions
                WHERE payment_status = 'paid'
                  AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                ORDER BY month ASC
            `),

      // Revenue by plan
      db.promise().query(`
                SELECT
                    p.name AS plan_name,
                    p.price_monthly,
                    COUNT(s.id) AS sub_count,
                    COALESCE(SUM(s.amount_paid), 0) AS total_revenue
                FROM tbl_plans p
                LEFT JOIN tbl_subscriptions s ON s.plan_id = p.id AND s.payment_status = 'paid'
                GROUP BY p.id
                ORDER BY total_revenue DESC
            `),

      // Tenant performance table
      db.promise().query(`
                SELECT
                    t.id, t.business_name, t.city, t.created_at,
                    u.name AS owner_name,
                    p.name AS plan_name,
                    s.status AS sub_status, s.billing_cycle, s.expires_at, s.amount_paid,
                    (SELECT COUNT(*) FROM tbl_grounds g
                     WHERE g.tenant_id = t.id AND g.flag = 0)                         AS grounds_count,
                    (SELECT COUNT(*) FROM tbl_bookings b
                     WHERE b.tenant_id = t.id AND b.flag = 0)                         AS total_bookings,
                    (SELECT COUNT(*) FROM tbl_bookings b
                     WHERE b.tenant_id = t.id AND b.flag = 0
                       AND DATE(b.created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY))    AS bookings_30d,
                    (SELECT COUNT(*) FROM tbl_customers c
                     WHERE c.tenant_id = t.id)                                         AS total_customers
                FROM tbl_tenants t
                LEFT JOIN tbl_users u ON u.id = t.user_id
                LEFT JOIN tbl_subscriptions s ON s.tenant_id = t.id
                LEFT JOIN tbl_plans p ON p.id = s.plan_id
                WHERE t.status != 'deleted'
                ORDER BY total_bookings DESC
            `),

      // Platform-wide booking activity
      db.promise().query(`
                SELECT
                    COUNT(*)                                                                              AS total_bookings,
                    SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END)                        AS confirmed,
                    SUM(CASE WHEN booking_status = 'pending'   THEN 1 ELSE 0 END)                        AS pending,
                    SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END)                        AS cancelled,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END)                        AS today,
                    SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END)  AS last_7d,
                    SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS last_30d
                FROM tbl_bookings WHERE flag = 0
            `),

      // Top tenants by bookings last 30 days
      db.promise().query(`
                SELECT t.business_name, t.city,
                       COUNT(b.id) AS bookings,
                       p.name AS plan_name
                FROM tbl_bookings b
                INNER JOIN tbl_tenants t ON t.id = b.tenant_id
                LEFT JOIN tbl_subscriptions s ON s.tenant_id = t.id
                LEFT JOIN tbl_plans p ON p.id = s.plan_id
                WHERE b.flag = 0
                  AND t.status != 'deleted'
                  AND DATE(b.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY t.id
                ORDER BY bookings DESC
                LIMIT 8
            `),

      // Churn: expired subscriptions last 6 months
      db.promise().query(`
                SELECT
                    DATE_FORMAT(expires_at, '%Y-%m') AS month,
                    DATE_FORMAT(expires_at, '%b %Y') AS label,
                    COUNT(*) AS expired_count
                FROM tbl_subscriptions
                WHERE status = 'expired'
                  AND expires_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(expires_at, '%Y-%m')
                ORDER BY month ASC
            `),

      // Upcoming renewals next 30 days
      db.promise().query(`
                SELECT t.business_name, t.city, u.email,
                       p.name AS plan_name, s.expires_at,
                       DATEDIFF(s.expires_at, NOW()) AS days_left,
                       s.amount_paid
                FROM tbl_subscriptions s
                INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                INNER JOIN tbl_users u   ON u.id = t.user_id
                LEFT JOIN tbl_plans p    ON p.id = s.plan_id
                WHERE s.status = 'active'
                  AND s.billing_cycle != 'trial'
                  AND t.status != 'deleted'
                  AND s.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
                ORDER BY s.expires_at ASC
                LIMIT 10
            `),
    ]);

    return {
      overview: platformOverview[0],
      revenueByMonth,
      revenueByPlan,
      tenantPerformance,
      bookingActivity: bookingActivity[0],
      topTenants,
      churnData,
      upcomingRenewals,
    };
  } catch (err) {
    throw err;
  }
};

// ── Exports ───────────────────────────────────────────────────
module.exports = {
  getDashboardStats,
  getReportData,
  getAllTenants,
  getTenantDetail,
  createTenant,
  resetTenantPassword,
  activateTenant,
  approveTenant,
  rejectTenant,
  suspendTenant,
  deleteTenant,
  extendSubscription,
  changeTenantPlan,
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getPlansWithStats,
  markPayment,
  getAllPayments,
  getAppSettings,
  updateAppSetting,
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  getTenantCustomers,
  logActivity,
  getSuperAdminProfile,
  changeSuperAdminPassword,
  getSuperAdminSessions,
  terminateOtherSessions,
};