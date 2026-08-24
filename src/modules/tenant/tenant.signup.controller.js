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

        // Account submitted for SA approval — do NOT set session cookies
        return res.status(201).json(successResponse(
            'Account request submitted! Our team will review and approve your account. You will be notified once approved.',
            {
                pending_approval: true,
                redirect: '/auth/login?pending=1',
                tenant: result.tenant
            }
        ));

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