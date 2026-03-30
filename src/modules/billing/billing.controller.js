const billingService = require('./billing.service');
const { successResponse, errorResponse } = require('../../utils/response');

// ── GET /billing ──────────────────────────────────────────────
// Show billing page — plans + current sub + history
const billingPage = async (req, res, next) => {
    try {
        const tenant_id = req.tenant.id;

        const [plans, currentSub, subHistory] = await Promise.all([
            billingService.getPlans(),
            billingService.getCurrentSubscription(tenant_id),
            billingService.getSubHistory(tenant_id)
        ]);

        return res.render('billing/index', {
            title:      'Billing & Subscription',
            activePage: 'billing',
            plans,
            currentSub,
            subHistory
        });
    } catch (err) { next(err); }
};

// ── POST /billing/subscribe ───────────────────────────────────
// Demo: instantly activate selected plan (no payment gateway)
const subscribe = async (req, res, next) => {
    try {
        const { plan_id, billing_cycle } = req.body;

        if (!plan_id || !billing_cycle) {
            return res.status(400).json(errorResponse('Plan and billing cycle required'));
        }
        if (!['monthly', 'yearly'].includes(billing_cycle)) {
            return res.status(400).json(errorResponse('Invalid billing cycle'));
        }

        const result = await billingService.activateSubscription({
            tenant_id:     req.tenant.id,
            plan_id:       parseInt(plan_id),
            billing_cycle,
            payment_ref:   `DEMO-${Date.now()}`
        });

        return res.json(successResponse(
            `Subscribed to ${result.plan.name} (${billing_cycle}) successfully`,
            { expires_at: result.expires_at, amount_paid: result.amount_paid }
        ));
    } catch (err) { next(err); }
};

module.exports = { billingPage, subscribe };