const express           = require('express');
const router            = express.Router();
const batchController   = require('./batch.controller');
const { csrfProtect }   = require('../../../middlewares/csrf.middleware');

// ── GET routes ────────────────────────────────────────────────
router.get('/',           batchController.getBatchesPage);
router.get('/new',        batchController.getAddBatchPage);
router.get('/:id',        batchController.getBatchDetailPage);
router.get('/:id/edit',   batchController.getEditBatchPage);

// ── POST routes ───────────────────────────────────────────────
router.post('/create',              csrfProtect, batchController.createBatch);
router.post('/:id/update',          csrfProtect, batchController.updateBatch);
router.post('/:id/toggle',          csrfProtect, batchController.toggleStatus);
router.post('/:id/delete',          csrfProtect, batchController.deleteBatch);
router.post('/:id/enrol',           csrfProtect, batchController.enrolStudent);
router.post('/:id/remove/:studentId', csrfProtect, batchController.removeStudent);

module.exports = router;