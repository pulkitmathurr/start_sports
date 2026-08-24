const bookingService  = require('./booking.service');
const { successResponse } = require('../../utils/response');
const { calculatePrice, getGroundPricingConfig } = require('../../utils/pricing');
const db = require('../../config/db.config');

// ── Get Bookings Page ─────────────────────────────
const getBookingsPage = async (req, res, next) => {
    try {
        const status         = req.query.status || null;
        const payment_status = req.query.payment_status || null;
        const search         = req.query.search || null;
        const page           = parseInt(req.query.page) || 1;
        const limit          = parseInt(req.query.limit) || 10;
        const offset         = (page - 1) * limit;

        const _n    = new Date();
        const today = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(2, '0')}-${String(_n.getDate()).padStart(2, '0')}`;

        // Accept date from query param (e.g. from dashboard calendar click)
        // Fall back to today if not provided or invalid
        const rawDate   = req.query.date || '';
        const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
        const isToday   = dateParam === today;

        const bookings = await bookingService.getAllBookings({
            status, payment_status, search, limit, offset,
            date: dateParam,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        const totalRecords = await bookingService.getTotalBookingsCount({
            status, payment_status, search,
            date: dateParam,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        const totalPages = Math.ceil(totalRecords / limit);
        const stats = await bookingService.getTodayStats(
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json({
                success: true,
                bookings,
                pagination: { currentPage: page, totalPages, totalRecords, limit }
            });
        }

        const buildPaginationUrl = (pageNum) => {
            const params = new URLSearchParams();
            if (status)         params.append('status', status);
            if (payment_status) params.append('payment_status', payment_status);
            if (search)         params.append('search', search);
            if (limit)          params.append('limit', limit);
            if (!isToday)       params.append('date', dateParam);
            params.append('page', pageNum);
            return `/bookings?${params.toString()}`;
        };

        // Format display date for title
        const displayDate = isToday ? 'Today' : new Date(dateParam + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

        return res.render('bookings/index', {
            title:      `${displayDate}'s Bookings`,
            activePage: 'bookings',
            bookings, stats,
            filters: { status, payment_status, search },
            pagination: { currentPage: page, totalPages, totalRecords, limit, offset },
            selectedDate: dateParam,
            isToday,
            displayDate,
            buildPaginationUrl,
            tenant: req.tenant
        });
    } catch (error) { next(error); }
};

// ── Get Slots for Date (AJAX) ─────────────────────
// ── Create Booking (Online Request) ──────────────
const createBooking = async (req, res, next) => {
    try {
        let tenantId = req.tenant ? req.tenant.id : null;
        if (!tenantId && req.user.role === 'super_admin') {
            const db = require('../../config/db.config');
            const [tenants] = await db.promise().query('SELECT id FROM tbl_tenants LIMIT 1');
            if (tenants.length > 0) tenantId = tenants[0].id;
        }
        const result = await bookingService.createBooking({
            slot_id: req.body.slot_id, slot_date: req.body.slot_date,
            start_time: req.body.start_time, end_time: req.body.end_time,
            customer_name: req.body.customer_name, customer_phone: req.body.customer_phone,
            customer_email: req.body.customer_email, notes: req.body.notes,
            tenant_id: tenantId
        });
        return res.status(201).json(successResponse('Booking request submitted', result));
    } catch (error) { next(error); }
};

// ── Quick Book (Admin) ────────────────────────────
const quickBook = async (req, res, next) => {
    try {
        let tenantId = req.tenant ? req.tenant.id : null;
        if (!tenantId && req.user.role === 'super_admin') {
            const db = require('../../config/db.config');
            const [tenants] = await db.promise().query('SELECT id FROM tbl_tenants LIMIT 1');
            if (tenants.length > 0) tenantId = tenants[0].id;
        }
        const result = await bookingService.quickBook({
            ground_id: req.body.ground_id, slot_id: req.body.slot_id,
            slot_date: req.body.slot_date, start_time: req.body.start_time,
            end_time: req.body.end_time, customer_name: req.body.customer_name,
            customer_phone: req.body.customer_phone, customer_email: req.body.customer_email,
            booking_type: req.body.booking_type, advance_amount: req.body.advance_amount,
            payment_mode: req.body.payment_mode, notes: req.body.notes,
            discount_type: req.body.discount_type, discount_value: req.body.discount_value,
            surcharge_amount: req.body.surcharge_amount, surcharge_note: req.body.surcharge_note,
            custom_price: req.body.custom_price, pricing_note: req.body.pricing_note,
            tenant_id: tenantId
        });
        return res.status(201).json(successResponse('Booking confirmed', {
            booking_id: result.booking_id, booking_no: result.booking_no,
            customer_name: req.body.customer_name, customer_phone: req.body.customer_phone,
            slot_date: req.body.slot_date, start_time: req.body.start_time,
            end_time: req.body.end_time, total_amount: result.total_amount,
            advance_amount: parseFloat(req.body.advance_amount) || 0,
            balance_amount: result.balance_amount, booking_type: req.body.booking_type,
            payment_status: result.payment_status, booking_status: 'confirmed'
        }));
    } catch (error) { next(error); }
};

// ── Get Booking Detail Page ───────────────────────
const getBookingDetailPage = async (req, res, next) => {
    try {
        const booking_id = req.params.id;
        const { booking, payments } = await bookingService.getBookingById({
            booking_id,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        const settings = await bookingService.getSettings();
        return res.render('bookings/detail', {
            title: `Booking ${booking.booking_no}`,
            activePage: 'bookings',
            booking, payments, settings
        });
    } catch (error) { next(error); }
};

// ── Approve Booking ───────────────────────────────
const approveBooking = async (req, res, next) => {
    try {
        const result = await bookingService.approveBooking({
            booking_id: req.body.booking_id,
            tenant_id:  req.tenant ? req.tenant.id : null,
            user_role:  req.user.role
        });
        return res.status(200).json(successResponse('Booking approved', { deadline: result.deadline }));
    } catch (error) { next(error); }
};

// ── Reject Booking ────────────────────────────────
const rejectBooking = async (req, res, next) => {
    try {
        await bookingService.rejectBooking({
            booking_id: req.body.booking_id, reason: req.body.reason,
            tenant_id:  req.tenant ? req.tenant.id : null,
            user_role:  req.user.role
        });
        return res.status(200).json(successResponse('Booking rejected'));
    } catch (error) { next(error); }
};

// ── Record Payment ────────────────────────────────
const recordPayment = async (req, res, next) => {
    try {
        await bookingService.recordPayment({
            booking_id: req.body.booking_id, amount: req.body.amount,
            payment_mode: req.body.payment_mode, payment_type: req.body.payment_type,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        return res.status(200).json(successResponse('Payment recorded'));
    } catch (error) { next(error); }
};

// ── Update Booking ────────────────────────────────
const updateBooking = async (req, res, next) => {
    try {
        await bookingService.updateBooking({
            booking_id: req.body.booking_id, customer_name: req.body.customer_name,
            customer_phone: req.body.customer_phone, customer_email: req.body.customer_email,
            booking_type: req.body.booking_type, notes: req.body.notes,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        return res.status(200).json(successResponse('Booking updated successfully'));
    } catch (error) { next(error); }
};

// ── Cancel Booking ────────────────────────────────
const cancelBooking = async (req, res, next) => {
    try {
        await bookingService.cancelBooking({
            booking_id: req.body.booking_id,
            tenant_id:  req.tenant ? req.tenant.id : null,
            user_role:  req.user.role
        });
        return res.status(200).json(successResponse('Booking cancelled'));
    } catch (error) { next(error); }
};

// ── Delete Booking (soft) ─────────────────────────
const deleteBooking = async (req, res, next) => {
    try {
        await bookingService.deleteBooking({
            booking_id: req.body.booking_id,
            tenant_id:  req.tenant ? req.tenant.id : null,
            user_role:  req.user.role
        });
        return res.status(200).json(successResponse('Booking deleted'));
    } catch (error) { next(error); }
};

// ── Bulk Book Page ────────────────────────────────
const getBulkBookPage = async (req, res, next) => {
    try {
        const db = require('../../config/db.config');
        const tenant_id = req.tenant ? req.tenant.id : null;
        let query = 'SELECT id, name FROM tbl_grounds WHERE flag = 0 AND status = ?';
        const params = ['active'];
        if (req.user.role === 'admin' && tenant_id) { query += ' AND tenant_id = ?'; params.push(tenant_id); }
        const [grounds] = await db.promise().query(query, params);
        return res.render('bookings/bulk', {
            title: 'Bulk Booking', activePage: 'bookings',
            grounds, tenant: req.tenant
        });
    } catch (err) { next(err); }
};

// ── Bulk Book POST ────────────────────────────────
const bulkBook = async (req, res, next) => {
    try {
        const tenant_id = req.tenant ? req.tenant.id : null;
        const { ground_id, customer_name, customer_phone, customer_email,
                booking_type, payment_mode, advance_amount, notes, slots_by_date } = req.body;

        if (!ground_id || !customer_name || !customer_phone || !slots_by_date || !slots_by_date.length) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        if (slots_by_date.length > 100) {
            return res.status(400).json({ success: false, message: 'Maximum 100 slots per bulk booking.' });
        }

        const result = await bookingService.bulkBook({
            ground_id: parseInt(ground_id),
            customer_name, customer_phone, customer_email,
            booking_type: booking_type || 'phone',
            payment_mode: payment_mode || 'cash',
            advance_amount: parseFloat(advance_amount) || 0,
            notes, slots_by_date, tenant_id,
        });
        return res.status(201).json({ success: true, message: `${result.created.length} booking(s) created`, data: result });
    } catch (err) { next(err); }
};

// ── Record Bulk Payment ───────────────────────────
const recordBulkPayment = async (req, res, next) => {
    try {
        const { bulk_booking_id, amount, payment_mode } = req.body;
        if (!bulk_booking_id || !amount || !payment_mode) {
            return res.status(400).json({ success: false, message: 'bulk_booking_id, amount and payment_mode are required' });
        }
        const result = await bookingService.recordBulkPayment({
            bulk_booking_id,
            amount: parseFloat(amount),
            payment_mode,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        return res.status(200).json(successResponse('Payment recorded across bulk booking', result));
    } catch (err) { next(err); }
};

// ── Bulk Booking Detail Page ──────────────────────
const getBulkBookingDetail = async (req, res, next) => {
    try {
        const bulk_booking_id = req.params.bulk_id;
        const tenant_id = req.tenant ? req.tenant.id : null;
        const group = await bookingService.getBulkBookingGroup(
            bulk_booking_id, tenant_id, req.user.role
        );
        if (!group) return res.status(404).render('404', { title: 'Not Found' });
        const settings = await bookingService.getSettings().catch(() => null);
        return res.render('bookings/bulk-detail', {
            title: `Bulk Booking — ${bulk_booking_id}`,
            activePage: 'bookings',
            group, tenant: req.tenant, settings
        });
    } catch (err) { next(err); }
};


// ── POST /bookings/api/calculate-price ───────────
const calculateBookingPrice = async (req, res, next) => {
    try {
        const { ground_id, start_time, end_time } = req.body;
        if (!ground_id || !start_time || !end_time) {
            return res.status(400).json({ success: false, message: 'ground_id, start_time and end_time are required' });
        }
        const ground = await getGroundPricingConfig(
            db, ground_id,
            req.tenant ? req.tenant.id : null
        );
        const result = calculatePrice({ startTime: start_time, endTime: end_time, ground });
        return res.json({
            success: true,
            data: {
                total_amount    : result.total_amount,
                duration_minutes: result.duration_minutes,
                normal_minutes  : result.normal_minutes,
                peak_minutes    : result.peak_minutes,
                normal_amount   : result.normal_amount,
                peak_amount     : result.peak_amount,
                is_mixed        : result.is_mixed,
                breakdown       : result.breakdown,
                min_slot_minutes: ground.min_slot_minutes,
                normal_rate_per_30: ground.normal_rate_per_30,
                peak_rate_per_30  : ground.peak_rate_per_30,
            }
        });
    } catch (err) {
        if (err.code === 'MIN_SLOT' || err.code === 'OUTSIDE_HOURS' || err.code === 'INVALID_TIME') {
            return res.status(400).json({ success: false, message: err.message, code: err.code });
        }
        next(err);
    }
};

module.exports = {
    getBookingsPage,
    createBooking,
    quickBook,
    calculateBookingPrice,
    getBookingDetailPage,
    approveBooking,
    rejectBooking,
    recordPayment,
    updateBooking,
    cancelBooking,
    deleteBooking,
    getBulkBookPage,
    bulkBook,
    getBulkBookingDetail,
    recordBulkPayment,
};