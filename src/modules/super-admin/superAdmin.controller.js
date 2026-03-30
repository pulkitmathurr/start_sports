const superAdminService = require('./superAdmin.service');
const { successResponse, errorResponse } = require('../../utils/response');

// ── GET /super-admin/dashboard ────────────────────────────────
const dashboard = async (req, res, next) => {
    try {
        const data = await superAdminService.getDashboardStats();
        return res.render('super-admin/dashboard', {
            title:      'Super Admin Dashboard',
            activePage: 'sa-dashboard',
            data
        });
    } catch (err) { next(err); }
};

// ── GET /super-admin/tenants ──────────────────────────────────
const tenantsList = async (req, res, next) => {
    try {
        const { status, plan_id, search } = req.query;
        const plans   = await superAdminService.getPlans();
        const tenants = await superAdminService.getAllTenants({
            status:  status  || 'all',
            plan_id: plan_id || 'all',
            search:  search  || ''
        });

        return res.render('super-admin/tenants', {
            title:      'Manage Tenants',
            activePage: 'sa-tenants',
            tenants,
            plans,
            filters: { status, plan_id, search }
        });
    } catch (err) { next(err); }
};

// ── GET /super-admin/tenants/:id ──────────────────────────────
const tenantDetail = async (req, res, next) => {
    try {
        const plans = await superAdminService.getPlans();
        const data  = await superAdminService.getTenantDetail(req.params.id);
        return res.render('super-admin/tenant-detail', {
            title:      `Tenant — ${data.tenant.business_name}`,
            activePage: 'sa-tenants',
            data,
            plans
        });
    } catch (err) { next(err); }
};

// ── POST /super-admin/tenants/:id/activate ────────────────────
const activateTenant = async (req, res, next) => {
    try {
        await superAdminService.activateTenant(req.params.id);
        return res.json(successResponse('Tenant activated successfully'));
    } catch (err) { next(err); }
};

// ── POST /super-admin/tenants/:id/suspend ─────────────────────
const suspendTenant = async (req, res, next) => {
    try {
        await superAdminService.suspendTenant(req.params.id);
        return res.json(successResponse('Tenant suspended'));
    } catch (err) { next(err); }
};

// ── POST /super-admin/tenants/:id/delete ─────────────────────
const deleteTenant = async (req, res, next) => {
    try {
        await superAdminService.deleteTenant(req.params.id);
        return res.json(successResponse('Tenant deleted'));
    } catch (err) { next(err); }
};

// ── POST /super-admin/tenants/:id/extend ─────────────────────
const extendSubscription = async (req, res, next) => {
    try {
        const { extra_days } = req.body;
        if (!extra_days || extra_days < 1) {
            return res.status(400).json(errorResponse('Enter valid number of days'));
        }
        await superAdminService.extendSubscription({
            tenant_id:  req.params.id,
            extra_days: parseInt(extra_days)
        });
        return res.json(successResponse(`Subscription extended by ${extra_days} days`));
    } catch (err) { next(err); }
};

// ── POST /super-admin/tenants/:id/change-plan ─────────────────
const changePlan = async (req, res, next) => {
    try {
        const { plan_id } = req.body;
        if (!plan_id) return res.status(400).json(errorResponse('Plan required'));
        await superAdminService.changeTenantPlan({
            tenant_id: req.params.id,
            plan_id:   parseInt(plan_id)
        });
        return res.json(successResponse('Plan updated successfully'));
    } catch (err) { next(err); }
};

module.exports = {
    dashboard,
    tenantsList,
    tenantDetail,
    activateTenant,
    suspendTenant,
    deleteTenant,
    extendSubscription,
    changePlan
};