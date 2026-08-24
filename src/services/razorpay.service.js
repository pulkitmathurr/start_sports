const Razorpay = require('razorpay');
const crypto   = require('crypto');

const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ── Create order ──
const createOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
    const order = await razorpay.orders.create({
        amount:   Math.round(amount * 100), // Razorpay expects 
        currency,
        receipt,
        notes,
    });
    return order;
};

// ── Verify payment signature ──────────────────────────────────
const verifyPayment = (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
    const body      = razorpay_order_id + '|' + razorpay_payment_id;
    const expected  = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');
    return expected === razorpay_signature;
};

module.exports = { createOrder, verifyPayment };