const bcrypt  = require('bcrypt');
const db      = require('../../config/db.config');
const logger  = require('../../utils/logger');
const {
    generateToken,
    generateSessionId,
    getDeviceInfo
} = require('../../utils/helpers');

// REGISTER
const registerUser = async ({ name, email, password }) => {
    try {
        logger.info('Register attempt', { email });

        const [existing] = await db.promise().query(
            'SELECT id FROM tbl_users WHERE email = ? LIMIT 1',
            [email]
        );

        if (existing.length > 0) {
            const error = new Error('Email already registered');
            error.statusCode = 409;
            throw error;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.promise().query(
            'INSERT INTO tbl_users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        logger.info('User registered', { user_id: result.insertId });

        return { id: result.insertId, name, email };
    } catch (err) {
        throw err;
    }
};

// LOGIN
const loginUser = async ({ email, password, req }) => {
    try {
        logger.info('Login attempt', { email });

        const [rows] = await db.promise().query(
            'SELECT * FROM tbl_users WHERE email = ? AND flag = 0 LIMIT 1',
            [email]
        );

        if (rows.length === 0) {
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        const session_id   = generateSessionId();
        const access_token = generateToken(40);
        const refresh_token= generateToken(40);
        const deviceInfo   = getDeviceInfo(req);

        await db.promise().query(
            `INSERT INTO tbl_sessions 
             (user_id, session_id, access_token, refresh_token, 
              device_name, device_type, browser, os, ip_address, 
              access_expires_at, refresh_expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 
              DATE_ADD(NOW(), INTERVAL 15 MINUTE),
              DATE_ADD(NOW(), INTERVAL 7 DAY))`,
            [
                user.id, session_id, access_token, refresh_token,
                deviceInfo.device_name, deviceInfo.device_type,
                deviceInfo.browser, deviceInfo.os, deviceInfo.ip_address
            ]
        );

        logger.info('Login successful', { user_id: user.id, session_id });

        return {
            user:          { id: user.id, name: user.name, email: user.email, role: user.role },
            access_token,
            refresh_token,
            session_id
        };
    } catch (err) {
        throw err;
    }
};

// REFRESH TOKEN
const refreshTokenService = async ({ refresh_token }) => {
    try {
        const [sessions] = await db.promise().query(
            `SELECT * FROM tbl_sessions 
             WHERE refresh_token = ? 
             AND is_active = 1 
             AND refresh_expires_at > NOW()`,
            [refresh_token]
        );

        if (sessions.length === 0) {
            const error = new Error('Invalid or expired refresh token');
            error.statusCode = 401;
            throw error;
        }

        const session          = sessions[0];
        const new_access_token = generateToken(40);

        await db.promise().query(
            `UPDATE tbl_sessions 
             SET access_token = ?, 
                 access_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
                 last_used_at = NOW()
             WHERE id = ?`,
            [new_access_token, session.id]
        );

        return {
            access_token: new_access_token
        };
    } catch (err) {
        throw err;
    }
};

// LOGOUT — by access_token (used when session_id cookie may not exist)
const logoutByAccessToken = async ({ access_token }) => {
    try {
        await db.promise().query(
            'UPDATE tbl_sessions SET is_active = 0 WHERE access_token = ?',
            [access_token]
        );
        logger.info('Logout by access_token');
        return true;
    } catch (err) {
        throw err;
    }
};

// LOGOUT — by session_id
const logoutUser = async ({ session_id }) => {
    try {
        await db.promise().query(
            'UPDATE tbl_sessions SET is_active = 0 WHERE session_id = ?',
            [session_id]
        );
        logger.info('Logout', { session_id });
        return true;
    } catch (err) {
        throw err;
    }
};

// FORCE LOGOUT — ek device ya saare devices
const forceLogout = async ({ user_id, session_id = null }) => {
    try {
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
    } catch (err) {
        throw err;
    }
};

// ACTIVE SESSIONS list
const getActiveSessions = async ({ user_id }) => {
    try {
        const [sessions] = await db.promise().query(
            `SELECT session_id, device_name, device_type, browser, os, 
                    ip_address, last_used_at, created_at
             FROM tbl_sessions
             WHERE user_id = ? AND is_active = 1 AND refresh_expires_at > NOW()
             ORDER BY last_used_at DESC`,
            [user_id]
        );
        return sessions;
    } catch (err) {
        throw err;
    }
};

// Check if session is valid
const checkValidSession = async ({ access_token }) => {
    try {
        if (!access_token) return false;
        const [sessions] = await db.promise().query(
            `SELECT id FROM tbl_sessions 
             WHERE access_token = ? 
             AND is_active = 1
             AND refresh_expires_at > NOW()`,
            [access_token]
        );
        return sessions.length > 0;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    logoutByAccessToken,
    registerUser,
    loginUser,
    refreshTokenService,
    logoutUser,
    forceLogout,
    getActiveSessions,
    checkValidSession,
};