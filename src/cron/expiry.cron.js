const cron           = require('node-cron');
const bookingService = require('../modules/bookings/booking.service');
const logger         = require('../utils/logger');

// ── Run every 5 minutes ────
//Approved booking which crossed the deadline will update every 5 minute
const startExpiryCron = () => {
    cron.schedule('*/5 * * * *', async () => {
        try {
            const expired = await bookingService.expireBookings();

            if (expired.length > 0) {
                logger.info(`Cron: ${expired.length} booking(s) expired`, {
                    booking_nos: expired.map(b => b.booking_no)
                });
            }
        } catch (error) {
            logger.error('Cron expiry job failed', {
                message: error.message
            });
        }
    });

    logger.info('Expiry cron job started — runs every 5 minutes');
};

module.exports = { startExpiryCron };