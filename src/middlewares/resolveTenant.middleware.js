const db = require('../config/db.config');

/**
 * resolveTenant — reads the tenant slug from:
 *   1. x-tenant-slug header  (preferred — set once at app init)
 *   2. ?slug= query param    (fallback for simple GET requests)
 *
 * Attaches req.consumer_tenant_id if found.
 * Returns 400 if slug is missing, 404 if slug doesn't match any active tenant.
 */
const resolveTenant = async (req, res, next) => {
    try {
        const slug = req.headers['x-tenant-slug'] || req.query.slug || null;

        if (!slug) {
            return res.status(400).json({
                success: false,
                message: 'Tenant slug is required. Pass it as x-tenant-slug header or ?slug= query param.'
            });
        }

        const [rows] = await db.promise().query(
            `SELECT t.id, t.business_name, t.slug, t.status
             FROM tbl_tenants t
             WHERE t.slug = ? LIMIT 1`,
            [slug]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No tenant found with slug "${slug}".`
            });
        }

        const tenant = rows[0];

        if (tenant.status === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'This sports facility is currently unavailable. Please contact them directly.'
            });
        }

        // Attach to request so all downstream controllers/services can use it
        req.consumer_tenant_id = tenant.id;
        req.consumer_tenant    = tenant;

        next();
    } catch (err) {
        next(err);
    }
};

module.exports = resolveTenant;