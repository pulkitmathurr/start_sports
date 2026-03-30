const db = require('../config/db.config');
const { errorResponse } = require('../utils/response');
const { generateToken } = require('../utils/helpers');

const authMiddleware = async (req, res, next) => {
    try {
        let access_token = null;

        // Get token from Authorization header or cookie
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            access_token = authHeader.split(' ')[1];
        } else if (req.cookies && req.cookies['access_token']) {
            access_token = req.cookies['access_token'];
        }

        if (!access_token) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(401).json(errorResponse('Access token required'));
            }
            return res.redirect('/auth/login');
        }

        // Find valid session
        const [sessions] = await db.promise().query(
            `SELECT * FROM tbl_sessions
             WHERE access_token = ?
             AND is_active = 1
             AND refresh_expires_at > NOW()`,
            [access_token]
        );

        if (sessions.length === 0) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(401).json(errorResponse('Invalid or expired token'));
            }
            return res.redirect('/auth/login');
        }

        const session     = sessions[0];
        const now         = new Date();
        const accessExpiry = new Date(session.access_expires_at);

        if (now > accessExpiry) {
            // Auto-refresh access token
            const new_access_token = generateToken(40);

            await db.promise().query(
                `UPDATE tbl_sessions
                 SET access_token = ?,
                     access_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
                     last_used_at = NOW()
                 WHERE id = ?`,
                [new_access_token, session.id]
            );

            res.cookie('access_token', new_access_token, {
                maxAge:   15 * 60 * 1000,
                httpOnly: true,
                path:     '/'
            });

            req.user    = { user_id: session.user_id };
            req.session = { ...session, access_token: new_access_token };
        } else {
            await db.promise().query(
                'UPDATE tbl_sessions SET last_used_at = NOW() WHERE id = ?',
                [session.id]
            );

            req.user    = { user_id: session.user_id };
            req.session = session;
        }

        // ── Fetch user info including role (NEW) ──────────────
        const [userRows] = await db.promise().query(
            'SELECT id, name, email, profile_image, role FROM tbl_users WHERE id = ? LIMIT 1',
            [session.user_id]
        );

        if (userRows.length === 0) {
            return res.redirect('/auth/login');
        }

        const user = userRows[0];

        // Attach role to req.user so other middlewares can use it
        req.user.role = user.role;

        // Available in all EJS views as res.locals.user
        res.locals.user = user;

        // ── If admin, fetch their tenant info (NEW) ───────────
        // Super admin does not have a tenant row, so we skip
        if (user.role === 'admin') {
            const [tenantRows] = await db.promise().query(
                'SELECT * FROM tbl_tenants WHERE user_id = ? LIMIT 1',
                [user.id]
            );

            if (tenantRows.length === 0) {
                // Account exists but no tenant row — something went wrong during signup
                if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                    return res.status(403).json(errorResponse('Tenant account not found'));
                }
                return res.redirect('/auth/login');
            }

            // Attach tenant to req so every service can use req.tenant.id
            req.tenant           = tenantRows[0];
            res.locals.tenant    = tenantRows[0];
        }

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = authMiddleware;