const authService = require('./auth.service');
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

        // Set access_token cookie — used by authMiddleware
        res.cookie('access_token', result.access_token, {
            maxAge:   15 * 60 * 1000,   // 15 minutes
            httpOnly: false,
            path:     '/',
            sameSite: 'lax'
        });

        // BUG FIX: also set session_id cookie so logout can deactivate the DB session
        res.cookie('session_id', result.session_id, {
            maxAge:   7 * 24 * 60 * 60 * 1000,  // 7 days (matches refresh token)
            httpOnly: false,
            path:     '/',
            sameSite: 'lax'
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
        const access_token = req.cookies?.access_token;
        if (access_token) {
            await authService.logoutByAccessToken({ access_token });
        }
        // Clear all auth cookies
        res.clearCookie('access_token',  { path: '/' });
        res.clearCookie('refresh_token', { path: '/' });
        res.clearCookie('session_id',    { path: '/' });

        return res.status(200).json(successResponse('Logged out successfully'));
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
        // BUG FIX: removed console.log debug statements
        const access_token = req.cookies?.access_token;
        if (access_token) {
            const isValid = await authService.checkValidSession({ access_token });
            if (isValid) return res.redirect('/dashboard');
        }
        return res.render('auth/login', { title: 'Login', error: null });
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