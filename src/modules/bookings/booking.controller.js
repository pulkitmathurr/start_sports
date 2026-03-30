const bookingService  = require('./booking.service');
const { successResponse } = require('../../utils/response');

// ── Get Bookings Page ─────────────────────────────
const getBookingsPage = async (req, res, next) => {
    try {
        const status   = req.query.status || null;
        const payment_status = req.query.payment_status || null;  // Add this line
        const search   = req.query.search || null;
        const page     = parseInt(req.query.page) || 1;
        const limit    = parseInt(req.query.limit) || 10;
        const offset   = (page - 1) * limit;

        const _n    = new Date();
        const today = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(2, '0')}-${String(_n.getDate()).padStart(2, '0')}`;

        // Update this line to include payment_status
        const bookings = await bookingService.getAllBookings({ status, payment_status, search, limit, offset, date: today });

        // Update this line to include payment_status
        const totalRecords = await bookingService.getTotalBookingsCount({ status, payment_status, search, date: today });
        const totalPages = Math.ceil(totalRecords / limit);

        const stats = await bookingService.getTodayStats();

        const buildPaginationUrl = (pageNum) => {
            const params = new URLSearchParams();
            if (status) params.append('status', status);
            if (payment_status) params.append('payment_status', payment_status);  // Add this line
            if (search) params.append('search', search);
            if (limit) params.append('limit', limit);
            params.append('page', pageNum);
            return `/bookings?${params.toString()}`;
        };

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

        return res.render('bookings/index', {
            title:      'Bookings',
            activePage: 'bookings',
            bookings,
            stats,
            filters: { status, payment_status, search },  // Add payment_status here
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalRecords: totalRecords,
                limit: limit,
                offset: offset
            },
            buildPaginationUrl
        });
    } catch (error) {
        next(error);
    }
};

// ── Get Slots for Date (AJAX) ─────────────────────
const getSlotsForDate = async (req, res, next) => {
    try {
        const { date } = req.query;
        const slots    = await bookingService.getSlotsForDate(date);
        return res.status(200).json(successResponse('Slots fetched', slots));
    } catch (error) {
        next(error);
    }
};

// ── Create Booking (Online Request) ──────────────
const createBooking = async (req, res, next) => {
    try {
        const result = await bookingService.createBooking({
            slot_id:        req.body.slot_id,
            slot_date:      req.body.slot_date,
            start_time:     req.body.start_time,
            end_time:       req.body.end_time,
            customer_name:  req.body.customer_name,
            customer_phone: req.body.customer_phone,
            customer_email: req.body.customer_email,
            notes:          req.body.notes
        });
        return res.status(201).json(successResponse('Booking request submitted', result));
    } catch (error) {
        next(error);
    }
};

// ── Quick Book (Admin — Phone / Walk-in) ──────────
const quickBook = async (req, res, next) => {
    try {
        const result = await bookingService.quickBook({
            ground_id:       req.body.ground_id,
            slot_id:         req.body.slot_id,
            slot_date:       req.body.slot_date,
            start_time:      req.body.start_time,
            end_time:        req.body.end_time,
            customer_name:   req.body.customer_name,
            customer_phone:  req.body.customer_phone,
            customer_email:  req.body.customer_email,
            booking_type:    req.body.booking_type,
            advance_amount:  req.body.advance_amount,
            payment_mode:    req.body.payment_mode,
            notes:           req.body.notes,
            discount_type:   req.body.discount_type,
            discount_value:  req.body.discount_value,
            surcharge_amount: req.body.surcharge_amount,
            surcharge_note:  req.body.surcharge_note,
            custom_price:    req.body.custom_price,
            pricing_note:    req.body.pricing_note
        });
        return res.status(201).json(successResponse('Booking confirmed', result));
    } catch (error) {
        next(error);
    }
};

// ── Get Booking Detail Page ───────────────────────
const getBookingDetailPage = async (req, res, next) => {
    try {
        const booking_id          = req.params.id;
        const { booking, payments } = await bookingService.getBookingById({ booking_id });
        const settings            = await bookingService.getSettings();

        return res.render('bookings/detail', {
            title:      `Booking ${booking.booking_no}`,
            activePage: 'bookings',
            booking,
            payments,
            settings
        });
    } catch (error) {
        next(error);
    }
};

// ── Approve Booking ───────────────────────────────
const approveBooking = async (req, res, next) => {
    try {
        const result = await bookingService.approveBooking({ booking_id: req.body.booking_id });
        return res.status(200).json(successResponse('Booking approved', { deadline: result.deadline }));
    } catch (error) {
        next(error);
    }
};

// ── Reject Booking ────────────────────────────────
const rejectBooking = async (req, res, next) => {
    try {
        await bookingService.rejectBooking({
            booking_id: req.body.booking_id,
            reason:     req.body.reason
        });
        return res.status(200).json(successResponse('Booking rejected'));
    } catch (error) {
        next(error);
    }
};

// ── Record Payment ────────────────────────────────
const recordPayment = async (req, res, next) => {
    try {
        await bookingService.recordPayment({
            booking_id:   req.body.booking_id,
            amount:       req.body.amount,
            payment_mode: req.body.payment_mode,
            payment_type: req.body.payment_type
        });
        return res.status(200).json(successResponse('Payment recorded'));
    } catch (error) {
        next(error);
    }
};

// ── Update Booking ────────────────────────────────
const updateBooking = async (req, res, next) => {
    try {
        await bookingService.updateBooking({
            booking_id:     req.body.booking_id,
            customer_name:  req.body.customer_name,
            customer_phone: req.body.customer_phone,
            customer_email: req.body.customer_email,
            booking_type:   req.body.booking_type,
            notes:          req.body.notes
        });
        return res.status(200).json(successResponse('Booking updated successfully'));
    } catch (error) {
        next(error);
    }
};

// ── Cancel Booking ────────────────────────────────
const cancelBooking = async (req, res, next) => {
    try {
        await bookingService.cancelBooking({ booking_id: req.body.booking_id });
        return res.status(200).json(successResponse('Booking cancelled'));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getBookingsPage,
    getSlotsForDate,
    createBooking,
    quickBook,
    getBookingDetailPage,
    approveBooking,
    rejectBooking,
    recordPayment,
    cancelBooking,
    updateBooking
};