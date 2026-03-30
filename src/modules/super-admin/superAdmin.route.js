const express = require('express');
const router  = express.Router();
const ctrl    = require('./superAdmin.controller');

// Note: authMiddleware + superAdminMiddleware already applied
// in index.route.js before this router — no need to repeat here

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', ctrl.dashboard);

// ── Tenants list (with search + filters) ─────────────────────
router.get('/tenants', ctrl.tenantsList);

// ── Single tenant detail page ─────────────────────────────────
router.get('/tenants/:id', ctrl.tenantDetail);

// ── Tenant actions (all AJAX / JSON) ─────────────────────────
router.post('/tenants/:id/activate',    ctrl.activateTenant);
router.post('/tenants/:id/suspend',     ctrl.suspendTenant);
router.post('/tenants/:id/delete',      ctrl.deleteTenant);
router.post('/tenants/:id/extend',      ctrl.extendSubscription);
router.post('/tenants/:id/change-plan', ctrl.changePlan);

module.exports = router;