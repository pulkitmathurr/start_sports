const db = require("../../config/db.config");
const settingsService = require("../settings/settings.service");
const {
  sendBookingConfirmation,
  sendBookingApproval,
  sendBalancePaymentConfirmation,
} = require("../../services/email.service");
const {
  sendWhatsAppConfirmation,
  sendWhatsAppBalancePayment,
  sendWhatsAppApproval,
} = require("../../services/whatsapp.service");
const {
  findOrCreateCustomer,
  updateCustomerStats,
} = require("../customers/customer.service");

// ── Get Ground Settings ───────────────────────────
const getSettings = async () => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM tbl_ground_settings LIMIT 1");
    if (rows.length === 0) {
      const err = new Error("Ground settings not configured");
      err.statusCode = 503;
      throw err;
    }
    return rows[0];
  } catch (err) {
    throw err;
  }
};

// ── Generate Slots for a Date (legacy single-ground) ─
const generateSlotsForDate = async (date) => {
  try {
    const settings = await getSettings();
    const open = settings.open_time.slice(0, 5);
    const close = settings.close_time.slice(0, 5);
    const duration = settings.slot_duration;
    const peakStart = settings.peak_start_time.slice(0, 5);
    const peakEnd = settings.peak_end_time.slice(0, 5);
    const offPeakPrice = settings.off_peak_price;
    const peakPrice = settings.peak_price;

    const toMins = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const toTime = (mins) => {
      const h = String(Math.floor(mins / 60)).padStart(2, "0");
      const m = String(mins % 60).padStart(2, "0");
      return `${h}:${m}:00`;
    };

    const openMins = toMins(open);
    const closeMins = toMins(close);
    const peakStartMins = toMins(peakStart);
    const peakEndMins = toMins(peakEnd);

    const slots = [];
    let current = openMins;

    while (current + duration <= closeMins) {
      const start = toTime(current);
      const end = toTime(current + duration);
      const isPeak = current >= peakStartMins && current < peakEndMins;
      const slotType = isPeak ? "peak" : "off_peak";
      const price = isPeak ? peakPrice : offPeakPrice;

      await db.promise().query(
        `INSERT IGNORE INTO tbl_slots (date, start_time, end_time, slot_type, price, status)
                 VALUES (?, ?, ?, ?, ?, 'available')`,
        [date, start, end, slotType, price],
      );

      slots.push({
        date,
        start_time: start,
        end_time: end,
        slot_type: slotType,
        price,
      });
      current += duration;
    }

    return slots;
  } catch (err) {
    throw err;
  }
};

// ── Get Slots for a Date with Booking Status ──────
const getSlotsForDate = async (date) => {
  try {
    await generateSlotsForDate(date);

    const [slots] = await db.promise().query(
      `SELECT
                s.*,
                b.booking_status,
                b.booking_no,
                b.customer_name,
                b.id as booking_id
             FROM tbl_slots s
             LEFT JOIN tbl_bookings b
                ON b.slot_id = s.id
                AND b.booking_status IN ('pending', 'approved', 'confirmed')
             WHERE s.date = ?
             ORDER BY s.start_time`,
      [date],
    );

    return slots.map((slot) => {
      let display_status = "available";
      if (slot.slot_status === "blocked" || slot.status === "blocked") {
        display_status = "blocked";
      } else if (slot.booking_status === "confirmed") {
        display_status = "booked";
      } else if (
        slot.booking_status === "pending" ||
        slot.booking_status === "approved"
      ) {
        display_status = "pending";
      }
      return { ...slot, display_status };
    });
  } catch (err) {
    throw err;
  }
};

// ── Get Available Dates ───────────────────────────
const getAvailableDates = async () => {
  try {
    const settings = await getSettings();
    const days = settings.advance_booking_days;
    const dates = [];

    for (let i = 0; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split("T")[0]);
    }

    return dates;
  } catch (err) {
    throw err;
  }
};

// ── Generate Booking Number ───────────────────────
const generateBookingNo = async () => {
  try {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yy = today.getFullYear();
    const prefix = `SS-${yy}${mm}${dd}`;

    const [rows] = await db
      .promise()
      .query(
        "SELECT COUNT(*) as count FROM tbl_bookings WHERE booking_no LIKE ?",
        [`${prefix}%`],
      );

    const count = rows[0].count + 1;
    return `${prefix}-${String(count).padStart(3, "0")}`;
  } catch (err) {
    throw err;
  }
};

// ── Calculate Approval Deadline ───────────────────
const calculateDeadline = (slotDate, slotStartTime, settings) => {
  const slotDateTime = new Date(`${slotDate} ${slotStartTime}`);
  const slotMinus2hrs = new Date(slotDateTime.getTime() - 2 * 60 * 60 * 1000);
  const nextNhrs = new Date(
    Date.now() + settings.advance_payment_hours * 60 * 60 * 1000,
  );
  return slotMinus2hrs < nextNhrs ? slotMinus2hrs : nextNhrs;
};

// ── Create Booking (Online Request) ──────────────
const createBooking = async ({
  slot_id,
  slot_date,
  start_time,
  end_time,
  customer_name,
  customer_phone,
  customer_email,
  notes,
}) => {
  try {
    const [slotRows] = await db
      .promise()
      .query("SELECT * FROM tbl_slots WHERE id = ?", [slot_id]);
    if (slotRows.length === 0) {
      const err = new Error("Slot not found");
      err.statusCode = 404;
      throw err;
    }

    const slot = slotRows[0];

    const [existing] = await db.promise().query(
      `SELECT id FROM tbl_bookings 
     WHERE slot_id = ? 
     AND booking_status IN ('pending', 'approved', 'confirmed')`,
      [slot_id],
    );

    if (existing.length > 0) {
      const err = new Error("Slot already booked or reserved");
      err.statusCode = 409;
      throw err;
    }
    if (existing.length > 0) {
      const err = new Error("Slot already booked");
      err.statusCode = 409;
      throw err;
    }

    const availableDates = await getAvailableDates();
    if (!availableDates.includes(slot_date)) {
      const err = new Error("Booking not allowed for this date");
      err.statusCode = 400;
      throw err;
    }

    const booking_no = await generateBookingNo();
    const total_amount = parseFloat(slot.price);
    const balance_amount = total_amount;

    // Auto find or create customer profile
    const customer_id = await findOrCreateCustomer({
      name: customer_name,
      phone: customer_phone,
      email: customer_email,
    });

    const [result] = await db.promise().query(
      `INSERT INTO tbl_bookings (
                customer_id, booking_no, booking_type, slot_id,
                slot_date, start_time, end_time,
                customer_name, customer_phone, customer_email,
                total_amount, advance_amount, balance_amount,
                payment_status, booking_status, notes
            ) VALUES (?, ?, 'online', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', 'pending', ?)`,
      [
        customer_id,
        booking_no,
        slot_id,
        slot_date,
        start_time,
        end_time,
        customer_name,
        customer_phone,
        customer_email,
        total_amount,
        balance_amount,
        notes,
      ],
    );

    return { booking_id: result.insertId, booking_no };
  } catch (err) {
    throw err;
  }
};

// ── Quick Book (Admin — Walk-in / Phone) ──────────
const quickBook = async ({
  ground_id,
  slot_id,
  slot_date,
  start_time,
  end_time,
  customer_name,
  customer_phone,
  customer_email,
  booking_type,
  advance_amount,
  payment_mode,
  notes,
  discount_type,
  discount_value,
  surcharge_amount,
  surcharge_note,
  custom_price,
  pricing_note,
}) => {
  try {
    const [slotRows, existingRows] = await Promise.all([
      db.promise().query("SELECT * FROM tbl_slots WHERE id = ?", [slot_id]),
      db.promise().query(
        `SELECT id FROM tbl_bookings 
     WHERE slot_id = ? 
     AND booking_status IN ('pending', 'approved', 'confirmed')`,
        [slot_id],
      ),
    ]);

    if (slotRows[0].length === 0) {
      const err = new Error("Slot not found");
      err.statusCode = 404;
      throw err;
    }
    if (existingRows[0].length > 0) {
      const err = new Error("Slot already booked");
      err.statusCode = 409;
      throw err;
    }

    const slot = slotRows[0][0];
    const booking_no = await generateBookingNo();
    const original_amount = parseFloat(slot.price);

    // ── Custom price override
    let base = original_amount;
    if (custom_price && parseFloat(custom_price) > 0) {
      base = parseFloat(custom_price);
    }

    // ── Discount calculation
    let disc = 0;
    if (discount_value && parseFloat(discount_value) > 0) {
      if (discount_type === "percent") {
        disc = Math.round((base * parseFloat(discount_value)) / 100);
      } else {
        disc = parseFloat(discount_value);
      }
      disc = Math.min(disc, base);
    }

    // ── Surcharge
    const surch = parseFloat(surcharge_amount) || 0;

    // ── Final total
    const total_amount = base - disc + surch;
    const adv = parseFloat(advance_amount) || 0;
    const balance_amount = total_amount - adv;

    // ── Pricing note
    const notes_pricing = [
      custom_price && parseFloat(custom_price) > 0
        ? `Custom price: ₹${base} (original ₹${original_amount})`
        : null,
      disc > 0
        ? `Discount: -₹${disc}${discount_type === "percent" ? ` (${discount_value}%)` : ""}`
        : null,
      surch > 0
        ? `Surcharge: +₹${surch}${surcharge_note ? ` (${surcharge_note})` : ""}`
        : null,
      pricing_note || null,
    ]
      .filter(Boolean)
      .join(" | ");

    let payment_status = "pending";
    if (adv >= total_amount) payment_status = "paid";
    else if (adv > 0) payment_status = "partial";

    // Auto find or create customer profile
    const customer_id = await findOrCreateCustomer({
      name: customer_name,
      phone: customer_phone,
      email: customer_email,
    });

    const [result] = await db.promise().query(
      `INSERT INTO tbl_bookings (
                customer_id, ground_id, booking_no, booking_type, slot_id,
                slot_date, start_time, end_time,
                customer_name, customer_phone, customer_email,
                total_amount, original_amount, discount_amount, surcharge_amount,
                advance_amount, balance_amount,
                payment_status, payment_mode, booking_status,
                confirmed_at, notes, pricing_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', NOW(), ?, ?)`,
      [
        customer_id,
        ground_id,
        booking_no,
        booking_type,
        slot_id,
        slot_date,
        start_time,
        end_time,
        customer_name,
        customer_phone,
        customer_email,
        total_amount,
        original_amount,
        disc,
        surch,
        adv,
        balance_amount,
        payment_status,
        payment_mode,
        notes,
        notes_pricing || null,
      ],
    );

    await db
      .promise()
      .query("UPDATE tbl_slots SET status = 'booked' WHERE id = ?", [slot_id]);

    if (adv > 0) {
      const payType = adv >= total_amount ? "full" : "advance";
      await db
        .promise()
        .query(
          "INSERT INTO tbl_payments (booking_id, amount, payment_mode, payment_type) VALUES (?, ?, ?, ?)",
          [result.insertId, adv, payment_mode, payType],
        );
    }

    settingsService.checkAndRaiseSuggestion(ground_id);

    // Ground name fetch karo email ke liye
    const [groundRows] = await db
      .promise()
      .query("SELECT name FROM tbl_grounds WHERE id = ?", [ground_id]);
    const ground_name = groundRows.length > 0 ? groundRows[0].name : null;

    // Booking confirmation email
    sendBookingConfirmation({
      customer_name,
      customer_email,
      booking_no,
      slot_date,
      start_time,
      end_time,
      ground_name,
      total_amount,
      advance_amount: adv,
      balance_amount,
      payment_mode,
    }).catch((err) => console.error("Email error (quickBook):", err));

    sendWhatsAppConfirmation({
      customer_name,
      customer_phone,
      booking_no,
      slot_date,
      start_time,
      end_time,
      ground_name,
      total_amount,
      advance_amount: adv,
      balance_amount,
      payment_mode,
    }).catch((err) => console.error("WhatsApp error (quickBook):", err));

    return { booking_id: result.insertId, booking_no };
  } catch (err) {
    throw err;
  }
};

// ── Approve Booking ───────────────────────────────
const approveBooking = async ({ booking_id }) => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM tbl_bookings WHERE id = ?", [booking_id]);
    if (rows.length === 0) {
      const err = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    const booking = rows[0];
    const settings = await getSettings();
    const deadline = calculateDeadline(
      booking.slot_date,
      booking.start_time,
      settings,
    );

    await db.promise().query(
      `UPDATE tbl_bookings
             SET booking_status = 'approved', approved_at = NOW(), approval_expires_at = ?
             WHERE id = ?`,
      [deadline, booking_id],
    );

    // Approval notification email
    sendBookingApproval({
      customer_name: booking.customer_name,
      customer_email: booking.customer_email,
      booking_no: booking.booking_no,
      slot_date: booking.slot_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      total_amount: booking.total_amount,
      deadline,
    }).catch((err) => console.error("Email error (approveBooking):", err));

    sendWhatsAppApproval({
      customer_name: booking.customer_name,
      customer_phone: booking.customer_phone,
      booking_no: booking.booking_no,
      slot_date: booking.slot_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      total_amount: booking.total_amount,
      deadline,
    }).catch((err) => console.error("WhatsApp error (approveBooking):", err));

    return { booking, deadline };
  } catch (err) {
    throw err;
  }
};

// ── Reject Booking ────────────────────────────────
const rejectBooking = async ({ booking_id, reason }) => {
  try {
    await db
      .promise()
      .query(
        `UPDATE tbl_bookings SET booking_status = 'rejected', rejection_reason = ? WHERE id = ?`,
        [reason, booking_id],
      );
    return true;
  } catch (err) {
    throw err;
  }
};

// ── Record Payment & Confirm ──────────────────────
const recordPayment = async ({
  booking_id,
  amount,
  payment_mode,
  payment_type,
}) => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM tbl_bookings WHERE id = ?", [booking_id]);
    if (rows.length === 0) {
      const err = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    const booking = rows[0];

    // Guard: already fully paid hai toh dobara payment mat karo
    if (parseFloat(booking.balance_amount) <= 0) {
      const err = new Error("Booking is already fully paid");
      err.statusCode = 400;
      throw err;
    }

    const paid = parseFloat(amount);
    const newAdvance = parseFloat(booking.advance_amount) + paid;
    const newBalance = parseFloat(booking.total_amount) - newAdvance;

    const payment_status = newBalance <= 0 ? "paid" : "partial";

    await db
      .promise()
      .query(
        "INSERT INTO tbl_payments (booking_id, amount, payment_mode, payment_type) VALUES (?, ?, ?, ?)",
        [booking_id, paid, payment_mode, payment_type],
      );

    await db.promise().query(
      `UPDATE tbl_bookings
             SET advance_amount = ?, balance_amount = ?, payment_status = ?,
                 payment_mode = ?, booking_status = 'confirmed', confirmed_at = NOW()
             WHERE id = ?`,
      [
        newAdvance,
        Math.max(0, newBalance),
        payment_status,
        payment_mode,
        booking_id,
      ],
    );

    await db
      .promise()
      .query("UPDATE tbl_slots SET status = 'booked' WHERE id = ?", [
        booking.slot_id,
      ]);

    // Update customer stats after confirmation
    await updateCustomerStats(booking.customer_phone);

    settingsService.checkAndRaiseSuggestion(booking.ground_id);

    // Sabke liye notification bhejo (online + walkin + phone)
    const [groundRows] = await db
      .promise()
      .query("SELECT name FROM tbl_grounds WHERE id = ?", [booking.ground_id]);
    const ground_name = groundRows.length > 0 ? groundRows[0].name : null;

    if (payment_status === "paid") {
      // Fully paid — balance payment confirmation bhejo
      sendBalancePaymentConfirmation({
        customer_name: booking.customer_name,
        customer_email: booking.customer_email,
        booking_no: booking.booking_no,
        slot_date: booking.slot_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        ground_name,
        total_amount: booking.total_amount,
        amount_paid: paid,
        payment_mode,
      }).catch((err) =>
        console.error("Email error (recordPayment-paid):", err),
      );

      sendWhatsAppBalancePayment({
        customer_name: booking.customer_name,
        customer_phone: booking.customer_phone,
        booking_no: booking.booking_no,
        slot_date: booking.slot_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        ground_name,
        total_amount: booking.total_amount,
        amount_paid: paid,
        payment_mode,
      }).catch((err) =>
        console.error("WhatsApp error (recordPayment-paid):", err),
      );
    } else {
      // Partial payment — booking confirmation with updated balance bhejo
      sendBookingConfirmation({
        customer_name: booking.customer_name,
        customer_email: booking.customer_email,
        booking_no: booking.booking_no,
        slot_date: booking.slot_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        ground_name,
        total_amount: booking.total_amount,
        advance_amount: newAdvance,
        balance_amount: Math.max(0, newBalance),
        payment_mode,
      }).catch((err) =>
        console.error("Email error (recordPayment-partial):", err),
      );

      sendWhatsAppConfirmation({
        customer_name: booking.customer_name,
        customer_phone: booking.customer_phone,
        booking_no: booking.booking_no,
        slot_date: booking.slot_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        ground_name,
        total_amount: booking.total_amount,
        advance_amount: newAdvance,
        balance_amount: Math.max(0, newBalance),
        payment_mode,
      }).catch((err) =>
        console.error("WhatsApp error (recordPayment-partial):", err),
      );
    }

    return true;
  } catch (err) {
    throw err;
  }
};

// ── Cancel Booking ────────────────────────────────
const cancelBooking = async ({ booking_id }) => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM tbl_bookings WHERE id = ?", [booking_id]);
    if (rows.length === 0) {
      const err = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    const booking = rows[0];

    await db
      .promise()
      .query(
        "UPDATE tbl_bookings SET booking_status = 'cancelled' WHERE id = ?",
        [booking_id],
      );

    await db
      .promise()
      .query("UPDATE tbl_slots SET status = 'available' WHERE id = ?", [
        booking.slot_id,
      ]);

    return true;
  } catch (err) {
    throw err;
  }
};

// ── Get All Bookings (with pagination) ──────────────────────────────
const getAllBookings = async ({
    status,
    payment_status,  // Add this parameter
    search,
    limit = 10,
    offset = 0,
    date = null,
}) => {
    try {
        let query = `
            SELECT b.*, g.name AS ground_name
            FROM tbl_bookings b
            LEFT JOIN tbl_grounds g ON g.id = b.ground_id
            WHERE b.flag = 0
        `;
        const params = [];

        if (date) {
            query += " AND b.slot_date = ?";
            params.push(date);
        }

        if (status) {
            query += " AND b.booking_status = ?";
            params.push(status);
        }

        if (payment_status) {  // Add this condition
            query += " AND b.payment_status = ?";
            params.push(payment_status);
        }

        if (search) {
            query += " AND (b.customer_name LIKE ? OR b.customer_phone LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        query += " ORDER BY b.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get Total Bookings Count (for pagination) ───────────────────────
const getTotalBookingsCount = async ({ status, payment_status, search, date = null }) => {
    try {
        let query = `
            SELECT COUNT(*) as total
            FROM tbl_bookings b
            WHERE b.flag = 0
        `;
        const params = [];

        if (date) {
            query += " AND b.slot_date = ?";
            params.push(date);
        }

        if (status) {
            query += " AND b.booking_status = ?";
            params.push(status);
        }

        if (payment_status) {  // Add this condition
            query += " AND b.payment_status = ?";
            params.push(payment_status);
        }

        if (search) {
            query += " AND (b.customer_name LIKE ? OR b.customer_phone LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        const [rows] = await db.promise().query(query, params);
        return rows[0].total;
    } catch (err) {
        throw err;
    }
};

// ── Get Booking by ID ─────────────────────────────
const getBookingById = async ({ booking_id }) => {
  try {
    const [booking] = await db.promise().query(
      `SELECT b.*, g.name AS ground_name
             FROM tbl_bookings b
             LEFT JOIN tbl_grounds g ON g.id = b.ground_id
             WHERE b.id = ?`,
      [booking_id],
    );

    if (booking.length === 0) {
      const err = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    const [payments] = await db
      .promise()
      .query(
        "SELECT * FROM tbl_payments WHERE booking_id = ? ORDER BY payment_date DESC",
        [booking_id],
      );

    return { booking: booking[0], payments };
  } catch (err) {
    throw err;
  }
};

// ── Expire Approved Bookings (Cron) ───────────────
const expireBookings = async () => {
  try {
    const [expired] = await db.promise().query(
      `SELECT * FROM tbl_bookings
             WHERE booking_status = 'approved' AND approval_expires_at < NOW()`,
    );

    if (expired.length > 0) {
      await db.promise().query(
        `UPDATE tbl_bookings
                 SET booking_status = 'expired'
                 WHERE booking_status = 'approved' AND approval_expires_at < NOW()`,
      );

      const slotIds = expired.map((b) => b.slot_id);
      await db
        .promise()
        .query("UPDATE tbl_slots SET status = 'available' WHERE id IN (?)", [
          slotIds,
        ]);
    }

    return expired;
  } catch (err) {
    throw err;
  }
};

// ── Update Booking ────────────────────────────────
const updateBooking = async ({
  booking_id,
  customer_name,
  customer_phone,
  customer_email,
  booking_type,
  notes,
}) => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT id FROM tbl_bookings WHERE id = ?", [booking_id]);
    if (rows.length === 0) {
      const err = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    await db.promise().query(
      `UPDATE tbl_bookings
             SET customer_name = ?, customer_phone = ?, customer_email = ?,
                 booking_type = ?, notes = ?
             WHERE id = ?`,
      [
        customer_name,
        customer_phone,
        customer_email || null,
        booking_type,
        notes || null,
        booking_id,
      ],
    );

    return true;
  } catch (err) {
    throw err;
  }
};

// ── Get Today's Stats ─────────────────────────────
const getTodayStats = async () => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [stats] = await db.promise().query(
      `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN booking_status = 'pending'   THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END) as revenue
             FROM tbl_bookings
             WHERE slot_date = ?`,
      [today],
    );

    return stats[0];
  } catch (err) {
    throw err;
  }
};

module.exports = {
  getSettings,
  generateSlotsForDate,
  getSlotsForDate,
  getAvailableDates,
  createBooking,
  quickBook,
  approveBooking,
  rejectBooking,
  recordPayment,
  cancelBooking,
  getAllBookings,
  getTotalBookingsCount,
  getBookingById,
  expireBookings,
  getTodayStats,
  updateBooking,
};
