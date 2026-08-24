/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * How it works:
 * 1. On every GET request to a page, the server sets a random `csrf_token`
 *    cookie (NOT httpOnly — JS must read it).
 * 2. Every state-changing request (POST/PUT/DELETE) from the frontend
 *    must read that cookie and send the value in the `X-CSRF-Token` header.
 * 3. The server compares the header value against the cookie value.
 *    A cross-origin attacker cannot read the cookie (same-origin policy),
 *    so they cannot forge the header — the request is rejected.
 *
 * This requires no session storage and no external package.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Generate a new CSRF token
const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

// Middleware: issue a CSRF cookie on every GET (if not already set)
const csrfIssuer = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
        if (!req.cookies[CSRF_COOKIE]) {
            const token = generateCsrfToken();
            res.cookie(CSRF_COOKIE, token, {
                httpOnly: false,          // JS must read this to send in header
                sameSite: 'strict',
                secure:   process.env.NODE_ENV === 'production',
                maxAge:   4 * 60 * 60 * 1000  // 4 hours
            });
        }
    }
    next();
};

// Middleware: validate CSRF token on all mutating requests
const csrfProtect = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const cookieToken = req.cookies[CSRF_COOKIE];
    // Accept token from header (fetch/XHR) OR from body field _csrf
    // (plain HTML form submissions that cannot set custom headers).
    const headerToken = req.headers[CSRF_HEADER] || req.body?._csrf || null;

    if (!cookieToken || !headerToken) {
        logger.warn('CSRF token missing', {
            method: req.method, url: req.originalUrl, ip: req.ip
        });
        return res.status(403).json({ success: false, message: 'CSRF token missing' });
    }

    // Constant-time comparison to prevent timing attacks
    const cookieBuf = Buffer.from(cookieToken);
    const headerBuf = Buffer.from(headerToken);

    if (cookieBuf.length !== headerBuf.length ||
        !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
        logger.warn('CSRF token mismatch', {
            method: req.method, url: req.originalUrl, ip: req.ip
        });
        return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    }

    next();
};

module.exports = { csrfIssuer, csrfProtect };