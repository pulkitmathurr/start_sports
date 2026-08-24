const customerService = require('./customer.service');
const { successResponse } = require('../../utils/response');

// ── GET /customers ─────────────────────────────────────────────────────
const getCustomersPage = async (req, res, next) => {
    try {
        const search   = req.query.search   || null;
        const sort_by  = req.query.sort_by  || null;
        const page     = parseInt(req.query.page)  || 1;
        const limit    = parseInt(req.query.limit) || 10;
        const offset   = (page - 1) * limit;

        const customers = await customerService.getAllCustomers({ 
            search, sort_by, limit, offset,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        
        const totalRecords = await customerService.getTotalCustomersCount({ 
            search,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        
        const totalPages = Math.ceil(totalRecords / limit);

        // ── JSON response for real-time search ──
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json({
                success: true,
                customers,
                pagination: { currentPage: page, totalPages, totalRecords, limit }
            });
        }

        return res.render('customers/index', {
            title: 'Customers', activePage: 'customers',
            customers, search, sort_by,
            pagination: { currentPage: page, totalPages, totalRecords, limit },
            tenant: req.tenant
        });
    } catch (error) { next(error); }
};

// ── GET /customers/:customerId ─────────────────────────────────────────
const getCustomerProfilePage = async (req, res, next) => {
    try {
        const customer_id = req.params.customerId;
        const status      = req.query.status    || null;
        const date_from   = req.query.date_from || null;
        const date_to     = req.query.date_to   || null;
        const search      = req.query.search    || null;
        const page        = parseInt(req.query.page)  || 1;
        const limit       = parseInt(req.query.limit) || 10;
        const offset      = (page - 1) * limit;

        // ADD TENANT INFO TO SERVICE CALLS
        const { customer, bookings, stats } = await customerService.getCustomerHistory({
            customer_id, 
            status, 
            date_from, 
            date_to, 
            search, 
            limit, 
            offset,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        const totalRecords = await customerService.getCustomerHistoryCount({
            customer_id, 
            status, 
            date_from, 
            date_to, 
            search,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        
        const totalPages = Math.ceil(totalRecords / limit);

        return res.render('customers/profile', {
            title:      `${customer.name} — History`,
            activePage: 'customers',
            customer,
            bookings,
            stats,
            filters:    { status, date_from, date_to, search },
            pagination: { currentPage: page, totalPages, totalRecords, limit },
            tenant: req.tenant
        });
    } catch (error) { next(error); }
};

// ── POST /customers/:customerId/address ───────────────────────────────
const updateAddress = async (req, res, next) => {
    try {
        await customerService.updateCustomerAddress({
            customer_id: req.params.customerId,
            address:     req.body.address,
            tenant_id:   req.tenant ? req.tenant.id : null,
            user_role:   req.user.role
        });
        return res.status(200).json(successResponse('Address updated successfully'));
    } catch (error) { next(error); }
};

// ── GET /customers/search?q= ───────────────────────────────────────────
const searchCustomers = async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 1) return res.json({ success: true, customers: [] });

        const customers = await customerService.searchCustomers(
            q,
            req.tenant ? req.tenant.id : null
        );
        return res.json({ success: true, customers });
    } catch (error) { next(error); }
};

// ── POST /customers — manually create customer ────────────────────────
const createCustomer = async (req, res, next) => {
    try {
        const { name, phone, email } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
        if (!phone || !phone.trim()) return res.status(400).json({ success: false, message: 'Phone number is required' });

        const result = await customerService.createCustomer({
            name,
            phone,
            email,
            tenant_id: req.tenant ? req.tenant.id : null
        });
        return res.status(201).json({ success: true, message: 'Customer created successfully', customer: result });
    } catch (error) {
        if (error.code === 'DUPLICATE_PHONE') {
            return res.status(409).json({ success: false, message: error.message });
        }
        next(error);
    }
};


// ── PUT /customers/:customerId — edit name, email, address ────────────
const updateCustomer = async (req, res, next) => {
    try {
        const { name, email, address } = req.body;
        await customerService.updateCustomer({
            customer_id: req.params.customerId,
            name, email, address,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });
        return res.json({ success: true, message: 'Customer updated successfully' });
    } catch (error) {
        if (error.code === 'VALIDATION') return res.status(400).json({ success: false, message: error.message });
        if (error.statusCode === 404) return res.status(404).json({ success: false, message: error.message });
        next(error);
    }
};

module.exports = { getCustomersPage, getCustomerProfilePage, updateAddress, searchCustomers, createCustomer, updateCustomer };