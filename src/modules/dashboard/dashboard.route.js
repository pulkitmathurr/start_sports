const express    = require('express');
const router     = express.Router();
const ctrl       = require('./dashboard.controller');
const auth       = require('../../middlewares/auth.middleware');

router.get('/',                auth, ctrl.getDashboard);
router.get('/bookings-by-date', auth, ctrl.getBookingsByDate);
router.post('/approve',        auth, ctrl.approveBooking);
router.post('/reject',         auth, ctrl.rejectBooking);
router.get('/month-bookings', auth, ctrl.getMonthBookings);

module.exports = router;