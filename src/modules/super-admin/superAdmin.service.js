const db = require('../../config/db.config');

// ── Super Admin Dashboard Stats ───────────────────────────────
const getDashboardStats = async () => {
    try {
        const [[overallStats], [revenueStats], [planBreakdown], [recentTenants]] = await Promise.all([

            // ── Overall counts ────────────────────────────
            db.promise().query(`
                SELECT
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status != 'deleted')          AS total_tenants,
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status = 'active')             AS active_tenants,
                    (SELECT COUNT(*) FROM tbl_tenants WHERE status = 'suspended')          AS suspended_tenants,
                    (SELECT COUNT(*) FROM tbl_subscriptions WHERE status = 'active'
                        AND billing_cycle = 'trial')                                       AS trial_tenants,
                    (SELECT COUNT(*) FROM tbl_subscriptions WHERE status = 'expired')      AS expired_tenants
            `),

            // ── Revenue collected (paid subscriptions only) ─
            db.promise().query(`
                SELECT
                    COALESCE(SUM(amount_paid), 0)                                          AS total_revenue,
                    COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(NOW())
                        AND YEAR(created_at) = YEAR(NOW()) THEN amount_paid ELSE 0 END), 0) AS this_month_revenue,
                    COUNT(CASE WHEN billing_cycle != 'trial' AND status = 'active' THEN 1 END) AS paying_tenants
                FROM tbl_subscriptions
            `),

            // ── Tenants per plan ──────────────────────────
            db.promise().query(`
                SELECT p.name AS plan_name, p.price_monthly,
                       COUNT(s.id) AS tenant_count
                FROM tbl_plans p
                LEFT JOIN tbl_subscriptions s ON s.plan_id = p.id AND s.status = 'active'
                GROUP BY p.id
                ORDER BY p.price_monthly ASC
            `),

            // ── Recently joined tenants ───────────────────
            db.promise().query(`
                SELECT t.id, t.business_name, t.slug, t.city, t.status, t.created_at,
                       u.name AS owner_name, u.email,
                       p.name AS plan_name,
                       s.billing_cycle, s.status AS sub_status, s.expires_at
                FROM tbl_tenants t
                LEFT JOIN tbl_users u        ON u.id = t.user_id
                LEFT JOIN tbl_subscriptions s ON s.tenant_id = t.id
                LEFT JOIN tbl_plans p         ON p.id = s.plan_id
                ORDER BY t.created_at DESC
                LIMIT 5
            `)
        ]);

        return {
            stats:         overallStats[0],
            revenue:       revenueStats[0],
            planBreakdown: planBreakdown,
            recentTenants: recentTenants
        };
    } catch (err) {
        throw err;
    }
};

// ── Get All Tenants (with filters) ───────────────────────────
const getAllTenants = async ({ status = 'all', plan_id = 'all', search = '' }) => {
    try {
        let where  = ['t.status != ?'];
        let params = ['deleted'];

        if (status !== 'all')  { where.push('t.status = ?');     params.push(status); }
        if (plan_id !== 'all') { where.push('s.plan_id = ?');    params.push(plan_id); }
        if (search)            {
            where.push('(t.business_name LIKE ? OR u.email LIKE ? OR u.name LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const [tenants] = await db.promise().query(`
            SELECT t.id, t.business_name, t.slug, t.city, t.status, t.created_at,
                   u.name AS owner_name, u.email, u.phone,
                   p.name AS plan_name, p.price_monthly,
                   s.id AS sub_id, s.billing_cycle, s.status AS sub_status,
                   s.started_at, s.expires_at, s.amount_paid,
                   (SELECT COUNT(*) FROM tbl_bookings WHERE tenant_id = t.id AND flag = 0) AS total_bookings,
                   (SELECT COUNT(*) FROM tbl_grounds  WHERE tenant_id = t.id AND flag = 0) AS total_grounds
            FROM tbl_tenants t
            LEFT JOIN tbl_users u         ON u.id = t.user_id
            LEFT JOIN tbl_subscriptions s ON s.tenant_id = t.id
            LEFT JOIN tbl_plans p         ON p.id = s.plan_id
            WHERE ${where.join(' AND ')}
            ORDER BY t.created_at DESC
        `, params);

        return tenants;
    } catch (err) {
        throw err;
    }
};

// ── Get Single Tenant Detail ──────────────────────────────────
const getTenantDetail = async (tenant_id) => {
    try {
        const [[tenantRows], [subHistory]] = await Promise.all([

            db.promise().query(`
                SELECT t.*, u.name AS owner_name, u.email, u.phone, u.created_at AS user_created,
                       p.name AS plan_name, p.price_monthly, p.max_grounds,
                       s.id AS sub_id, s.billing_cycle, s.status AS sub_status,
                       s.started_at, s.expires_at, s.amount_paid, s.payment_ref,
                       (SELECT COUNT(*) FROM tbl_bookings WHERE tenant_id = t.id AND flag = 0) AS total_bookings,
                       (SELECT COUNT(*) FROM tbl_grounds  WHERE tenant_id = t.id AND flag = 0) AS total_grounds,
                       (SELECT COUNT(*) FROM tbl_customers WHERE tenant_id = t.id)             AS total_customers,
                       (SELECT COALESCE(SUM(advance_amount),0) FROM tbl_bookings
                        WHERE tenant_id = t.id AND booking_status = 'confirmed' AND flag = 0)  AS total_revenue
                FROM tbl_tenants t
                LEFT JOIN tbl_users u         ON u.id = t.user_id
                LEFT JOIN tbl_subscriptions s ON s.tenant_id = t.id
                LEFT JOIN tbl_plans p         ON p.id = s.plan_id
                WHERE t.id = ?
                LIMIT 1
            `, [tenant_id]),

            // Subscription history
            db.promise().query(`
                SELECT s.*, p.name AS plan_name
                FROM tbl_subscriptions s
                LEFT JOIN tbl_plans p ON p.id = s.plan_id
                WHERE s.tenant_id = ?
                ORDER BY s.created_at DESC
            `, [tenant_id])
        ]);

        if (tenantRows.length === 0) {
            const err = new Error('Tenant not found');
            err.statusCode = 404;
            throw err;
        }

        return { tenant: tenantRows[0], subHistory };
    } catch (err) {
        throw err;
    }
};

// ── Activate Tenant ───────────────────────────────────────────
const activateTenant = async (tenant_id) => {
    try {
        await db.promise().query(
            `UPDATE tbl_tenants SET status = 'active' WHERE id = ?`,
            [tenant_id]
        );
        return true;
    } catch (err) { throw err; }
};

// ── Suspend Tenant ────────────────────────────────────────────
const suspendTenant = async (tenant_id) => {
    try {
        await db.promise().query(
            `UPDATE tbl_tenants SET status = 'suspended' WHERE id = ?`,
            [tenant_id]
        );
        return true;
    } catch (err) { throw err; }
};

// ── Delete Tenant (soft delete) ───────────────────────────────
const deleteTenant = async (tenant_id) => {
    try {
        await db.promise().query(
            `UPDATE tbl_tenants SET status = 'deleted' WHERE id = ?`,
            [tenant_id]
        );
        return true;
    } catch (err) { throw err; }
};

// ── Extend Tenant Subscription manually ──────────────────────
const extendSubscription = async ({ tenant_id, extra_days }) => {
    try {
        // Extend from current expires_at or from today if already expired
        await db.promise().query(`
            UPDATE tbl_subscriptions
            SET expires_at = DATE_ADD(
                CASE WHEN expires_at > NOW() THEN expires_at ELSE NOW() END,
                INTERVAL ? DAY
            ),
            status = 'active'
            WHERE tenant_id = ?
            ORDER BY id DESC
            LIMIT 1
        `, [extra_days, tenant_id]);
        return true;
    } catch (err) { throw err; }
};

// ── Change Tenant Plan ────────────────────────────────────────
const changeTenantPlan = async ({ tenant_id, plan_id }) => {
    try {
        await db.promise().query(`
            UPDATE tbl_subscriptions
            SET plan_id = ?
            WHERE tenant_id = ?
            ORDER BY id DESC
            LIMIT 1
        `, [plan_id, tenant_id]);
        return true;
    } catch (err) { throw err; }
};

// ── Get all plans (for dropdowns) ────────────────────────────
const getPlans = async () => {
    try {
        const [plans] = await db.promise().query(
            'SELECT * FROM tbl_plans ORDER BY price_monthly ASC'
        );
        return plans;
    } catch (err) { throw err; }
};

module.exports = {
    getDashboardStats,
    getAllTenants,
    getTenantDetail,
    activateTenant,
    suspendTenant,
    deleteTenant,
    extendSubscription,
    changeTenantPlan,
    getPlans
};