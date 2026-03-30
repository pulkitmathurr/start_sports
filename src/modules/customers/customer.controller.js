const customerService = require('./customer.service');
const { successResponse } = require('../../utils/response');

// ── GET /customers ─────────────────────────────────────────────────────
const getCustomersPage = async (req, res, next) => {
    try {
        const search = req.query.search || null;
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const customers    = await customerService.getAllCustomers({ search, limit, offset });
        const totalRecords = await customerService.getTotalCustomersCount({ search });
        const totalPages   = Math.ceil(totalRecords / limit);

        return res.render('customers/index', {
            title:      'Customers',
            activePage: 'customers',
            customers,
            search,
            pagination: { currentPage: page, totalPages, totalRecords, limit }
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

        const { customer, bookings, stats } = await customerService.getCustomerHistory({
            customer_id, status, date_from, date_to, search, limit, offset
        });

        const totalRecords = await customerService.getCustomerHistoryCount({
            customer_id, status, date_from, date_to, search
        });
        const totalPages = Math.ceil(totalRecords / limit);

        return res.render('customers/profile', {
            title:      `${customer.name} — History`,
            activePage: 'customers',
            customer,
            bookings,
            stats,
            filters:    { status, date_from, date_to, search },
            pagination: { currentPage: page, totalPages, totalRecords, limit }
        });
    } catch (error) { next(error); }
};

// ── POST /customers/:customerId/address ───────────────────────────────
const updateAddress = async (req, res, next) => {
    try {
        await customerService.updateCustomerAddress({
            customer_id: req.params.customerId,
            address:     req.body.address
        });
        return res.status(200).json(successResponse('Address updated successfully'));
    } catch (error) { next(error); }
};

module.exports = { getCustomersPage, getCustomerProfilePage, updateAddress };