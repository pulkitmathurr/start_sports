require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: process.env.MAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

const MAIL_FROM = `"${process.env.MAIL_FROM_NAME || 'Start Sports Arena'}" <${process.env.MAIL_USER}>`;

// ── Format date: "25 Mar 2026" ────────────────────
const formatDate = (dateVal) => {
    const d = new Date(dateVal);
    if (isNaN(d)) return String(dateVal).slice(0, 10);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

// ── Format time: "09:00 AM" ───────────────────────
const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const t = String(timeStr).slice(0, 5);
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour   = h % 12 || 12;
    return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

// ── Send Booking Confirmation ─────────────────────
const sendBookingConfirmation = async ({ customer_name, customer_email, booking_no, slot_date, start_time, end_time, ground_name, total_amount, advance_amount, balance_amount, payment_mode }) => {
    if (!customer_email) return;

    const mailOptions = {
        from: MAIL_FROM,
        to: customer_email,
        subject: `Booking Confirmed — ${booking_no}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background: #1B4332; padding: 24px; text-align: center;">
                    <h2 style="color: white; margin: 0;">Booking Confirmed ✅</h2>
                </div>
                <div style="padding: 24px;">
                    <p style="font-size: 16px;">Hi <strong>${customer_name}</strong>,</p>
                    <p>Your booking has been confirmed. Here are your details:</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Booking No</td>
                            <td style="padding: 10px;">${booking_no}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Ground</td>
                            <td style="padding: 10px;">${ground_name || 'Start Sports Arena'}</td>
                        </tr>
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Date</td>
                            <td style="padding: 10px;">${formatDate(slot_date)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Time</td>
                            <td style="padding: 10px;">${formatTime(start_time)} — ${formatTime(end_time)}</td>
                        </tr>
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Total Amount</td>
                            <td style="padding: 10px;">&#8377;${total_amount}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Advance Paid</td>
                            <td style="padding: 10px;">&#8377;${advance_amount}</td>
                        </tr>
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Balance Due</td>
                            <td style="padding: 10px;">&#8377;${balance_amount}</td>
                        </tr>
                        ${payment_mode ? `<tr><td style="padding: 10px; font-weight: bold;">Payment Mode</td><td style="padding: 10px;">${payment_mode}</td></tr>` : ''}
                    </table>
                    <p style="margin-top: 24px; color: #555;">Please arrive 10 minutes before your slot. For any queries, feel free to contact us.</p>
                    <p style="color: #555;">Thank you for choosing <strong>Start Sports Arena</strong>!</p>
                </div>
                <div style="background: #f5f5f5; padding: 16px; text-align: center; color: #888; font-size: 12px;">
                    This is an automated email. Please do not reply.
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// ── Send Booking Approval Notification ───────────
const sendBookingApproval = async ({ customer_name, customer_email, booking_no, slot_date, start_time, end_time, total_amount, deadline }) => {
    if (!customer_email) return;

    const deadlineStr = new Date(deadline).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

    const mailOptions = {
        from: MAIL_FROM,
        to: customer_email,
        subject: `Booking Approved — ${booking_no}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background: #1B4332; padding: 24px; text-align: center;">
                    <h2 style="color: white; margin: 0;">Booking Approved 🎉</h2>
                </div>
                <div style="padding: 24px;">
                    <p style="font-size: 16px;">Hi <strong>${customer_name}</strong>,</p>
                    <p>Your booking request has been <strong>approved</strong>. Please complete your payment before the deadline to confirm your slot.</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Booking No</td>
                            <td style="padding: 10px;">${booking_no}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Date</td>
                            <td style="padding: 10px;">${formatDate(slot_date)}</td>
                        </tr>
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Time</td>
                            <td style="padding: 10px;">${formatTime(start_time)} — ${formatTime(end_time)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Total Amount</td>
                            <td style="padding: 10px;">&#8377;${total_amount}</td>
                        </tr>
                        <tr style="background: #fff3cd;">
                            <td style="padding: 10px; font-weight: bold; color: #856404;">Pay Before</td>
                            <td style="padding: 10px; font-weight: bold; color: #856404;">${deadlineStr}</td>
                        </tr>
                    </table>
                    <p style="margin-top: 24px; color: #d9534f;"><strong>Note:</strong> If payment is not received by the deadline, your booking will be automatically cancelled.</p>
                    <p style="color: #555;">Thank you for choosing <strong>Start Sports Arena</strong>!</p>
                </div>
                <div style="background: #f5f5f5; padding: 16px; text-align: center; color: #888; font-size: 12px;">
                    This is an automated email. Please do not reply.
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};


// ── Send Balance Payment Confirmation ─────────────
const sendBalancePaymentConfirmation = async ({ customer_name, customer_email, booking_no, slot_date, start_time, end_time, ground_name, total_amount, amount_paid, payment_mode }) => {
    if (!customer_email) return;

    const mailOptions = {
        from: MAIL_FROM,
        to: customer_email,
        subject: `Payment Received — ${booking_no}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background: #1B4332; padding: 24px; text-align: center;">
                    <h2 style="color: white; margin: 0;">Payment Received 💰</h2>
                </div>
                <div style="padding: 24px;">
                    <p style="font-size: 16px;">Hi <strong>${customer_name}</strong>,</p>
                    <p>We have received your balance payment. Your booking is now <strong>fully paid</strong>.</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Booking No</td>
                            <td style="padding: 10px;">${booking_no}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Ground</td>
                            <td style="padding: 10px;">${ground_name || 'Start Sports Arena'}</td>
                        </tr>
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Date</td>
                            <td style="padding: 10px;">${formatDate(slot_date)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Time</td>
                            <td style="padding: 10px;">${formatTime(start_time)} — ${formatTime(end_time)}</td>
                        </tr>
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; font-weight: bold;">Amount Paid</td>
                            <td style="padding: 10px;">&#8377;${amount_paid}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">Total Amount</td>
                            <td style="padding: 10px;">&#8377;${total_amount}</td>
                        </tr>
                        <tr style="background: #d4edda;">
                            <td style="padding: 10px; font-weight: bold; color: #155724;">Status</td>
                            <td style="padding: 10px; font-weight: bold; color: #155724;">✅ Fully Paid — No balance due</td>
                        </tr>
                        ${payment_mode ? `<tr><td style="padding: 10px; font-weight: bold;">Payment Mode</td><td style="padding: 10px;">${payment_mode}</td></tr>` : ''}
                    </table>
                    <p style="margin-top: 24px; color: #555;">Please arrive 10 minutes before your slot. For any queries, feel free to contact us.</p>
                    <p style="color: #555;">Thank you for choosing <strong>Start Sports Arena</strong>!</p>
                </div>
                <div style="background: #f5f5f5; padding: 16px; text-align: center; color: #888; font-size: 12px;">
                    This is an automated email. Please do not reply.
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};
// ═══════════════════════════════════════════════════════════════
// ADD THESE TWO FUNCTIONS to your existing email.service.js file
// Paste them before the module.exports line
// ═══════════════════════════════════════════════════════════════


// ── Send Tenant Welcome Email ─────────────────────────────────
// Sent immediately after a new ground owner signs up
const sendTenantWelcomeEmail = async ({ name, email, business_name, trial_days, expires_at, plan_name }) => {
    if (!email) return;

    const mailOptions = {
        from:    MAIL_FROM,
        to:      email,
        subject: `Welcome to Start Sports — Your ${trial_days}-day free trial has started!`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background: #1B4332; padding: 24px; text-align: center;">
                <h2 style="color: white; margin: 0;">Welcome to Start Sports 🏏</h2>
            </div>
            <div style="padding: 24px;">
                <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
                <p>Your account for <strong>${business_name}</strong> has been created successfully.</p>
                <p>You are on the <strong>${plan_name}</strong> plan with a <strong>${trial_days}-day free trial.</strong></p>

                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; font-weight: bold;">Business</td>
                        <td style="padding: 10px;">${business_name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">Plan</td>
                        <td style="padding: 10px;">${plan_name}</td>
                    </tr>
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; font-weight: bold;">Trial Ends</td>
                        <td style="padding: 10px;">${expires_at}</td>
                    </tr>
                </table>

                <div style="margin-top: 24px; text-align: center;">
                    <a href="${process.env.APP_URL || 'http://localhost:11004'}/dashboard"
                       style="background: #1B4332; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                        Go to Dashboard
                    </a>
                </div>

                <p style="margin-top: 24px; color: #666; font-size: 14px;">
                    Your trial ends on <strong>${expires_at}</strong>. 
                    After that, you will need to subscribe to continue using the platform.
                </p>
            </div>
            <div style="background: #f9f9f9; padding: 16px; text-align: center; color: #999; font-size: 12px;">
                Start Sports Arena Platform
            </div>
        </div>`
    };

    await transporter.sendMail(mailOptions);
};


// ── Send Trial Expiry Reminder Email ─────────────────────────
// Called by the cron job 3 days before trial/subscription expires
const sendTrialExpiryReminderEmail = async ({ name, email, business_name, expires_at, days_left }) => {
    if (!email) return;

    const mailOptions = {
        from:    MAIL_FROM,
        to:      email,
        subject: `Action Required — Your Start Sports subscription expires in ${days_left} day${days_left > 1 ? 's' : ''}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background: #c0392b; padding: 24px; text-align: center;">
                <h2 style="color: white; margin: 0;">⚠️ Subscription Expiring Soon</h2>
            </div>
            <div style="padding: 24px;">
                <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
                <p>Your subscription for <strong>${business_name}</strong> is expiring in 
                   <strong>${days_left} day${days_left > 1 ? 's' : ''}</strong> on <strong>${expires_at}</strong>.</p>
                <p>After expiry, you will lose access to your dashboard, bookings, and reports.</p>

                <div style="margin-top: 24px; text-align: center;">
                    <a href="${process.env.APP_URL || 'http://localhost:11004'}/billing"
                       style="background: #c0392b; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                        Renew Now
                    </a>
                </div>
            </div>
            <div style="background: #f9f9f9; padding: 16px; text-align: center; color: #999; font-size: 12px;">
                Start Sports Arena Platform
            </div>
        </div>`
    };

    await transporter.sendMail(mailOptions);
};


// ── Also add these to your module.exports: ────────────────────
// sendTenantWelcomeEmail,
// sendTrialExpiryReminderEmail,

module.exports = { sendBookingConfirmation, sendBookingApproval, sendBalancePaymentConfirmation,sendTenantWelcomeEmail,sendTrialExpiryReminderEmail };