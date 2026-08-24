const authService = require('./auth.service');
const db           = require('../../config/db.config');
const { successResponse } = require('../../utils/response');

// ── Register ──────────────────────────────────────
const register = async (req, res, next) => {
    try {
        const result = await authService.registerUser({
            name:     req.body.name,
            email:    req.body.email,
            password: req.body.password
        });
        return res.status(201).json(successResponse('User registered successfully', result));
    } catch (error) {
        next(error);
    }
};

// ── Login ─────────────────────────────────────────
const login = async (req, res, next) => {
    try {
        const result = await authService.loginUser({
            email:    req.body.email,
            password: req.body.password,
            req
        });

        // Use role-scoped cookie paths so super_admin and admin cookies
        // never overwrite each other across browser tabs.
        // super_admin → cookie path '/super-admin'  (only sent on /super-admin/* requests)
        // admin       → cookie path '/'             (sent on all requests)
        const isSuperAdmin = result.user.role === 'super_admin';
        const cookiePath   = isSuperAdmin ? '/super-admin' : '/';
        const cookieName   = isSuperAdmin ? 'sa_access_token' : 'access_token';
        const sessionName  = isSuperAdmin ? 'sa_session_id'   : 'session_id';

        const isProd = process.env.NODE_ENV === 'production';

        res.cookie(cookieName, result.access_token, {
            maxAge:   15 * 60 * 1000,
            httpOnly: true,
            path:     cookiePath,
            sameSite: 'strict',
            secure:   isProd        // always true in prod; false only in local dev
        });

        res.cookie(sessionName, result.session_id, {
            maxAge:   7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            path:     cookiePath,
            sameSite: 'strict',
            secure:   isProd
        });

        return res.status(200).json(successResponse('Login successful', result));
    } catch (error) {
        next(error);
    }
};

// ── Refresh Token ─────────────────────────────────
const refreshToken = async (req, res, next) => {
    try {
        const result = await authService.refreshTokenService({
            refresh_token: req.body.refresh_token
        });
        return res.status(200).json(successResponse('Token refreshed', result));
    } catch (error) {
        next(error);
    }
};

// ── Logout ────────────────────────────────────────
const logout = async (req, res, next) => {
    try {
        const isSuperAdmin = req.baseUrl.startsWith('/super-admin');
        const access_token = isSuperAdmin
            ? req.cookies?.sa_access_token
            : req.cookies?.access_token;

        // Invalidate the session in the database
        if (access_token) {
            await authService.logoutByAccessToken({ access_token });
        }

        const isProd = process.env.NODE_ENV === 'production';

        // clearCookie MUST use the EXACT same options that were used in res.cookie()
        // during login — httpOnly, sameSite, secure, path and domain must all match.
        // Any mismatch means the browser treats it as a different cookie and ignores
        // the deletion, leaving the user still "logged in".
        const clearOpts = (path) => ({
            path,
            httpOnly: true,
            sameSite: 'strict',
            secure:   isProd,

        });

        if (isSuperAdmin) {
            res.clearCookie('sa_access_token', clearOpts('/super-admin'));
            res.clearCookie('sa_session_id',   clearOpts('/super-admin'));
        } else {
            res.clearCookie('access_token', clearOpts('/'));
            res.clearCookie('session_id',   clearOpts('/'));
        }
        // Clear legacy cookie just in case
        res.clearCookie('refresh_token', clearOpts('/'));

        return res.redirect('/auth/login');
    } catch (error) {
        next(error);
    }
};

// ── Force Logout ──────────────────────────────────
const forceLogout = async (req, res, next) => {
    try {
        await authService.forceLogout({
            user_id:    req.user.user_id,
            session_id: req.body.session_id || null
        });
        return res.status(200).json(successResponse('Force logout successful'));
    } catch (error) {
        next(error);
    }
};

// ── Get Active Sessions ───────────────────────────
const getSessions = async (req, res, next) => {
    try {
        const sessions = await authService.getActiveSessions({
            user_id: req.user.user_id
        });
        return res.status(200).json(successResponse('Active sessions', sessions));
    } catch (error) {
        next(error);
    }
};

// ── Login Page ────────────────────────────────────
const loginPage = async (req, res, next) => {
    try {
        // Check role-scoped cookies independently — sa_access_token for super admin,
        // access_token for tenant admin. Whichever is valid wins the redirect.
        const sa_token     = req.cookies?.sa_access_token;
        const admin_token  = req.cookies?.access_token;

        if (sa_token) {
            const isValid = await authService.checkValidSession({ access_token: sa_token });
            if (isValid) return res.redirect('/super-admin/dashboard');
        }

        if (admin_token) {
            const isValid = await authService.checkValidSession({ access_token: admin_token });
            if (isValid) return res.redirect('/dashboard');
        }
        return res.render('auth/login', {
            title: 'Login',
            error: req.query.suspended
                ? 'Your account has been suspended. Please contact support.'
                : null
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    login,
    refreshToken,
    logout,
    forceLogout,
    getSessions,
    loginPage
};