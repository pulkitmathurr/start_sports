const consumerService = require('./consumer.service');
const { successResponse } = require('../../utils/response');

// ══════════════════════════════════════════════════
// LEGACY SINGLE-GROUND APIs (kept for backward compat)
// ══════════════════════════════════════════════════

// ── GET /api/ground ──
const getGroundInfo = async (req, res, next) => {
    try {
        const info = await consumerService.getGroundInfo();
        return res.status(200).json(successResponse('Ground info fetched', info));
    } catch (error) { next(error); }
};

// ── GET /api/dates ──
const getAvailableDates = async (req, res, next) => {
    try {
        const dates = await consumerService.getAvailableDates();
        return res.status(200).json(successResponse('Available dates fetched', { dates }));
    } catch (error) { next(error); }
};

// ── GET /api/slots?date=YYYY-MM-DD ──
const getSlots = async (req, res, next) => {
    try {
        const { date } = req.query;
        const slots = await consumerService.getSlotsForDate(date);
        return res.status(200).json(successResponse('Slots fetched', { date, slots }));
    } catch (error) { next(error); }
};

// ── POST /api/bookings ──
const submitBooking = async (req, res, next) => {
    try {
        const result = await consumerService.submitBooking({
            slot_id:        req.body.slot_id,
            slot_date:      req.body.slot_date,
            customer_name:  req.body.customer_name,
            customer_phone: req.body.customer_phone,
            customer_email: req.body.customer_email,
            notes:          req.body.notes
        });
        return res.status(201).json(successResponse('Booking request submitted successfully', result));
    } catch (error) { next(error); }
};

// ── GET /api/bookings/status ──
const getBookingStatus = async (req, res, next) => {
    try {
        const result = await consumerService.getBookingStatus({
            booking_no:     req.query.booking_no,
            customer_phone: req.query.customer_phone
        });
        return res.status(200).json(successResponse('Booking status fetched', result));
    } catch (error) { 
        next(error);
     }
};

// ══════════════════════════════════════════════════
// NEW MULTI-GROUND + SLUG-BASED TENANT APIs
// Routes below use resolveTenant middleware which
// attaches req.consumer_tenant_id from the slug
// ══════════════════════════════════════════════════

// ── GET /api/tenant/:slug ──
// Frontend calls this first to verify slug and get tenant display info
const getTenantInfo = async (req, res, next) => {
    try {
        const info = await consumerService.getTenantInfo(req.params.slug);
        return res.status(200).json(successResponse('Tenant info fetched', info));
    } catch (error) { next(error); }
};

// ── GET /api/grounds ── (requires x-tenant-slug header or ?slug=)
// Returns all active grounds for this tenant
const getGrounds = async (req, res, next) => {
    try {
        const grounds = await consumerService.getAllActiveGrounds(req.consumer_tenant_id);
        return res.status(200).json(successResponse('Grounds fetched', {
            tenant: req.consumer_tenant,
            grounds
        }));
    } catch (error) { 
        next(error); 
    }
};

// ── GET /api/grounds/:id/dates ──
const getGroundDates = async (req, res, next) => {
    try {
        const dates = await consumerService.getAvailableDatesForGround(
            req.params.id,
            req.consumer_tenant_id
        );
        return res.status(200).json(successResponse('Available dates fetched', { dates }));
    } catch (error) { next(error); }
};

// ── GET /api/grounds/:id/slots?date=YYYY-MM-DD ──
const getGroundSlots = async (req, res, next) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(422).json({ success: false, message: 'date is required' });
        }
        const slots = await consumerService.getSlotsForGroundDate(
            req.params.id,
            date,
            req.consumer_tenant_id
        );
        return res.status(200).json(successResponse('Slots fetched', {
            ground_id: parseInt(req.params.id),
            date,
            slots
        }));
    } catch (error) { next(error); }
};

// ── POST /api/grounds/bookings ──
const submitGroundBooking = async (req, res, next) => {
    try {
        const result = await consumerService.submitGroundBooking({
            ground_id:      req.body.ground_id,
            slot_id:        req.body.slot_id,
            slot_date:      req.body.slot_date,
            customer_name:  req.body.customer_name,
            customer_phone: req.body.customer_phone,
            customer_email: req.body.customer_email,
            notes:          req.body.notes,
            tenant_id:      req.consumer_tenant_id
        });
        return res.status(201).json(successResponse('Booking request submitted successfully', result));
    } catch (error) { next(error); }
};

module.exports = {
    getGroundInfo,
    getAvailableDates,
    getSlots,
    submitBooking,
    getBookingStatus,
    getTenantInfo,
    getGrounds,
    getGroundDates,
    getGroundSlots,
    submitGroundBooking
};