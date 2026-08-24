const express = require('express');
const router  = express.Router();

// ── Middlewares ───────────────────────────────────────────────
const authMiddleware       = require('../middlewares/auth.middleware');
const superAdminMiddleware = require('../middlewares/superAdmin.middleware');
const subscriptionGuard    = require('../middlewares/subscription.guard');
const { csrfProtect }      = require('../middlewares/csrf.middleware');

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
const publicRoutes = require('../modules/public/public.route');
// ── Phase 3: Tenant signup ────────────────────────────────────
const tenantSignupRoutes = require('../modules/tenant/tenant.signup.route.js');

// ── Phase 4: Super admin ──────────────────────────────────────
const superAdminRoutes = require('../modules/super-admin/superAdmin.route.js');

// ── Phase 5: Billing ──────────────────────────────────────────
const billingRoutes = require('../modules/billing/billing.route.js');
const coachRoutes = require('../modules/academy/coaches/coach.route');
const studentRoutes = require('../modules/academy/students/student.route');
const batchRoutes = require('../modules/academy/batches/batch.route');
const attendanceRoutes = require('../modules/academy/attendance/attendance.route');
const feeRoutes = require('../modules/academy/fees/fee.route');
// ─────────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────────────────────
router.use('/api',    consumerRoutes);
router.use('/auth',   csrfProtect, authRoutes);
router.use('/tenant', csrfProtect, tenantSignupRoutes);
router.use('/public', publicRoutes);
// ─────────────────────────────────────────────────────────────
// SUPER ADMIN ROUTES
// ─────────────────────────────────────────────────────────────
router.use('/super-admin', csrfProtect, authMiddleware, superAdminMiddleware, superAdminRoutes);

// ─────────────────────────────────────────────────────────────
// TENANT ADMIN ROUTES
// ─────────────────────────────────────────────────────────────
router.use('/dashboard', csrfProtect,     authMiddleware, subscriptionGuard, dashboardRoutes);
router.use('/bookings', csrfProtect,      authMiddleware, subscriptionGuard, bookingRoutes);
router.use('/settings', csrfProtect,      authMiddleware, subscriptionGuard, settingsRoutes);
router.use('/profile', csrfProtect,       authMiddleware, subscriptionGuard, profileRoutes);
router.use('/grounds',                    authMiddleware, subscriptionGuard, groundRoutes);
router.use('/history', csrfProtect,       authMiddleware, subscriptionGuard, historyRoutes);
router.use('/reports', csrfProtect,       authMiddleware, subscriptionGuard, reportRoutes);
router.use('/customers', csrfProtect,     authMiddleware, subscriptionGuard, customerRoutes);
router.use('/expenses', csrfProtect,      authMiddleware, subscriptionGuard, expenseRoutes);
router.use('/balance-sheet', csrfProtect, authMiddleware, subscriptionGuard, balanceRoutes);

// Billing — auth only (expired user must reach billing page)
router.use('/billing', csrfProtect, authMiddleware, billingRoutes);
router.use('/academy/coaches', authMiddleware, subscriptionGuard, coachRoutes);
router.use('/academy/students', authMiddleware, subscriptionGuard, studentRoutes);
router.use('/academy/batches', authMiddleware, subscriptionGuard, batchRoutes);
router.use('/academy/attendance', authMiddleware, subscriptionGuard, attendanceRoutes);
router.use('/academy/fees', authMiddleware, subscriptionGuard, feeRoutes);

module.exports = router;