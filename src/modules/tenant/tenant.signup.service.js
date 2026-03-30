const bcrypt = require('bcrypt');
const db     = require('../../config/db.config');
const logger = require('../../utils/logger');
const { generateToken, generateSessionId, getDeviceInfo } = require('../../utils/helpers');
const { sendTenantWelcomeEmail, sendTrialExpiryReminderEmail } = require('../../services/email.service');

// ── Helper: generate unique slug from business name ──────────
// e.g. "ABC Sports Arena" → "abc-sports-arena"
// if slug taken, append random 4 digits
const generateSlug = async (business_name) => {
    let base = business_name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-');

    const [existing] = await db.promise().query(
        'SELECT id FROM tbl_tenants WHERE slug = ? LIMIT 1',
        [base]
    );

    if (existing.length === 0) return base;

    // slug taken — append random 4 digit number
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${base}-${suffix}`;
};

// ── TENANT SIGNUP ─────────────────────────────────────────────
// Creates: tbl_users row + tbl_tenants row + tbl_subscriptions row (trial)
// Returns: user + tenant + access_token (auto login after signup)
const tenantSignup = async ({ name, email, password, business_name, phone, city, plan_id = 1, req }) => {
    try {
        logger.info('Tenant signup attempt', { email, business_name });

        // ── 1. Check email not already registered ─────────────
        const [existingUser] = await db.promise().query(
            'SELECT id FROM tbl_users WHERE email = ? LIMIT 1',
            [email]
        );
        if (existingUser.length > 0) {
            const err = new Error('This email is already registered. Please login.');
            err.statusCode = 409;
            throw err;
        }

        // ── 2. Fetch plan details ─────────────────────────────
        const [plans] = await db.promise().query(
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
        const hashedPassword = await bcrypt.hash(password, 10);
        const [userResult] = await db.promise().query(
            `INSERT INTO tbl_users (name, email, password, phone, role)
             VALUES (?, ?, ?, ?, 'admin')`,
            [name, email, hashedPassword, phone || null]
        );
        const user_id = userResult.insertId;

        // ── 4. Create tenant in tbl_tenants ───────────────────
        const slug = await generateSlug(business_name);
        const [tenantResult] = await db.promise().query(
            `INSERT INTO tbl_tenants (user_id, business_name, slug, phone, city, status)
             VALUES (?, ?, ?, ?, ?, 'active')`,
            [user_id, business_name, slug, phone || null, city || null]
        );
        const tenant_id = tenantResult.insertId;

        // ── 5. Create trial subscription ──────────────────────
        const trial_days  = plan.trial_days || 14;
        const started_at  = new Date();
        const expires_at  = new Date();
        expires_at.setDate(expires_at.getDate() + trial_days);

        const startedStr  = started_at.toISOString().split('T')[0];
        const expiresStr  = expires_at.toISOString().split('T')[0];

        await db.promise().query(
            `INSERT INTO tbl_subscriptions
             (tenant_id, plan_id, billing_cycle, status, started_at, expires_at, amount_paid)
             VALUES (?, ?, 'trial', 'active', ?, ?, 0.00)`,
            [tenant_id, plan_id, startedStr, expiresStr]
        );

        // ── 6. Auto login — create session ────────────────────
        const session_id    = generateSessionId();
        const access_token  = generateToken(40);
        const refresh_token = generateToken(40);
        const deviceInfo    = getDeviceInfo(req);

        await db.promise().query(
            `INSERT INTO tbl_sessions
             (user_id, tenant_id, session_id, access_token, refresh_token,
              device_name, device_type, browser, os, ip_address,
              access_expires_at, refresh_expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              DATE_ADD(NOW(), INTERVAL 15 MINUTE),
              DATE_ADD(NOW(), INTERVAL 7 DAY))`,
            [
                user_id, tenant_id, session_id, access_token, refresh_token,
                deviceInfo.device_name, deviceInfo.device_type,
                deviceInfo.browser, deviceInfo.os, deviceInfo.ip_address
            ]
        );

        // ── 7. Send welcome email (non blocking) ──────────────
        sendTenantWelcomeEmail({
            name,
            email,
            business_name,
            trial_days,
            expires_at: expiresStr,
            plan_name: plan.name
        }).catch(err => logger.error('Welcome email failed', { error: err.message }));

        logger.info('Tenant signup successful', { user_id, tenant_id });

        return {
            user:         { id: user_id, name, email, role: 'admin' },
            tenant:       { id: tenant_id, business_name, slug },
            access_token,
            refresh_token,
            session_id,
            trial_expires: expiresStr
        };

    } catch (err) {
        throw err;
    }
};

// ── GET ALL ACTIVE PLANS ───────────────────────────────────────
// Used on the signup page to show plan options
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