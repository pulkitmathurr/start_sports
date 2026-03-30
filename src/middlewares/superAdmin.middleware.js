const { errorResponse } = require('../utils/response');

// ── superAdminMiddleware ──────────────────────────────────────
// Use this on all /super-admin/* routes
// authMiddleware must run BEFORE this middleware
//
// Usage in routes:
//   const authMiddleware       = require('../middlewares/auth.middleware');
//   const superAdminMiddleware = require('../middlewares/superAdmin.middleware');
//   router.get('/dashboard', authMiddleware, superAdminMiddleware, controller);
// ─────────────────────────────────────────────────────────────

const superAdminMiddleware = (req, res, next) => {
    try {
        // authMiddleware already attached req.user.role
        if (!req.user || req.user.role !== 'super_admin') {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(403).json(errorResponse('Access denied. Super admin only.'));
            }
            // If a regular admin tries to access super admin pages
            // redirect them back to their own dashboard
            return res.redirect('/dashboard');
        }

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = superAdminMiddleware;