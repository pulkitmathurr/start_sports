const db          = require('../../../config/db.config');
const feeService  = require('./fee.service');
const { sendFeeReceiptAlert } = require('../../../services/whatsapp.service');

const errMsg = (err) => (err && err.message) ? err.message : 'Something went wrong';

// ── Fetch active students for dropdown ────────────────────────
const getStudentsForTenant = async (tenant_id, user_role) => {
    let query = `SELECT id, name, phone FROM tbl_academy_students WHERE flag = 0 AND status = 1`;
    const params = [];
    if (user_role === 'admin' && tenant_id) {
        query += ' AND tenant_id = ?';
        params.push(tenant_id);
    }
    query += ' ORDER BY name ASC';
    const [rows] = await db.promise().query(query, params);
    return rows;
};

// ════════════════════════════════════════════════
//  FEE PLANS
// ════════════════════════════════════════════════

// GET /academy/fees/plans
const getPlansPage = async (req, res, next) => {
    try {
        const plans = await feeService.getAllPlans(
            req.tenant ? req.tenant.id : null, req.user.role
        );
        return res.render('academy/fees/plans', {
            title:      'Fee Plans',
            activePage: 'academy-fees',
            plans,
            success:    req.query.success || null,
            error:      req.query.error   || null,
            tenant:     req.tenant,
        });
    } catch (err) { next(err); }
};

// POST /academy/fees/plans/create
const createPlan = async (req, res, next) => {
    try {
        const { plan_name, amount } = req.body;
        if (!plan_name || !plan_name.trim())
            return res.redirect('/academy/fees/plans?error=Plan name is required');
        if (!amount || parseFloat(amount) <= 0)
            return res.redirect('/academy/fees/plans?error=Amount must be greater than 0');
        await feeService.createPlan(req.body, req.tenant ? req.tenant.id : null);
        return res.redirect('/academy/fees/plans?success=Fee plan created');
    } catch (err) {
        return res.redirect(`/academy/fees/plans?error=${encodeURIComponent(errMsg(err))}`);
    }
};

// POST /academy/fees/plans/:id/update
const updatePlan = async (req, res, next) => {
    try {
        const { plan_name, amount } = req.body;
        if (!plan_name || !plan_name.trim())
            return res.redirect('/academy/fees/plans?error=Plan name is required');
        if (!amount || parseFloat(amount) <= 0)
            return res.redirect('/academy/fees/plans?error=Amount must be greater than 0');
        await feeService.updatePlan(
            req.params.id,
            req.body,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect('/academy/fees/plans?success=Fee plan updated');
    } catch (err) {
        return res.redirect(`/academy/fees/plans?error=${encodeURIComponent(errMsg(err))}`);
    }
};

// POST /academy/fees/plans/:id/delete
const deletePlan = async (req, res, next) => {
    try {
        await feeService.deletePlan(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect('/academy/fees/plans?success=Fee plan deleted');
    } catch (err) {
        return res.redirect(`/academy/fees/plans?error=${encodeURIComponent(errMsg(err))}`);
    }
};

// ════════════════════════════════════════════════
//  STUDENT FEE ASSIGNMENTS
// ════════════════════════════════════════════════

// GET /academy/fees
const getFeesPage = async (req, res, next) => {
    try {
        const tenant_id = req.tenant ? req.tenant.id : null;
        const user_role = req.user.role;

        if (tenant_id) await feeService.markOverdue(tenant_id);

        const status     = req.query.status     || null;
        const batch_id   = req.query.batch_id   || null;
        const student_id = req.query.student_id || null;

        const [fees, plans, summary, students] = await Promise.all([
            feeService.getAllStudentFees({ tenant_id, user_role, status, batch_id, student_id }),
            feeService.getAllPlans(tenant_id, user_role),
            feeService.getFeeSummary(tenant_id),
            getStudentsForTenant(tenant_id, user_role),
        ]);

        return res.render('academy/fees/index', {
            title:      'Fees & Payments',
            activePage: 'academy-fees',
            fees,
            plans,
            summary,
            students,
            filters: { status, batch_id, student_id },
            success: req.query.success || null,
            error:   req.query.error   || null,
            tenant:  req.tenant,
        });
    } catch (err) { next(err); }
};

// POST /academy/fees/assign
const assignFee = async (req, res, next) => {
    try {
        const { student_id, amount, due_date } = req.body;
        if (!student_id)
            return res.redirect('/academy/fees?error=Please select a student');
        if (!amount || parseFloat(amount) <= 0)
            return res.redirect('/academy/fees?error=Amount must be greater than 0');
        if (!due_date)
            return res.redirect('/academy/fees?error=Due date is required');

        await feeService.assignFee(req.body, req.tenant ? req.tenant.id : null);
        return res.redirect('/academy/fees?success=Fee assigned successfully');
    } catch (err) {
        return res.redirect(`/academy/fees?error=${encodeURIComponent(errMsg(err))}`);
    }
};

// ════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════

// GET /academy/fees/:id
const getFeeDetailPage = async (req, res, next) => {
    try {
        const [fee, payments] = await Promise.all([
            feeService.getStudentFeeById(req.params.id),
            feeService.getPaymentsForFee(req.params.id),
        ]);
        return res.render('academy/fees/detail', {
            title:      `Fee — ${fee.student_name}`,
            activePage: 'academy-fees',
            fee,
            payments,
            success: req.query.success || null,
            error:   req.query.error   || null,
            tenant:  req.tenant,
        });
    } catch (err) { next(err); }
};

// POST /academy/fees/:id/pay
const recordPayment = async (req, res, next) => {
    try {
        const result = await feeService.recordPayment(
            req.params.id,
            req.body,
            req.user ? req.user.user_id : null
        );

        // WhatsApp receipt
        if (result.fee.parent_phone) {
            try {
                await sendFeeReceiptAlert({
                    parent_name:  result.fee.parent_name  || 'Parent',
                    parent_phone: result.fee.parent_phone,
                    student_name: result.fee.student_name,
                    batch_name:   result.fee.batch_name   || '',
                    amount_paid:  result.payAmount,
                    total_amount: result.fee.amount,
                    balance:      result.newBalance,
                    payment_mode: req.body.payment_mode   || 'cash',
                    payment_date: req.body.payment_date   || new Date().toISOString().slice(0, 10),
                    status:       result.newStatus,
                });
            } catch (waErr) {
                console.error('WhatsApp fee receipt failed:', waErr.message);
            }
        }

        return res.redirect(`/academy/fees/${req.params.id}?success=Payment recorded successfully`);
    } catch (err) {
        return res.redirect(`/academy/fees/${req.params.id}?error=${encodeURIComponent(errMsg(err))}`);
    }
};

// POST /academy/fees/:id/cancel
const cancelFee = async (req, res, next) => {
    try {
        await feeService.cancelFee(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect(`/academy/fees?success=Fee cancelled`);
    } catch (err) {
        return res.redirect(`/academy/fees/${req.params.id}?error=${encodeURIComponent(errMsg(err))}`);
    }
};

module.exports = {
    getPlansPage,
    createPlan,
    updatePlan,
    deletePlan,
    getFeesPage,
    assignFee,
    getFeeDetailPage,
    recordPayment,
    cancelFee,
};