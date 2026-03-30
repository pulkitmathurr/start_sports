const express = require('express');
const router  = express.Router();

// ── Middlewares ───────────────────────────────────────────────
const authMiddleware       = require('../middlewares/auth.middleware');
const superAdminMiddleware = require('../middlewares/superAdmin.middleware');
const subscriptionGuard    = require('../middlewares/subscription.guard');

// ── Existing module routes ────────────────────────────────────
const authRoutes      = require('../modules/auth/auth.route.js');
const dashboardRoutes = require('../modules/dashboard/dashboard.route.js');
const bookingRoutes   = require('../modules/bookings/booking.route.js');
const consumerRoutes  = require('../modules/consumer/consumer.route.js');
const settingsRoutes  = require('../modules/settings/settings.route.js');
const profileRoutes   = require('../modules/profile/profile.route.js');
const groundRoutes    = require('../modules/grounds/ground.route.js');
const historyRoutes   = require('../modules/history/history.route.js');
const reportRoutes    = require('../modules/reports/report.route.js');
const customerRoutes  = require('../modules/customers/customer.route.js');
const expenseRoutes   = require('../modules/expenses/expenses.routes.js');
const balanceRoutes   = require('../modules/balance/balance.routes.js');

// ── Phase 3: Tenant signup ────────────────────────────────────
const tenantSignupRoutes = require('../modules/tenant/tenant.signup.route.js');

// ── Phase 4: Super admin ──────────────────────────────────────
const superAdminRoutes = require('../modules/super-admin/superAdmin.route.js');

// ── Phase 5: Billing ──────────────────────────────────────────
const billingRoutes = require('../modules/billing/billing.route.js');

// ─────────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────────────────────
router.use('/api',    consumerRoutes);
router.use('/auth',   authRoutes);
router.use('/tenant', tenantSignupRoutes);

// ─────────────────────────────────────────────────────────────
// SUPER ADMIN ROUTES
// ─────────────────────────────────────────────────────────────
router.use('/super-admin', authMiddleware, superAdminMiddleware, superAdminRoutes);

// ─────────────────────────────────────────────────────────────
// TENANT ADMIN ROUTES
// ─────────────────────────────────────────────────────────────
router.use('/dashboard',     authMiddleware, subscriptionGuard, dashboardRoutes);
router.use('/bookings',      authMiddleware, subscriptionGuard, bookingRoutes);
router.use('/settings',      authMiddleware, subscriptionGuard, settingsRoutes);
router.use('/profile',       authMiddleware, subscriptionGuard, profileRoutes);
router.use('/grounds',       authMiddleware, subscriptionGuard, groundRoutes);
router.use('/history',       authMiddleware, subscriptionGuard, historyRoutes);
router.use('/reports',       authMiddleware, subscriptionGuard, reportRoutes);
router.use('/customers',     authMiddleware, subscriptionGuard, customerRoutes);
router.use('/expenses',      authMiddleware, subscriptionGuard, expenseRoutes);
router.use('/balance-sheet', authMiddleware, subscriptionGuard, balanceRoutes);

// Billing — auth only (expired user must reach billing page)
router.use('/billing', authMiddleware, billingRoutes);

module.exports = router;