require('./src/config/db.config');
const app    = require('./src/app');
const { PORT, NODE_ENV } = require('./src/config/app.config');
const logger = require('./src/utils/logger');
const { startExpiryCron } = require('./src/cron/expiry.cron');
const { startSubscriptionExpiryCron } = require('./src/cron/subscription.cron');

const startServer = async () => {
  try {
    logger.info('Server boot starting', { env: NODE_ENV, port: PORT });

    const server = app.listen(PORT, () => {
      logger.info('Server started successfully', { env: NODE_ENV, port: PORT });

      // ── Start cron jobs ─────────────────────────
      startExpiryCron();
      startSubscriptionExpiryCron();
    });

    process.on('SIGINT', () => {
      logger.warn('SIGINT received, shutting down server');
      server.close(() => {
        logger.info('Server closed successfully');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      logger.warn('SIGTERM received, shutting down server');
      server.close(() => {
        logger.info('Server closed successfully');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Server startup failed', {
      message: error.message,
      stack:   error.stack
    });
    process.exit(1);
  }
};

startServer();