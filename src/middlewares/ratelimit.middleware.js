/**
 * Centralised rate limiters
 * All limits use in-memory store (default) which resets on restart.
 * For multi-process / multi-server deployments, swap the store for
 * a Redis-backed one using `rate-limit-redis`.
 */

const rateLimit = require('express-rate-limit');

const json429 = {
    success: false,
    message: 'Too many requests — please slow down and try again later.'
};

// Auth routes — login / register / signup
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 min
    max: 20,
    standardHeaders: true,
    legacyHeaders:   false,
    message: json429
});

// Logout — prevent session-flooding DOS
const logoutLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 min
    max: 10,
    standardHeaders: true,
    legacyHeaders:   false,
    message: json429
});

// General API write operations (POST/PUT/DELETE on data routes)
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 min
    max: 60,
    standardHeaders: true,
    legacyHeaders:   false,
    message: json429
});

// General API reads
const readLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 min
    max: 200,
    standardHeaders: true,
    legacyHeaders:   false,
    message: json429
});

module.exports = { authLimiter, logoutLimiter, writeLimiter, readLimiter };