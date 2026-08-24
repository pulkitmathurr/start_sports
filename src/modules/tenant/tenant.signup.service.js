const bcrypt = require('bcrypt');
const db     = require('../../config/db.config');
const logger = require('../../utils/logger');
const { sendNewAccountNotificationToSuperAdmin } = require('../../services/email.service');

// ── Helper: generate unique slug from business name ──────────
const generateSlug = async (business_name, connection) => {
    let base = business_name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-');

    const [existing] = await connection.query(
        'SELECT id FROM tbl_tenants WHERE slug = ? LIMIT 1',
        [base]
    );

    if (existing.length === 0) return base;

    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${base}-${suffix}`;
};

// ── TENANT SIGNUP ─────────────────────────────────────────────
const tenantSignup = async ({ name, email, password, business_name, phone, city, plan_id = 1, req }) => {
    const connection = await db.promise().getConnection();
    await connection.beginTransaction();

    try {
        logger.info('Tenant signup attempt', { email, business_name });

        // ── 1. Check email not already registered ─────────────
        const [existingUser] = await connection.query(
            'SELECT id FROM tbl_users WHERE email = ? AND flag = 0 LIMIT 1',
            [email]
        );
        if (existingUser.length > 0) {
            const err = new Error('This email is already registered. Please login.');
            err.statusCode = 409;
            throw err;
        }

        // ── 2. Fetch plan details ─────────────────────────────
        const [plans] = await connection.query(
            'SELECT * FROM tbl_plans WHERE id = ? AND is_active = 1 LIMIT 1',
            [plan_id]
        );
        if (plans.length === 0) {
            const err = new Error('Selected plan not found');
            err.statusCode = 400;
            throw err;
        }
        const plan = plans[0];

        // ── 3. Create user in tbl_users ───────────────────────
        const hashedPassword = await bcrypt.hash(password, 12);
        const [userResult] = await connection.query(
            `INSERT INTO tbl_users (name, email, password, phone, role)
             VALUES (?, ?, ?, ?, 'admin')`,
            [name, email, hashedPassword, phone || null]
        );
        const user_id = userResult.insertId;

        // ── 4. Create tenant in tbl_tenants (status = pending_approval) ──
        const slug = await generateSlug(business_name, connection);
        const [tenantResult] = await connection.query(
            `INSERT INTO tbl_tenants (user_id, business_name, slug, phone, city, status)
             VALUES (?, ?, ?, ?, ?, 'pending_approval')`,
            [user_id, business_name, slug, phone || null, city || null]
        );
        const tenant_id = tenantResult.insertId;

        // ── 5. Create trial subscription (inactive until SA approves) ─
        const trial_days = plan.trial_days || 14;
        const started_at = new Date();
        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + trial_days);

        const startedStr = started_at.toISOString().split('T')[0];
        const expiresStr = expires_at.toISOString().split('T')[0];

        await connection.query(
            `INSERT INTO tbl_subscriptions
             (tenant_id, plan_id, billing_cycle, status, started_at, expires_at, amount_paid)
             VALUES (?, ?, 'trial', 'inactive', ?, ?, 0.00)`,
            [tenant_id, plan_id, startedStr, expiresStr]
        );

        await connection.commit();

        // ── 6. Notify super admin of pending approval request ─
        sendNewAccountNotificationToSuperAdmin({
            name,
            email,
            business_name,
            phone,
            city,
            plan_name: plan.name,
            trial_days,
            expires_at: expiresStr
        }).catch(err => logger.error('Super admin notification email failed', { error: err.message }));

        logger.info('Tenant signup submitted — pending SA approval', { user_id, tenant_id });

        // ── No session created — admin cannot log in until SA approves ─
        return {
            user:         { id: user_id, name, email, role: 'admin' },
            tenant:       { id: tenant_id, business_name, slug },
            pending_approval: true,
            trial_expires: expiresStr
        };

    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

// ── GET ALL ACTIVE PLANS ───────────────────────────────────────
const getActivePlans = async () => {
    try {
        const [plans] = await db.promise().query(
            'SELECT * FROM tbl_plans WHERE is_active = 1 ORDER BY price_monthly ASC'
        );
        return plans;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    tenantSignup,
    getActivePlans
};