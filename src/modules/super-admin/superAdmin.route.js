const express = require('express');
const router  = express.Router();
const ctrl    = require('./superAdmin.controller');
const authController = require('../auth/auth.controller');

// authMiddleware + superAdminMiddleware already applied in index.route.js

// ── Keep-alive ────────────────────────────────────────────────
// Called every 10 min from the super admin frontend to slide the
// sa_access_token cookie window and prevent session expiry while
// the admin is working in another browser tab.
router.get('/keepalive', (req, res) => res.json({ ok: true }));

// ── Logout ────────────────────────────────────────────────────
// Must live here (under /super-admin) so authMiddleware reads
// sa_access_token instead of access_token when clearing the session.
router.post('/logout', authController.logout);

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', ctrl.dashboard);

// ── Tenants ───────────────────────────────────────────────────
router.get('/tenants',                   ctrl.tenantsList);
router.post('/tenants/create',           ctrl.createTenant);
router.get('/tenants/:id',               ctrl.tenantDetail);
router.get('/tenants/:id/customers',     ctrl.getTenantCustomers);
router.post('/tenants/:id/activate',     ctrl.activateTenant);
router.post('/tenants/:id/approve',      ctrl.approveTenant);
router.post('/tenants/:id/reject',       ctrl.rejectTenant);
router.post('/tenants/:id/suspend',      ctrl.suspendTenant);
router.post('/tenants/:id/delete',       ctrl.deleteTenant);
router.post('/tenants/:id/extend',       ctrl.extendSubscription);
router.post('/tenants/:id/change-plan',  ctrl.changePlan);
router.post('/tenants/:id/reset-password', ctrl.resetPassword);

// ── Plans ─────────────────────────────────────────────────────
router.get('/plans',               ctrl.plansList);
router.post('/plans/create',       ctrl.createPlan);
router.get('/plans/:id',           ctrl.getPlan);
router.post('/plans/:id/update',   ctrl.updatePlan);
router.post('/plans/:id/delete',   ctrl.deletePlan);

// ── Billing ───────────────────────────────────────────────────
router.get('/billing',                          ctrl.billingPage);
router.post('/billing/:sub_id/mark-payment',    ctrl.markPayment);

// ── Logs ──────────────────────────────────────────────────────
router.get('/logs', ctrl.logsPage);

// ── App Settings ──────────────────────────────────────────────
router.get('/settings',                     ctrl.settingsPage);
router.post('/settings/update',             ctrl.updateSetting);
router.post('/settings/announcements/create',  ctrl.createAnnouncement);
router.post('/settings/announcements/:id/delete', ctrl.deleteAnnouncement);


// ── Reports ───────────────────────────────────────────────────
router.get('/reports', ctrl.reportsPage);

// ── Profile ───────────────────────────────────────────────────
router.get('/profile',                          ctrl.profilePage);
router.post('/profile/change-password',         ctrl.changePassword);
router.post('/profile/terminate-sessions',      ctrl.terminateSessions);

module.exports = router;