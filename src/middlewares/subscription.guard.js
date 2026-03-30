const db = require('../config/db.config');
const { errorResponse } = require('../utils/response');

// ── subscriptionGuard ─────────────────────────────────────────
// Checks if the logged-in tenant's subscription is still active
// authMiddleware must run BEFORE this middleware
//
// Super admin is always allowed through — no subscription check
//
// Usage in routes:
//   router.get('/dashboard', authMiddleware, subscriptionGuard, controller);
//
// What it checks:
//   active  → allow
//   grace   → allow but show warning banner (expires_soon flag)
//   expired → block, redirect to /billing
//   cancelled → block, redirect to /billing
// ─────────────────────────────────────────────────────────────

const subscriptionGuard = async (req, res, next) => {
    try {
        // Super admin always passes through
        if (req.user && req.user.role === 'super_admin') {
            return next();
        }

        // tenant must exist on req (set by authMiddleware)
        if (!req.tenant) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(403).json(errorResponse('Tenant not found'));
            }
            return res.redirect('/auth/login');
        }

        // Fetch latest subscription for this tenant
        const [rows] = await db.promise().query(
            `SELECT * FROM tbl_subscriptions
             WHERE tenant_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            [req.tenant.id]
        );

        // No subscription row at all
        if (rows.length === 0) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(403).json(errorResponse('No active subscription found'));
            }
            return res.redirect('/billing');
        }

        const sub  = rows[0];
        const now  = new Date();
        const exp  = new Date(sub.expires_at);
        const grace = sub.grace_until ? new Date(sub.grace_until) : null;

        // Attach subscription to req for use in controllers/views
        req.subscription          = sub;
        res.locals.subscription   = sub;

        // ── CASE 1: Active and not expired ────────────────────
        if (sub.status === 'active' && now <= exp) {
            // Warn if expiring within 3 days
            const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 3) {
                res.locals.expires_soon = true;
                res.locals.days_left    = daysLeft;
            }
            return next();
        }

        // ── CASE 2: In grace period ────────────────────────────
        // Allow access but show a warning
        if (sub.status === 'grace' && grace && now <= grace) {
            res.locals.in_grace    = true;
            res.locals.grace_until = sub.grace_until;
            return next();
        }

        // ── CASE 3: Expired or cancelled ──────────────────────
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(403).json(errorResponse('Your subscription has expired. Please renew to continue.'));
        }
        return res.redirect('/billing');

    } catch (error) {
        next(error);
    }
};

module.exports = subscriptionGuard;