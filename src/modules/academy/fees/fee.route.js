const express         = require('express');
const router          = express.Router();
const feeController   = require('./fee.controller');
const { csrfProtect } = require('../../../middlewares/csrf.middleware');

// ── Fee Plans ─────────────────────────────────────────────────
router.get('/plans',                  feeController.getPlansPage);
router.post('/plans/create',          csrfProtect, feeController.createPlan);
router.post('/plans/:id/update',      csrfProtect, feeController.updatePlan);
router.post('/plans/:id/delete',      csrfProtect, feeController.deletePlan);

// ── Student Fees ──────────────────────────────────────────────
router.get('/',                       feeController.getFeesPage);
router.post('/assign',                csrfProtect, feeController.assignFee);
router.get('/:id',                    feeController.getFeeDetailPage);
router.post('/:id/pay',               csrfProtect, feeController.recordPayment);
router.post('/:id/cancel',            csrfProtect, feeController.cancelFee);

module.exports = router;