const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const db      = require('../../config/db.config');
const logger  = require('../../utils/logger');
const {
    generateToken,
    generateSessionId,
    getDeviceInfo
} = require('../../utils/helpers');

// ── Constants ─────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES     = 30;

// ── Token hashing ─────────────────────────────────────────────
const hashToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

// ── REGISTER ──────────────────────────────────────────────────
const registerUser = async ({ name, email, password }) => {
    logger.info('Register attempt', { email });

    const [existing] = await db.promise().query(
        'SELECT id FROM tbl_users WHERE email = ? LIMIT 1',
        [email]
    );
    if (existing.length > 0) {
        const err = new Error('Email already registered');
        err.statusCode = 409;
        throw err;
    }

    const hashedPassword = await bcrypt.hash(password, 12); // cost 12 (up from 10)

    const [result] = await db.promise().query(
        'INSERT INTO tbl_users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword]
    );

    logger.info('User registered', { user_id: result.insertId });
    return { id: result.insertId, name, email };
};

// ── LOGIN ─────────────────────────────────────────────────────
const loginUser = async ({ email, password, req }) => {
    logger.info('Login attempt', { email });

    const [rows] = await db.promise().query(
        `SELECT id, name, email, role, password,
                login_attempts, locked_until
         FROM tbl_users
         WHERE email = ? AND flag = 0 LIMIT 1`,
        [email]
    );

    // Always run bcrypt even on missing user to prevent timing-based
    // user enumeration (attacker cannot tell if email exists by response time)
    const dummyHash = '$2b$12$invalidhashpaddingtomatchbcryptlength00000000000000000000';
    const user = rows[0] || null;
    const hashToCompare = user ? user.password : dummyHash;

    // ── Check account lockout ──────────────────────────────
    if (user) {
        const now = new Date();
        if (user.locked_until && new Date(user.locked_until) > now) {
            const minutesLeft = Math.ceil(
                (new Date(user.locked_until) - now) / 60000
            );
            const err = new Error(
                `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`
            );
            err.statusCode = 423; // HTTP 423 Locked
            throw err;
        }
    }

    const isMatch = await bcrypt.compare(password, hashToCompare);

    if (!user || !isMatch) {
        // Increment failed attempts only for real users
        if (user) {
            const newAttempts = (user.login_attempts || 0) + 1;
            if (newAttempts >= MAX_FAILED_ATTEMPTS) {
                // Lock the account
                await db.promise().query(
                    `UPDATE tbl_users
                     SET login_attempts = ?,
                         locked_until   = DATE_ADD(NOW(), INTERVAL ? MINUTE)
                     WHERE id = ?`,
                    [newAttempts, LOCKOUT_MINUTES, user.id]
                );
                logger.warn('Account locked after failed attempts', {
                    user_id: user.id, attempts: newAttempts
                });
            } else {
                await db.promise().query(
                    'UPDATE tbl_users SET login_attempts = ? WHERE id = ?',
                    [newAttempts, user.id]
                );
            }
        }

        const err = new Error('Invalid email or password');
        err.statusCode = 401;
        throw err;
    }

    // ── Check if user account is suspended ────────────────
    const [suspendCheck] = await db.promise().query(
        `SELECT u.is_suspended, t.status AS tenant_status
         FROM tbl_users u
         LEFT JOIN tbl_tenants t ON t.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
        [user.id]
    );
    if (suspendCheck.length > 0) {
        const sc = suspendCheck[0];
        if (sc.is_suspended === 1 || sc.tenant_status === 'suspended') {
            const err = new Error('Your account has been suspended. Please contact support.');
            err.statusCode = 403;
            err.code = 'ACCOUNT_SUSPENDED';
            throw err;
        }
    }

    // ── Maintenance mode — block tenant admin login ───────
    // Super admin is never blocked regardless of maintenance mode.
    if (user.role === 'admin') {
        const [[maintenanceSetting]] = await db.promise().query(
            `SELECT setting_value FROM tbl_app_settings WHERE setting_key = 'maintenance_mode' LIMIT 1`
        );
        if (maintenanceSetting && maintenanceSetting.setting_value === '1') {
            const err = new Error('The platform is currently under maintenance. Please try again later.');
            err.statusCode = 503;
            err.code = 'MAINTENANCE_MODE';
            throw err;
        }
    }

    // ── Successful login — reset lockout counters ──────────
    await db.promise().query(
        `UPDATE tbl_users
         SET login_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [user.id]
    );

    // ── Create session with hashed tokens ─────────────────
    const session_id    = generateSessionId();
    const access_token  = generateToken(40);
    const refresh_token = generateToken(40);
    const deviceInfo    = getDeviceInfo(req);

    // Store SHA-256 hashes — raw tokens are returned to the client only
    const access_hash  = hashToken(access_token);
    const refresh_hash = hashToken(refresh_token);

    await db.promise().query(
        `INSERT INTO tbl_sessions
         (user_id, session_id, access_token, refresh_token,
          device_name, device_type, browser, os, ip_address,
          access_expires_at, refresh_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?,  ?,
          DATE_ADD(NOW(), INTERVAL 15 MINUTE),
          DATE_ADD(NOW(), INTERVAL 7 DAY))`,
        [
            user.id, session_id, access_hash, refresh_hash,
            deviceInfo.device_name, deviceInfo.device_type,
            deviceInfo.browser, deviceInfo.os, deviceInfo.ip_address
        ]
    );

    logger.info('Login successful', { user_id: user.id, session_id });

    return {
        user:          { id: user.id, name: user.name, email: user.email, role: user.role },
        access_token,   // raw — goes to client cookie only
        refresh_token,  // raw — goes to client cookie only
        session_id
    };
};

// ── REFRESH TOKEN ─────────────────────────────────────────────
const refreshTokenService = async ({ refresh_token }) => {
    const refresh_hash = hashToken(refresh_token);

    const [sessions] = await db.promise().query(
        `SELECT * FROM tbl_sessions
         WHERE refresh_token = ?
         AND is_active = 1
         AND refresh_expires_at > NOW()`,
        [refresh_hash]
    );

    if (sessions.length === 0) {
        const err = new Error('Invalid or expired refresh token');
        err.statusCode = 401;
        throw err;
    }

    const new_access_token = generateToken(40);
    const new_access_hash  = hashToken(new_access_token);

    await db.promise().query(
        `UPDATE tbl_sessions
         SET access_token = ?,
             access_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
             last_used_at = NOW()
         WHERE id = ?`,
        [new_access_hash, sessions[0].id]
    );

    return { access_token: new_access_token };
};

// ── LOGOUT by access_token ────────────────────────────────────
const logoutByAccessToken = async ({ access_token }) => {
    const hash = hashToken(access_token);
    await db.promise().query(
        'UPDATE tbl_sessions SET is_active = 0 WHERE access_token = ?',
        [hash]
    );
    logger.info('Logout by access_token');
    return true;
};

// ── LOGOUT by session_id ──────────────────────────────────────
const logoutUser = async ({ session_id }) => {
    await db.promise().query(
        'UPDATE tbl_sessions SET is_active = 0 WHERE session_id = ?',
        [session_id]
    );
    logger.info('Logout', { session_id });
    return true;
};

// ── FORCE LOGOUT ──────────────────────────────────────────────
const forceLogout = async ({ user_id, session_id = null }) => {
    if (session_id) {
        await db.promise().query(
            'UPDATE tbl_sessions SET is_active = 0 WHERE session_id = ? AND user_id = ?',
            [session_id, user_id]
        );
        logger.info('Force logout single device', { user_id, session_id });
    } else {
        await db.promise().query(
            'UPDATE tbl_sessions SET is_active = 0 WHERE user_id = ?',
            [user_id]
        );
        logger.info('Force logout all devices', { user_id });
    }
    return true;
};

// ── GET ACTIVE SESSIONS ───────────────────────────────────────
const getActiveSessions = async ({ user_id }) => {
    const [sessions] = await db.promise().query(
        `SELECT session_id, device_name, device_type, browser, os,
                ip_address, last_used_at, created_at
         FROM tbl_sessions
         WHERE user_id = ? AND is_active = 1 AND refresh_expires_at > NOW()
         ORDER BY last_used_at DESC`,
        [user_id]
    );
    return sessions;
};

// ── CHECK VALID SESSION ───────────────────────────────────────
const checkValidSession = async ({ access_token }) => {
    if (!access_token) return false;
    const hash = hashToken(access_token);
    const [sessions] = await db.promise().query(
        `SELECT id FROM tbl_sessions
         WHERE access_token = ?
         AND is_active = 1
         AND refresh_expires_at > NOW()`,
        [hash]
    );
    return sessions.length > 0;
};


// ── Get role from access token (used by root route in app.js) ─
const getSessionRole = async (access_token) => {
    if (!access_token) return null;
    const hash = hashToken(access_token);
    const [rows] = await db.promise().query(
        `SELECT u.role FROM tbl_users u
         INNER JOIN tbl_sessions s ON s.user_id = u.id
         WHERE s.access_token = ?
         AND s.is_active = 1
         AND s.refresh_expires_at > NOW()
         LIMIT 1`,
        [hash]
    );
    return rows.length > 0 ? rows[0].role : null;
};

module.exports = {
    registerUser,
    loginUser,
    refreshTokenService,
    logoutByAccessToken,
    logoutUser,
    forceLogout,
    getActiveSessions,
    checkValidSession,
    getSessionRole,
    hashToken
};