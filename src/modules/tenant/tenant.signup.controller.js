const tenantSignupService = require('./tenant.signup.service');
const { successResponse, errorResponse } = require('../../utils/response');

// ── GET — Signup Page ─────────────────────────────────────────
// Shows the signup form with available plans
const signupPage = async (req, res, next) => {
    try {
        // If already logged in, redirect to dashboard
        const access_token = req.cookies?.access_token;
        if (access_token) return res.redirect('/dashboard');

        // Fetch plans to show on signup page (Free Trial, Basic, Pro)
        const plans = await tenantSignupService.getActivePlans();

        return res.render('tenant/signup', {
            title: 'Register Your Ground',
            plans,
            error: null
        });
    } catch (error) {
        next(error);
    }
};

// ── POST — Handle Signup Form Submit ─────────────────────────
const signup = async (req, res, next) => {
    try {
        const {
            name,
            email,
            password,
            business_name,
            phone,
            city,
            plan_id
        } = req.body;

        const result = await tenantSignupService.tenantSignup({
            name,
            email,
            password,
            business_name,
            phone,
            city,
            plan_id: parseInt(plan_id) || 1,
            req
        });

        // Auto login after signup — set cookies
        res.cookie('access_token', result.access_token, {
            maxAge:   15 * 60 * 1000,
            httpOnly: false,
            path:     '/',
            sameSite: 'lax'
        });

        res.cookie('session_id', result.session_id, {
            maxAge:   7 * 24 * 60 * 60 * 1000,
            httpOnly: false,
            path:     '/',
            sameSite: 'lax'
        });

        return res.status(201).json(successResponse('Account created successfully! Redirecting...', {
            redirect:      '/dashboard',
            trial_expires: result.trial_expires,
            tenant:        result.tenant
        }));

    } catch (error) {
        // Handle duplicate email nicely
        if (error.statusCode === 409) {
            return res.status(409).json(errorResponse(error.message));
        }
        next(error);
    }
};

module.exports = {
    signupPage,
    signup
};