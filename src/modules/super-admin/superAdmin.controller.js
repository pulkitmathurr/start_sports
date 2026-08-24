const superAdminService = require("./superAdmin.service");
const { successResponse, errorResponse } = require("../../utils/response");

// ── GET /super-admin/dashboard ────────────────────────────────
const dashboard = async (req, res, next) => {
  try {
    const data = await superAdminService.getDashboardStats();
    return res.render("super-admin/dashboard", {
      title: "Super Admin Dashboard",
      activePage: "sa-dashboard",
      data,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /super-admin/tenants ──────────────────────────────────
const tenantsList = async (req, res, next) => {
  try {
    const { status, plan_id, search } = req.query;
    const limit  = 10;
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const [plans, { tenants, total }] = await Promise.all([
      superAdminService.getPlans(),
      superAdminService.getAllTenants({
        status: status || "all",
        plan_id: plan_id || "all",
        search: search || "",
        limit,
        offset,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.render("super-admin/tenants", {
      title: "Manage Tenants",
      activePage: "sa-tenants",
      tenants,
      plans,
      filters: { status, plan_id, search },
      pagination: { currentPage: page, totalPages, totalRecords: total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /super-admin/tenants/:id ──────────────────────────────
const tenantDetail = async (req, res, next) => {
  try {
    const [plans, data] = await Promise.all([
      superAdminService.getPlans(),
      superAdminService.getTenantDetail(req.params.id),
    ]);
    return res.render("super-admin/tenant-detail", {
      title: `Tenant — ${data.tenant.business_name}`,
      activePage: "sa-tenants",
      data,
      plans,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /super-admin/tenants/create ─────────────────────────
const createTenant = async (req, res, next) => {
  try {
    const { name, email, password, business_name, phone, city, plan_id } =
      req.body;
    if (!name || !email || !password || !business_name || !plan_id) {
      return res.status(400).json(errorResponse("All fields are required"));
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json(errorResponse("Password must be at least 8 characters"));
    }
    const result = await superAdminService.createTenant({
      name,
      email,
      password,
      business_name,
      phone,
      city,
      plan_id: parseInt(plan_id),
    });
    return res.json(successResponse("Tenant created successfully", result));
  } catch (err) {
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/activate ────────────────────
const activateTenant = async (req, res, next) => {
  try {
    await superAdminService.activateTenant(req.params.id);
    return res.json(successResponse("Tenant activated successfully"));
  } catch (err) {
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/approve ────────────────────
const approveTenant = async (req, res, next) => {
  try {
    await superAdminService.approveTenant(req.params.id);
    return res.json(successResponse('Tenant approved successfully. They can now log in to their account.'));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json(errorResponse(err.message));
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/reject ─────────────────────
const rejectTenant = async (req, res, next) => {
  try {
    const { reason } = req.body;
    await superAdminService.rejectTenant(req.params.id, { reason: reason || null });
    return res.json(successResponse('Tenant request rejected and account removed.'));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json(errorResponse(err.message));
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/suspend ─────────────────────
const suspendTenant = async (req, res, next) => {
  try {
    const { reason } = req.body;
    await superAdminService.suspendTenant(req.params.id, {
      reason: reason || null,
      admin_user_id: req.user.user_id,
    });
    return res.json(successResponse("Tenant suspended"));
  } catch (err) {
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/delete ─────────────────────
const deleteTenant = async (req, res, next) => {
  try {
    await superAdminService.deleteTenant(req.params.id);
    return res.json(successResponse("Tenant deleted"));
  } catch (err) {
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/extend ─────────────────────
const extendSubscription = async (req, res, next) => {
  try {
    const { extra_days } = req.body;
    if (!extra_days || extra_days < 1)
      return res.status(400).json(errorResponse("Enter valid number of days"));
    await superAdminService.extendSubscription({
      tenant_id: req.params.id,
      extra_days: parseInt(extra_days),
    });
    return res.json(
      successResponse(`Subscription extended by ${extra_days} days`),
    );
  } catch (err) {
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/change-plan ─────────────────
const changePlan = async (req, res, next) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json(errorResponse("Plan required"));
    await superAdminService.changeTenantPlan({
      tenant_id: req.params.id,
      plan_id: parseInt(plan_id),
    });
    return res.json(successResponse("Plan updated successfully"));
  } catch (err) {
    next(err);
  }
};

// ── POST /super-admin/tenants/:id/reset-password ──────────────
const resetPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res
        .status(400)
        .json(errorResponse("Password must be at least 8 characters"));
    }
    await superAdminService.resetTenantPassword(req.params.id, new_password);
    return res.json(successResponse("Password reset successfully"));
  } catch (err) {
    next(err);
  }
};

// ── Plans ─────────────────────────────────────────────────────
const plansList = async (req, res, next) => {
  try {
    const plans = await superAdminService.getPlansWithStats();
    return res.render("super-admin/plans", {
      title: "Manage Plans",
      activePage: "sa-plans",
      plans,
    });
  } catch (err) {
    next(err);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const {
      name,
      price_monthly,
      price_yearly,
      max_grounds,
      max_bookings,
      history_days,
      trial_days,
      is_active,
    } = req.body;
    if (!name || name.trim() === "")
      return res.status(400).json(errorResponse("Plan name is required"));
    await superAdminService.createPlan({
      name: name.trim(),
      price_monthly,
      price_yearly,
      max_grounds,
      max_bookings,
      history_days,
      trial_days,
      is_active,
    });
    return res.json(successResponse("Plan created successfully"));
  } catch (err) {
    next(err);
  }
};

const getPlan = async (req, res, next) => {
  try {
    const plan = await superAdminService.getPlanById(req.params.id);
    if (!plan) return res.status(404).json(errorResponse("Plan not found"));
    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    const {
      name,
      price_monthly,
      price_yearly,
      max_grounds,
      max_bookings,
      history_days,
      trial_days,
      is_active,
    } = req.body;
    if (!name || name.trim() === "")
      return res.status(400).json(errorResponse("Plan name is required"));
    await superAdminService.updatePlan(req.params.id, {
      name: name.trim(),
      price_monthly,
      price_yearly,
      max_grounds,
      max_bookings,
      history_days,
      trial_days,
      is_active,
    });
    return res.json(successResponse("Plan updated successfully"));
  } catch (err) {
    next(err);
  }
};

const deletePlan = async (req, res, next) => {
  try {
    await superAdminService.deletePlan(req.params.id);
    return res.json(successResponse("Plan deleted"));
  } catch (err) {
    next(err);
  }
};

// ── Billing ───────────────────────────────────────────────────
const billingPage = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const limit  = 10;
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const { payments, total } = await superAdminService.getAllPayments({
      status: status || "all",
      search: search || "",
      limit,
      offset,
    });

    const totalPages = Math.ceil(total / limit);

    return res.render("super-admin/billing", {
      title: "Billing & Payments",
      activePage: "sa-billing",
      payments,
      filters: { status, search },
      pagination: { currentPage: page, totalPages, totalRecords: total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
};

const markPayment = async (req, res, next) => {
  try {
    const { payment_status, payment_date, payment_note, payment_mode } =
      req.body;
    if (!payment_status)
      return res.status(400).json(errorResponse("Status required"));
    await superAdminService.markPayment(req.params.sub_id, {
      payment_status,
      payment_date,
      payment_note,
      payment_mode,
      admin_user_id: req.user.user_id,
    });
    return res.json(successResponse("Payment updated"));
  } catch (err) {
    next(err);
  }
};

// ── Logs ──────────────────────────────────────────────────────
const logsPage = async (req, res, next) => {
  try {
    const { tenant_id, action, search, page } = req.query;
    const [{ logs, total, limit }, { tenants }, actionTypes] = await Promise.all([
      superAdminService.getActivityLogs({
        tenant_id: tenant_id || "all",
        action: action || "all",
        search: search || "",
        page: page || 1,
      }),
      superAdminService.getAllTenants({
        status: "all",
        plan_id: "all",
        search: "",
        limit: 1000,
        offset: 0,
      }),
      superAdminService.getLogActionTypes(),
    ]);
    return res.render("super-admin/logs", {
      title: "Activity Logs",
      activePage: "sa-logs",
      logs,
      total,
      limit,
      page: parseInt(page || 1),
      tenants,
      actionTypes,
      filters: { tenant_id, action, search },
    });
  } catch (err) {
    next(err);
  }
};

// ── App Settings ──────────────────────────────────────────────
const settingsPage = async (req, res, next) => {
  try {
    const { rows, map } = await superAdminService.getAppSettings();
    const announcements = await superAdminService.getAnnouncements();
    return res.render("super-admin/settings", {
      title: "App Settings",
      activePage: "sa-settings",
      settings: rows,
      settingsMap: map,
      announcements,
    });
  } catch (err) {
    next(err);
  }
};

const updateSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key)
      return res.status(400).json(errorResponse("Setting key required"));
    await superAdminService.updateAppSetting(key, value, req.user.user_id);
    return res.json(successResponse("Setting updated"));
  } catch (err) {
    next(err);
  }
};

const createAnnouncement = async (req, res, next) => {
  try {
    const { title, message, type, show_from, show_until, is_active } = req.body;
    if (!title || !message)
      return res.status(400).json(errorResponse("Title and message required"));
    await superAdminService.createAnnouncement({
      title,
      message,
      type,
      show_from,
      show_until,
      is_active,
      created_by: req.user.user_id,
    });
    return res.json(successResponse("Announcement created"));
  } catch (err) {
    next(err);
  }
};

const deleteAnnouncement = async (req, res, next) => {
  try {
    await superAdminService.deleteAnnouncement(req.params.id);
    return res.json(successResponse("Announcement deleted"));
  } catch (err) {
    next(err);
  }
};

// ── GET /super-admin/tenants/:id/customers ────────────────────
const getTenantCustomers = async (req, res, next) => {
  try {
    const customers = await superAdminService.getTenantCustomers(req.params.id);
    return res.json({ success: true, customers });
  } catch (err) {
    next(err);
  }
};
// ── GET /super-admin/profile ──────────────────────────────────
const profilePage = async (req, res, next) => {
    try {
        const [profileData, sessions] = await Promise.all([
            superAdminService.getSuperAdminProfile(req.user.user_id),
            superAdminService.getSuperAdminSessions(req.user.user_id)
        ]);
        return res.render('super-admin/profile', {
            title: 'My Profile',
            activePage: 'sa-profile',
            profileData,
            sessions
        });
    } catch (err) { next(err); }
};
// ── POST /super-admin/profile/change-password ─────────────────
const changePassword = async (req, res, next) => {
    try {
        const { current_password, new_password, confirm_password } = req.body;
        if (!current_password || !new_password || !confirm_password)
            return res.status(400).json(errorResponse('All fields are required'));
        if (new_password.length < 8)
            return res.status(400).json(errorResponse('New password must be at least 8 characters'));
        if (new_password !== confirm_password)
            return res.status(400).json(errorResponse('Passwords do not match'));

        await superAdminService.changeSuperAdminPassword(req.user.user_id, current_password, new_password);

        // Clear the SA cookie — they must log in again with new password
        res.clearCookie('sa_access_token', { path: '/super-admin' });
        return res.json(successResponse('Password changed. Please log in again.'));
    } catch (err) { next(err); }
};
// ── POST /super-admin/profile/terminate-sessions ──────────────
const terminateSessions = async (req, res, next) => {
    try {
        // Grab the current session_id from the session lookup
        // It was stored on req.session_id by auth middleware — we use user_id + cookie to find it
        const access_token = req.cookies?.sa_access_token;
        const { hashToken } = require('../auth/auth.service');
        const hash = hashToken(access_token);

        const [[currentSession]] = await db.promise().query(
            'SELECT session_id FROM tbl_sessions WHERE access_token = ? LIMIT 1', [hash]
        );
        const current_session_id = currentSession?.session_id || '';

        const count = await superAdminService.terminateOtherSessions(req.user.user_id, current_session_id);
        return res.json(successResponse(`${count} other session(s) terminated`));
    } catch (err) { next(err); }
};

// ── Reports Page ──────────────────────────────────────────────
const reportsPage = async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const data = await superAdminService.getReportData({
            from_date: from || null,
            to_date:   to   || null,
        });
        return res.render('super-admin/reports', {
            title:       'Platform Reports',
            activePage:  'sa-reports',
            data,
            filters: { from: from || '', to: to || '' },
        });
    } catch (err) { next(err); }
};

module.exports = {
  dashboard,
  tenantsList,
  tenantDetail,
  createTenant,
  activateTenant,
  approveTenant,
  rejectTenant,
  suspendTenant,
  deleteTenant,
  extendSubscription,
  changePlan,
  resetPassword,
  plansList,
  createPlan,
  getPlan,
  updatePlan,
  deletePlan,
  billingPage,
  markPayment,
  logsPage,
  getTenantCustomers,
  settingsPage,
  updateSetting,
  createAnnouncement,
  deleteAnnouncement,
  profilePage,
  changePassword,
  terminateSessions,
  reportsPage,
};