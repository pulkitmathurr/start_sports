const express = require('express');
const router = express.Router();
const bookingController = require('./booking.controller');
const bookingValidator  = require('./booking.validator');

// Auth is applied in src/routes/index.route.js via authMiddleware + subscriptionGuard

// ── Page Routes ───────────────────────────────────
router.get('/',           bookingController.getBookingsPage);

// ── AJAX Routes — specific routes BEFORE dynamic ─
router.get('/bulk',        bookingController.getBulkBookPage);
router.get('/bulk/:bulk_id', bookingController.getBulkBookingDetail);
router.post('/bulk',           bookingController.bulkBook);
router.post('/bulk/payment',   bookingController.recordBulkPayment);

// ── Dynamic route — must be last GET ─────────────
router.get('/:id', bookingController.getBookingDetailPage);

// ── POST Routes ───────────────────────────────────
router.post('/create',  bookingValidator.validate('createBooking'),  bookingController.createBooking);
router.post('/quick',           bookingValidator.validate('quickBook'), bookingController.quickBook);
router.post('/api/calculate-price',                                    bookingController.calculateBookingPrice);
router.post('/approve', bookingValidator.validate('approveBooking'), bookingController.approveBooking);
router.post('/reject',  bookingValidator.validate('rejectBooking'),  bookingController.rejectBooking);
router.post('/payment', bookingValidator.validate('recordPayment'),  bookingController.recordPayment);
router.post('/cancel',  bookingValidator.validate('cancelBooking'),  bookingController.cancelBooking);
router.post('/bulk/payment', bookingController.recordBulkPayment);
router.post('/delete',  bookingController.deleteBooking);
router.post('/update',  bookingController.updateBooking);
module.exports = router;