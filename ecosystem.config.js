/**
 * PM2 Ecosystem Configuration
 *
 * This file configures the PM2 process manager for running the app in production.
 * PM2 keeps the process alive, restarts it on crash, and manages log rotation.
 *
 * Usage:
 *   pm2 start ecosystem.config.js          — start the app
 *   pm2 reload ecosystem.config.js         — zero-downtime reload
 *   pm2 stop sports-app                    — stop the app
 *
 * NOTE: In production this app should run behind a reverse proxy (nginx).
 * nginx handles SSL termination, static file serving, and forwards
 * requests to the Node process on the configured PORT.
 */

module.exports = {
  apps: [
    {
      name: 'sports-app',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
