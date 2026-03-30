const cron   = require('node-cron');
const db     = require('../config/db.config');
const logger = require('../utils/logger');

// ── Run every day at midnight (00:00) ──────────────────────────
// Marks expired subscriptions, sets grace period if applicable
const startSubscriptionExpiryCron = () => {

    cron.schedule('0 0 * * *', async () => {
        logger.info('Subscription expiry cron: starting run');

        try {
            // ── Step 1: Active → Grace ─────────────────────────
            // Subscriptions that expired today → give 3-day grace period
            const [gracified] = await db.promise().query(`
                UPDATE tbl_subscriptions
                SET status      = 'grace',
                    grace_until = DATE_ADD(NOW(), INTERVAL 3 DAY)
                WHERE status = 'active'
                  AND expires_at < NOW()
                  AND grace_until IS NULL
            `);

            if (gracified.affectedRows > 0) {
                logger.info(`Subscription cron: ${gracified.affectedRows} subscription(s) moved to grace period`);
            }

            // ── Step 2: Grace → Expired ────────────────────────
            // Grace period also over → mark as expired + suspend tenant
            const [expired] = await db.promise().query(`
                UPDATE tbl_subscriptions
                SET status = 'expired'
                WHERE status = 'grace'
                  AND grace_until < NOW()
            `);

            if (expired.affectedRows > 0) {
                logger.info(`Subscription cron: ${expired.affectedRows} subscription(s) marked expired`);

                // Suspend tenants whose subscriptions fully expired
                await db.promise().query(`
                    UPDATE tbl_tenants t
                    INNER JOIN tbl_subscriptions s ON s.tenant_id = t.id
                    SET t.status = 'suspended'
                    WHERE s.status = 'expired'
                      AND s.grace_until < NOW()
                      AND t.status = 'active'
                `);

                logger.info('Subscription cron: tenant accounts suspended for expired subscriptions');
            }

            // ── Step 3: Log upcoming expirations (warn only) ───
            const [upcoming] = await db.promise().query(`
                SELECT t.business_name, s.expires_at, DATEDIFF(s.expires_at, NOW()) AS days_left
                FROM tbl_subscriptions s
                INNER JOIN tbl_tenants t ON t.id = s.tenant_id
                WHERE s.status = 'active'
                  AND s.billing_cycle != 'trial'
                  AND s.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 DAY)
            `);

            if (upcoming.length > 0) {
                upcoming.forEach(row => {
                    logger.warn(`Subscription expiring soon: ${row.business_name} — ${row.days_left} day(s) left`);
                });
            }

            logger.info('Subscription expiry cron: run complete');

        } catch (error) {
            logger.error('Subscription expiry cron failed', {
                message: error.message,
                stack:   error.stack
            });
        }
    });

    logger.info('Subscription expiry cron job started — runs daily at midnight');
};

module.exports = { startSubscriptionExpiryCron };