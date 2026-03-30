require('dotenv').config();
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_WHATSAPP_FROM;

const formatDate = (dateVal) => {
    const d = new Date(dateVal);
    if (isNaN(d)) return String(dateVal).slice(0, 10);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const t = String(timeStr).slice(0, 5);
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

const formatPhone = (phone) => {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    return `whatsapp:+91${digits}`;
};

// ── Booking Confirmation (advance ya full payment) ─
const sendWhatsAppConfirmation = async ({
    customer_name, customer_phone, booking_no,
    slot_date, start_time, end_time, ground_name,
    total_amount, advance_amount, balance_amount, payment_mode
}) => {
    if (!customer_phone) return;

    const isPaid = parseFloat(balance_amount) <= 0;

    const message =
`✅ *Booking Confirmed!*

Hi ${customer_name}, your booking is confirmed.

📋 *Booking No:* ${booking_no}
🏟️ *Ground:* ${ground_name || 'Start Sports Arena'}
📅 *Date:* ${formatDate(slot_date)}
⏰ *Time:* ${formatTime(start_time)} — ${formatTime(end_time)}

💰 *Total Amount:* ₹${total_amount}
✅ *Amount Paid:* ₹${advance_amount}
${isPaid
    ? `✅ *Status:* Fully Paid`
    : `⚠️ *Balance Due:* ₹${balance_amount}`
}
${payment_mode ? `💳 *Payment Mode:* ${payment_mode}` : ''}

Please arrive 10 minutes early.
Thank you for choosing *Start Sports Arena*! 🙏`;

    await client.messages.create({
        from: FROM,
        to: formatPhone(customer_phone),
        body: message
    });
};

// ── Balance Payment Received ───────────────────────
const sendWhatsAppBalancePayment = async ({
    customer_name, customer_phone, booking_no,
    slot_date, start_time, end_time, ground_name,
    total_amount, amount_paid, payment_mode
}) => {
    if (!customer_phone) return;

    const message =
`💰 *Payment Received!*

Hi ${customer_name}, we have received your balance payment.

📋 *Booking No:* ${booking_no}
🏟️ *Ground:* ${ground_name || 'Start Sports Arena'}
📅 *Date:* ${formatDate(slot_date)}
⏰ *Time:* ${formatTime(start_time)} — ${formatTime(end_time)}

✅ *Amount Paid:* ₹${amount_paid}
💳 *Total Amount:* ₹${total_amount}
${payment_mode ? `💳 *Payment Mode:* ${payment_mode}` : ''}
✅ *Status:* Fully Paid — No balance due

Thank you for choosing *Start Sports Arena*! 🙏`;

    await client.messages.create({
        from: FROM,
        to: formatPhone(customer_phone),
        body: message
    });
};

// ── Booking Approval Notification ─────────────────
const sendWhatsAppApproval = async ({
    customer_name, customer_phone, booking_no,
    slot_date, start_time, end_time, total_amount, deadline
}) => {
    if (!customer_phone) return;

    const deadlineStr = new Date(deadline).toLocaleString('en-IN', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata'
    });

    const message =
`🎉 *Booking Approved!*

Hi ${customer_name}, your booking request has been *approved*.

📋 *Booking No:* ${booking_no}
📅 *Date:* ${formatDate(slot_date)}
⏰ *Time:* ${formatTime(start_time)} — ${formatTime(end_time)}
💰 *Total Amount:* ₹${total_amount}

⏳ *Pay before:* ${deadlineStr}

⚠️ If payment is not received by the deadline, your booking will be automatically cancelled.

Thank you for choosing *Start Sports Arena*! 🙏`;

    await client.messages.create({
        from: FROM,
        to: formatPhone(customer_phone),
        body: message
    });
};

module.exports = { sendWhatsAppConfirmation, sendWhatsAppBalancePayment, sendWhatsAppApproval };