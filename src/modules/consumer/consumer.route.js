const express           = require('express');
const router            = express.Router();
const consumerController = require('./consumer.controller');
const consumerValidator  = require('./consumer.validator');
const resolveTenant      = require('../../middlewares/resolveTenant.middleware');

// ── No auth middleware — all routes are public ────

// ══════════════════════════════════════════════════
// LEGACY SINGLE-GROUND APIs
// ══════════════════════════════════════════════════

router.get('/ground', consumerController.getGroundInfo);
router.get('/dates', consumerController.getAvailableDates);
router.get('/slots', consumerValidator.validate('getSlots'), consumerController.getSlots);
router.post('/bookings', consumerValidator.validate('submitBooking'), consumerController.submitBooking);
router.get('/bookings/status', consumerValidator.validate('getStatus'), consumerController.getBookingStatus);

// ══════════════════════════════════════════════════
// NEW SLUG-BASED MULTI-TENANT APIs
//
// Pass the tenant slug as:
//   Header:      x-tenant-slug: start-sports-jaipur
//   Query param: ?slug=start-sports-jaipur
//
// Example full flow:
//   1. GET  /api/tenant/start-sports-jaipur       → get tenant info
//   2. GET  /api/grounds?slug=start-sports-jaipur → get all grounds
//   3. GET  /api/grounds/5/dates?slug=...          → get bookable dates
//   4. GET  /api/grounds/5/slots?date=2026-04-10&slug=... → get slots
//   5. POST /api/grounds/bookings (header: x-tenant-slug) → submit booking
// ══════════════════════════════════════════════════

// GET /api/tenant/:slug — no middleware, slug is in URL
router.get('/tenant/:slug', consumerController.getTenantInfo);

// All grounds routes require slug (header or query param)
router.get('/grounds',           resolveTenant, consumerController.getGrounds);
router.get('/grounds/:id/dates', resolveTenant, consumerController.getGroundDates);
router.get('/grounds/:id/slots', resolveTenant, consumerController.getGroundSlots);
router.post('/grounds/bookings',
    resolveTenant,
    consumerValidator.validate('submitGroundBooking'),
    consumerController.submitGroundBooking
);

module.exports = router;