const express = require('express');
const router = express.Router();
const bookingController = require('./booking.controller');
const bookingValidator  = require('./booking.validator');
const authMiddleware    = require('../../middlewares/auth.middleware');

// All routes protected
router.use(authMiddleware);

// ── Page Routes ───────────────────────────────────
router.get('/',           bookingController.getBookingsPage);

// ── AJAX Routes — specific routes BEFORE dynamic ─
router.get('/slots', bookingValidator.validate('getSlots'), bookingController.getSlotsForDate);

// ── Dynamic route — must be last GET ─────────────
router.get('/:id', bookingController.getBookingDetailPage);

// ── POST Routes ───────────────────────────────────
router.post('/create',  bookingValidator.validate('createBooking'),  bookingController.createBooking);
router.post('/quick',   bookingValidator.validate('quickBook'),      bookingController.quickBook);
router.post('/approve', bookingValidator.validate('approveBooking'), bookingController.approveBooking);
router.post('/reject',  bookingValidator.validate('rejectBooking'),  bookingController.rejectBooking);
router.post('/payment', bookingValidator.validate('recordPayment'),  bookingController.recordPayment);
router.post('/cancel',  bookingValidator.validate('cancelBooking'),  bookingController.cancelBooking);
router.post('/update',  bookingController.updateBooking);
module.exports = router;