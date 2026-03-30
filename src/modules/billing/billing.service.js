const db = require('../../config/db.config');

// ── Get all active plans ──────────────────────────────────────
const getPlans = async () => {
    const [plans] = await db.promise().query(
        'SELECT * FROM tbl_plans WHERE is_active = 1 ORDER BY price_monthly ASC'
    );
    return plans;
};

// ── Get tenant's current subscription ────────────────────────
const getCurrentSubscription = async (tenant_id) => {
    const [rows] = await db.promise().query(`
        SELECT s.*, p.name AS plan_name, p.price_monthly, p.price_yearly, p.max_grounds
        FROM tbl_subscriptions s
        LEFT JOIN tbl_plans p ON p.id = s.plan_id
        WHERE s.tenant_id = ?
        ORDER BY s.id DESC
        LIMIT 1
    `, [tenant_id]);
    return rows[0] || null;
};

// ── Get subscription history ──────────────────────────────────
const getSubHistory = async (tenant_id) => {
    const [rows] = await db.promise().query(`
        SELECT s.*, p.name AS plan_name
        FROM tbl_subscriptions s
        LEFT JOIN tbl_plans p ON p.id = s.plan_id
        WHERE s.tenant_id = ?
        ORDER BY s.id DESC
    `, [tenant_id]);
    return rows;
};

// ── Upgrade / Renew subscription (manual / demo payment) ─────
// In a real app this would be triggered after Razorpay/Stripe webhook
const activateSubscription = async ({ tenant_id, plan_id, billing_cycle, payment_ref = null }) => {
    // Get plan details
    const [[plan]] = await db.promise().query(
        'SELECT * FROM tbl_plans WHERE id = ? AND is_active = 1 LIMIT 1',
        [plan_id]
    );
    if (!plan) {
        const err = new Error('Plan not found');
        err.statusCode = 404;
        throw err;
    }

    const amount_paid = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

    // Calculate expiry
    const started_at  = new Date();
    const expires_at  = new Date(started_at);
    if (billing_cycle === 'yearly') {
        expires_at.setFullYear(expires_at.getFullYear() + 1);
    } else {
        expires_at.setMonth(expires_at.getMonth() + 1);
    }

    const fmt = (d) => d.toISOString().split('T')[0];

    // Expire old subscription
    await db.promise().query(
        `UPDATE tbl_subscriptions SET status = 'expired' WHERE tenant_id = ? AND status = 'active'`,
        [tenant_id]
    );

    // Insert new subscription
    await db.promise().query(`
        INSERT INTO tbl_subscriptions
            (tenant_id, plan_id, billing_cycle, status, started_at, expires_at, amount_paid, payment_ref)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
    `, [tenant_id, plan_id, billing_cycle, fmt(started_at), fmt(expires_at), amount_paid, payment_ref]);

    // Activate tenant in case it was suspended/expired
    await db.promise().query(
        `UPDATE tbl_tenants SET status = 'active' WHERE id = ?`,
        [tenant_id]
    );

    return { plan, expires_at: fmt(expires_at), amount_paid };
};

module.exports = {
    getPlans,
    getCurrentSubscription,
    getSubHistory,
    activateSubscription
};