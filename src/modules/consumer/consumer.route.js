const express = require('express');
const router  = express.Router();
const consumerController = require('./consumer.controller');
const consumerValidator  = require('./consumer.validator');

// ── No auth middleware — all routes are public ────


// ══════════════════════════════════════════════════
// EXISTING APIS 
// ══════════════════════════════════════════════════

// GET /api/ground
router.get('/ground', consumerController.getGroundInfo);

// GET /api/dates
router.get('/dates', consumerController.getAvailableDates);

// GET /api/slots?date=2026-03-21
router.get('/slots',
    consumerValidator.validate('getSlots'),
    consumerController.getSlots
);

// POST /api/bookings
router.post('/bookings',
    consumerValidator.validate('submitBooking'),
    consumerController.submitBooking
);

// GET /api/bookings/status?booking_no=&customer_phone=
router.get('/bookings/status',
    consumerValidator.validate('getStatus'),
    consumerController.getBookingStatus
);


// ════════════════════════
// NEW MULTI-GROUND APIS
// ════════════════════════

// GET /api/grounds
// Returns: all active grounds with images, timings, pricing
router.get('/grounds', consumerController.getGrounds);

// GET /api/grounds/:id/dates
// Returns: bookable dates for a specific ground
router.get('/grounds/:id/dates', consumerController.getGroundDates);

// GET /api/grounds/:id/slots?date=2026-03-21
// Returns: slots for a specific ground on a date with availability
router.get('/grounds/:id/slots', consumerController.getGroundSlots);

// POST /api/grounds/bookings
// Body: { ground_id, slot_id, slot_date, customer_name, customer_phone, customer_email?, notes? }
router.post('/grounds/bookings',
    consumerValidator.validate('submitGroundBooking'),
    consumerController.submitGroundBooking
);

module.exports = router;