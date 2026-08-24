const billingService    = require('./billing.service');
const razorpayService   = require('../../services/razorpay.service');
const { successResponse, errorResponse } = require('../../utils/response');
const db = require('../../config/db.config');

// ── GET /billing ──────────────────────────────────────────────
const billingPage = async (req, res, next) => {
    try {
        if (req.user.role === 'super_admin') {
            return res.render('billing/index', {
                title:        'Billing & Subscription',
                activePage:   'billing',
                plans:        [],
                currentSub:   null,
                subHistory:   [],
                isSuperAdmin: true,
                razorpayKeyId: null,
                user:         res.locals.user,
                tenant:       req.tenant
            });
        }

        const tenant_id = req.tenant.id;
        const [plans, currentSub, subHistory] = await Promise.all([
            billingService.getPlans(tenant_id, req.user.role),
            billingService.getCurrentSubscription(tenant_id, req.user.role),
            billingService.getSubHistory(tenant_id, req.user.role)
        ]);

        return res.render('billing/index', {
            title:         'Billing & Subscription',
            activePage:    'billing',
            plans,
            currentSub,
            subHistory,
            isSuperAdmin:  false,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            user:          res.locals.user,
            tenant:        req.tenant
        });
    } catch (err) { next(err); }
};

// ── POST /billing/create-order ────────────────────────────────
// Step 1: Create Razorpay order and return order_id to frontend
const createOrder = async (req, res, next) => {
    try {
        if (req.user.role === 'super_admin') {
            return res.status(403).json(errorResponse('Super admin cannot subscribe to plans'));
        }

        const { plan_id, billing_cycle } = req.body;

        if (!plan_id || !billing_cycle) {
            return res.status(400).json(errorResponse('Plan and billing cycle required'));
        }
        if (!['monthly', 'yearly'].includes(billing_cycle)) {
            return res.status(400).json(errorResponse('Invalid billing cycle'));
        }

        // Get plan details
        const [[plan]] = await db.promise().query(
            'SELECT * FROM tbl_plans WHERE id = ? AND is_active = 1 LIMIT 1',
            [parseInt(plan_id)]
        );
        if (!plan) return res.status(404).json(errorResponse('Plan not found'));

        const amount = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

        if (!amount || amount <= 0) {
            return res.status(400).json(errorResponse('Invalid plan amount'));
        }

        const receipt = `rcpt_${req.tenant.id}_${Date.now()}`;

        // Create Razorpay order
        const order = await razorpayService.createOrder({
            amount,
            currency: 'INR',
            receipt,
            notes: {
                tenant_id:     req.tenant.id,
                plan_id:       plan.id,
                plan_name:     plan.name,
                billing_cycle,
            }
        });

        // Save order in tbl_payments with status = created
        await db.promise().query(
            `INSERT INTO tbl_payments (tenant_id, plan_id, billing_cycle, razorpay_order_id, amount, currency, status)
             VALUES (?, ?, ?, ?, ?, 'INR', 'created')`,
            [req.tenant.id, plan.id, billing_cycle, order.id, amount]
        );

        return res.json(successResponse('Order created', {
            order_id:   order.id,
            amount:     order.amount,
            currency:   order.currency,
            plan_name:  plan.name,
            key_id:     process.env.RAZORPAY_KEY_ID,
        }));
    } catch (err) { next(err); }
};

// ── POST /billing/verify-payment ──────────────────────────────
// Step 2: Verify Razorpay signature and activate subscription
const verifyPayment = async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, billing_cycle } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json(errorResponse('Payment verification data missing'));
        }

        // Verify signature
        const isValid = razorpayService.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (!isValid) {
            // Mark payment as failed
            await db.promise().query(
                `UPDATE tbl_payments SET status = 'failed' WHERE razorpay_order_id = ?`,
                [razorpay_order_id]
            );
            return res.status(400).json(errorResponse('Payment verification failed. Please contact support.'));
        }

        // Mark payment as paid
        await db.promise().query(
            `UPDATE tbl_payments 
             SET status = 'paid', razorpay_payment_id = ?, razorpay_signature = ?
             WHERE razorpay_order_id = ?`,
            [razorpay_payment_id, razorpay_signature, razorpay_order_id]
        );

        // Activate subscription
        const result = await billingService.activateSubscription({
            tenant_id:     req.tenant.id,
            plan_id:       parseInt(plan_id),
            billing_cycle,
            payment_ref:   razorpay_payment_id,
            user_role:     req.user.role
        });

        return res.json(successResponse(
            `Successfully subscribed to ${result.plan.name} (${billing_cycle})`,
            { expires_at: result.expires_at, amount_paid: result.amount_paid }
        ));
    } catch (err) { next(err); }
};

module.exports = { billingPage, createOrder, verifyPayment };