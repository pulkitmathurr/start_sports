const db = require("../../config/db.config");
const { calculatePrice, checkConflict, getGroundPricingConfig } = require("../../utils/pricing");
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

// ── Slot generation removed — flexible booking system uses on-demand slot creation ──

// ── Generate Slots for a Specific Ground ──────────
const generateSlotsForGround = async (date, ground_id) => {
    try {
        // Get ground details
        // Fix 2: also check status = 'active' so inactive grounds produce no slots
        const [groundRows] = await db.promise().query(
            "SELECT * FROM tbl_grounds WHERE id = ? AND flag = 0 AND status = 'active'",
            [ground_id]
        );
        
        if (groundRows.length === 0) return [];
        
        const ground = groundRows[0];
        const open = ground.open_time.slice(0, 5);
        const close = ground.close_time.slice(0, 5);
        const duration = ground.slot_duration;
        const peakStart = ground.peak_start_time.slice(0, 5);
        const peakEnd = ground.peak_end_time.slice(0, 5);
        const offPeakPrice = ground.off_peak_price;
        const peakPrice = ground.peak_price;

        const toMins = (t) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
        };
        const toTime = (mins) => {
            const h = String(Math.floor(mins / 60)).padStart(2, "0");
            const m = String(mins % 60).padStart(2, "0");
            return `${h}:${m}:00`;
        };

        const openMins  = toMins(open);
        let   closeMins = toMins(close);

        // ── Overnight support (e.g. 06:00 → 00:00 next day) ──────────────────
        // If closing time ≤ opening time, closing is on the NEXT day — add 24h.
        if (closeMins <= openMins) closeMins += 24 * 60;
        const peakStartMins = toMins(peakStart);
        const peakEndMins = toMins(peakEnd);

        // ── Soft-delete stale slots before regenerating ──
        // Mark both 'available' and 'blocked' slots as flag=1 so the UPSERT
        // below can re-evaluate their correct status (respecting current blocks).
        // Booked/pending slots are left untouched.
        await db.promise().query(
            `UPDATE tbl_slots SET flag = 1
             WHERE ground_id = ? AND date = ? AND status IN ('available','blocked') AND flag = 0`,
            [ground.id, date]
        );

        // Fetch booked slots for this ground+date that were preserved from a previous
        // slot configuration (different duration). We need their time ranges so we
        // can skip generating any new slot that overlaps with them.
        const [bookedSlots] = await db.promise().query(
            `SELECT s.start_time, s.end_time
             FROM tbl_slots s
             INNER JOIN tbl_bookings b ON b.slot_id = s.id
                 AND b.booking_status IN ('pending','approved','confirmed')
             WHERE s.ground_id = ? AND s.date = ?`,
            [ground.id, date]
        );

        // Convert booked slot times to minute ranges for overlap checking
        const bookedRanges = bookedSlots.map(s => ({
            start: toMins(s.start_time.slice(0, 5)),
            end:   toMins(s.end_time.slice(0, 5))
        }));

        const overlapsBooked = (startMins, endMins) =>
            bookedRanges.some(r => startMins < r.end && endMins > r.start);

        const slots = [];
        let current = openMins;

        // ── Load any active blocks for this ground+date ───────────────────
        // Also check blocks whose end_date is yesterday — they may have overnight
        // slots stored under today's date (e.g. 3AM slots from previous night)
        const [activeBlocks] = await db.promise().query(
            `SELECT * FROM tbl_ground_blocks
             WHERE ground_id = ? AND start_date <= ? AND DATE_ADD(end_date, INTERVAL 1 DAY) >= ?`,
            [ground.id, date, date]
        );
        const hasFullDayBlock = activeBlocks.some(b => b.block_type === 'full_day');
        const timeRangeBlocks = activeBlocks.filter(b => b.block_type === 'time_range');

        const isBlockedByTime = (slotStartMins) => {
            return timeRangeBlocks.some(b => {
                let bStart = toMins(b.start_time.slice(0,5));
                let bEnd   = toMins(b.end_time.slice(0,5));
                // Overnight block (e.g. 20:00 → 00:30): bEnd < bStart, add 24h
                if (bEnd <= bStart) bEnd += 24 * 60;
                // Also check slot shifted by 24h (for overnight slots stored next day)
                return (slotStartMins >= bStart && slotStartMins < bEnd) ||
                       (slotStartMins + 24 * 60 >= bStart && slotStartMins + 24 * 60 < bEnd);
            });
        };

        while (current + duration <= closeMins) {
            const start = toTime(current);
            const end = toTime(current + duration);
            const isPeak = current >= peakStartMins && current < peakEndMins;
            const slotType = isPeak ? "peak" : "off_peak";
            const price = isPeak ? peakPrice : offPeakPrice;

            // Skip inserting this slot if it overlaps with a booked slot from
            // a previous duration configuration — those rows are preserved as-is.
            if (!overlapsBooked(current, current + duration)) {
                const slotStatus = (hasFullDayBlock || isBlockedByTime(current)) ? 'blocked' : 'available';

                await db.promise().query(
                    `INSERT INTO tbl_slots (ground_id, date, start_time, end_time, slot_type, price, status, tenant_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                         status   = IF(status = 'booked', 'booked', VALUES(status)),
                         flag     = 0,
                         price    = VALUES(price),
                         slot_type = VALUES(slot_type)`,
                    [ground.id, date, start, end, slotType, price, slotStatus, ground.tenant_id]
                );

                slots.push({
                    ground_id: ground.id,
                    date,
                    start_time: start,
                    end_time: end,
                    slot_type: slotType,
                    price,
                });
            }
            current += duration;
        }

        return slots;
    } catch (err) {
        throw err;
    }
};

// ── Get Slots for a Date with Booking Status ──────
// ── Get Slots for a Date with Booking Status ──────
const getSlotsForDate = async (date, ground_id = null, tenant_id = null, user_role = 'admin') => {
    try {
        // If ground_id is provided, generate slots only for that ground
        if (ground_id) {
            await generateSlotsForGround(date, ground_id);
        } else {
            await generateSlotsForDate(date);
        }

        let query = `
            SELECT
                s.*,
                b.booking_status,
                b.booking_no,
                b.customer_name,
                b.id as booking_id
            FROM tbl_slots s
            INNER JOIN tbl_grounds g ON g.id = s.ground_id AND g.flag = 0 AND g.status = 'active'
            LEFT JOIN tbl_bookings b
                ON b.slot_id = s.id
                AND b.booking_status IN ('pending', 'approved', 'confirmed')
            WHERE s.date = ? AND s.flag = 0
        `;
        let params = [date];

        // Add ground filter if provided
        if (ground_id) {
            query += " AND s.ground_id = ?";
            params.push(ground_id);
        }
        
        // Add tenant filter for admin users
        if (user_role === 'admin' && tenant_id) {
            query += " AND s.tenant_id = ?";
            params.push(tenant_id);
        }

        query += " ORDER BY s.start_time";

        const [slots] = await db.promise().query(query, params);

        // Resolve status for each slot
        const resolved = slots.map((slot) => {
            let status = slot.status;
            if (slot.booking_status === 'confirmed') {
                status = 'booked';
            } else if (slot.booking_status === 'pending' || slot.booking_status === 'approved') {
                status = 'pending';
            }
            return { ...slot, status, display_status: status };
        });

        // Build a list of booked time ranges (in minutes) for this ground+date.
        // Any available slot that overlaps a booked range is a stale slot left over
        // from a previous slot-duration config — remove it from the response so it
        // cannot be selected or double-booked.
        const toMins = (t) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
        const bookedRanges = resolved
            .filter(s => s.status === 'booked' || s.status === 'pending')
            .map(s => ({ start: toMins(s.start_time), end: toMins(s.end_time) }));

        return resolved.filter(slot => {
            if (slot.status === 'booked' || slot.status === 'pending' || slot.status === 'blocked') return true;
            const s = toMins(slot.start_time);
            const e = toMins(slot.end_time);
            return !bookedRanges.some(r => s < r.end && e > r.start); // drop overlapping available
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
        "SELECT MAX(CAST(SUBSTRING_INDEX(booking_no, '-', -1) AS UNSIGNED)) as max_serial FROM tbl_bookings WHERE booking_no LIKE ?",
        [`${prefix}%`],
      );

    const maxSerial = rows[0].max_serial || 0;
    return `${prefix}-${String(maxSerial + 1).padStart(3, "0")}`;
  } catch (err) {
    throw err;
  }
};

// ── Calculate Approval Deadline ───────────────────
// advance_payment_hours comes from the ground's own config (tbl_grounds),
// falling back to tbl_ground_settings if the ground row doesn't have it set.
const calculateDeadline = (slotDate, slotStartTime, advance_payment_hours) => {
  const hours = parseFloat(advance_payment_hours) || 2;
  const slotDateTime = new Date(`${slotDate} ${slotStartTime}`);
  const slotMinus2hrs = new Date(slotDateTime.getTime() - 2 * 60 * 60 * 1000);
  const nextNhrs = new Date(Date.now() + hours * 60 * 60 * 1000);
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
  tenant_id,
}) => {
  const conn = await db.promise().getConnection();
  await conn.beginTransaction();
  try {
    // Lock slot row to prevent double-booking race condition
    const [slotRows] = await conn.query(
      "SELECT * FROM tbl_slots WHERE id = ? FOR UPDATE", [slot_id]
    );
    if (slotRows.length === 0) {
      const err = new Error("Slot not found");
      err.statusCode = 404;
      throw err;
    }

    const slot = slotRows[0];

    const [existing] = await conn.query(
      `SELECT id FROM tbl_bookings
       WHERE slot_id = ?
       AND booking_status IN ('pending', 'approved', 'confirmed')`,
      [slot_id]
    );

    if (existing.length > 0) {
      const err = new Error("Slot already booked or reserved");
      err.statusCode = 409;
      throw err;
    }

    // Use the ground's own advance_booking_days (set in Manage Grounds)
    // instead of global settings so each ground controls its own booking window.
    const [groundForDays] = await db.promise().query(
      'SELECT advance_booking_days FROM tbl_grounds WHERE id = ? AND flag = 0 LIMIT 1',
      [slot.ground_id]
    );
    const advanceDays = groundForDays.length > 0
      ? (groundForDays[0].advance_booking_days || 7)
      : 7;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + advanceDays);
    const maxDateStr = maxDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    if (slot_date < todayStr || slot_date > maxDateStr) {
      const err = new Error("Booking not allowed for this date");
      err.statusCode = 400;
      throw err;
    }

    const booking_no = await generateBookingNo();
    const total_amount = parseFloat(slot.price);
    const balance_amount = total_amount;

    const customer_id = await findOrCreateCustomer({
      name: customer_name,
      phone: customer_phone,
      email: customer_email,
      tenant_id: tenant_id,
    });

    const [result] = await conn.query(
      `INSERT INTO tbl_bookings (
        customer_id, booking_no, booking_type, slot_id,
        slot_date, start_time, end_time,
        customer_name, customer_phone, customer_email,
        total_amount, advance_amount, balance_amount,
        payment_status, booking_status, notes, tenant_id
    ) VALUES (?, ?, 'online', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', 'pending', ?, ?)`,
      [
        customer_id, booking_no, slot_id, slot_date, start_time, end_time,
        customer_name, customer_phone, customer_email,
        total_amount, balance_amount, notes, tenant_id,
      ]
    );

    await conn.commit();
    return { booking_id: result.insertId, booking_no };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── Quick Book (Admin — Walk-in / Phone) ──────────
const quickBook = async ({
  ground_id,
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
  tenant_id,
}) => {
  // Use a transaction + FOR UPDATE to prevent race conditions
  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    // ── Get ground pricing config ──────────────────────────────
    const ground = await getGroundPricingConfig(db, ground_id, tenant_id);

    // ── Calculate price using pricing utility ─────────────────
    const priceResult = calculatePrice({ startTime: start_time, endTime: end_time, ground });

    // ── Check for conflicts (with FOR UPDATE lock) ─────────────
    const { hasConflict, conflictingSlot } = await checkConflict({
      conn,
      ground_id,
      date: slot_date,
      startTime: start_time,
      endTime: end_time,
      tenant_id,
    });

    if (hasConflict) {
      const err = new Error(
        `This time slot conflicts with an existing booking` +
        (conflictingSlot ? ` (${conflictingSlot.start_time.slice(0,5)}–${conflictingSlot.end_time.slice(0,5)})` : '')
      );
      err.statusCode = 409;
      err.code = 'CONFLICT';
      throw err;
    }

    // ── Create slot row ───────────────────────────────────────
    const [slotResult] = await conn.query(
      `INSERT INTO tbl_slots
        (ground_id, date, start_time, end_time, duration_minutes,
         normal_minutes, peak_minutes, price, price_breakdown,
         slot_type, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?)`,
      [
        ground_id, slot_date, start_time, end_time,
        priceResult.duration_minutes,
        priceResult.normal_minutes, priceResult.peak_minutes,
        priceResult.total_amount, priceResult.price_breakdown,
        priceResult.peak_minutes > priceResult.normal_minutes ? 'peak' : 'off_peak',
        tenant_id,
      ]
    );
    const slot_id = slotResult.insertId;

    const booking_no = await generateBookingNo();
    const original_amount = priceResult.total_amount;

    let base = original_amount;
    if (custom_price && parseFloat(custom_price) > 0) {
      base = parseFloat(custom_price);
    }

    let disc = 0;
    if (discount_value && parseFloat(discount_value) > 0) {
      if (discount_type === 'percent') {
        disc = Math.round((base * parseFloat(discount_value)) / 100);
      } else {
        disc = parseFloat(discount_value);
      }
      disc = Math.min(disc, base);
    }

    const surch = parseFloat(surcharge_amount) || 0;
    const total_amount = base - disc + surch;
    const adv = parseFloat(advance_amount) || 0;
    const balance_amount = total_amount - adv;

    const notes_pricing = [
      priceResult.is_mixed
        ? `Split: Normal ₹${priceResult.normal_amount} (${priceResult.normal_minutes}min) + Peak ₹${priceResult.peak_amount} (${priceResult.peak_minutes}min)`
        : null,
      custom_price && parseFloat(custom_price) > 0
        ? `Custom price: ₹${base} (calculated ₹${original_amount})`
        : null,
      disc > 0
        ? `Discount: -₹${disc}${discount_type === 'percent' ? ` (${discount_value}%)` : ''}`
        : null,
      surch > 0
        ? `Surcharge: +₹${surch}${surcharge_note ? ` (${surcharge_note})` : ''}`
        : null,
      pricing_note || null,
    ].filter(Boolean).join(' | ');

    let payment_status = 'pending';
    if (adv >= total_amount) payment_status = 'paid';
    else if (adv > 0) payment_status = 'partial';

    const customer_id = await findOrCreateCustomer({
      name: customer_name,
      phone: customer_phone,
      email: customer_email,
      tenant_id: tenant_id,
    });

    const [result] = await conn.query(
      `INSERT INTO tbl_bookings (
        customer_id, ground_id, booking_no, booking_type, slot_id,
        slot_date, start_time, end_time, duration_minutes,
        customer_name, customer_phone, customer_email,
        total_amount, original_amount, discount_amount, surcharge_amount,
        advance_amount, balance_amount,
        payment_status, payment_mode, booking_status,
        confirmed_at, notes, pricing_note, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', NOW(), ?, ?, ?)`,
      [
        customer_id, ground_id, booking_no, booking_type, slot_id,
        slot_date, start_time, end_time, priceResult.duration_minutes,
        customer_name, customer_phone, customer_email,
        total_amount, original_amount, disc, surch,
        adv, balance_amount,
        payment_status, payment_mode,
        notes, notes_pricing || null, tenant_id,
      ]
    );

    if (adv > 0) {
      const payType = adv >= total_amount ? 'full' : 'advance';
      await conn.query(
        'INSERT INTO tbl_payments (booking_id, amount, payment_mode, payment_type) VALUES (?, ?, ?, ?)',
        [result.insertId, adv, payment_mode, payType]
      );
    }

    await conn.commit();

    settingsService.checkAndRaiseSuggestion(ground_id);

    const [groundRows] = await db
      .promise()
      .query("SELECT name FROM tbl_grounds WHERE id = ?", [ground_id]);
    const ground_name = groundRows.length > 0 ? groundRows[0].name : null;

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

    // Update customer stats so total_bookings and total_spent stay accurate
    updateCustomerStats(customer_phone, tenant_id).catch(err => console.error('updateCustomerStats error:', err));

    return {
      booking_id: result.insertId, booking_no, slot_id,
      total_amount, balance_amount, payment_status,
      duration_minutes: priceResult.duration_minutes,
      normal_minutes: priceResult.normal_minutes,
      peak_minutes: priceResult.peak_minutes,
      price_breakdown: priceResult.breakdown,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── Approve Booking ───────────────────────────────
const approveBooking = async ({ booking_id, tenant_id = null, user_role = "admin" }) => {
    try {
        let selectQuery = "SELECT * FROM tbl_bookings WHERE id = ?";
        let selectParams = [booking_id];
        
        if (user_role === "admin" && tenant_id) {
            selectQuery += " AND tenant_id = ?";
            selectParams.push(tenant_id);
        }
        
        const [rows] = await db.promise().query(selectQuery, selectParams);
        
        if (rows.length === 0) {
            const err = new Error("Booking not found or unauthorized");
            err.statusCode = 404;
            throw err;
        }

        const booking = rows[0];

        // Read advance_payment_hours from the ground this booking belongs to.
        // This is the per-ground value the admin set in Manage Grounds.
        // Fall back to tbl_ground_settings if the ground row is missing for any reason.
        let advance_payment_hours = 2;
        if (booking.ground_id) {
            const [groundRows] = await db.promise().query(
                'SELECT advance_payment_hours FROM tbl_grounds WHERE id = ? AND flag = 0 LIMIT 1',
                [booking.ground_id]
            );
            if (groundRows.length > 0 && groundRows[0].advance_payment_hours) {
                advance_payment_hours = groundRows[0].advance_payment_hours;
            } else {
                // fallback to global settings
                try {
                    const settings = await getSettings();
                    advance_payment_hours = settings.advance_payment_hours || 2;
                } catch (_) {}
            }
        }

        const deadline = calculateDeadline(
            booking.slot_date,
            booking.start_time,
            advance_payment_hours,
        );

        let updateQuery = `
            UPDATE tbl_bookings
            SET booking_status = 'approved', approved_at = NOW(), approval_expires_at = ?
            WHERE id = ?
        `;
        let updateParams = [deadline, booking_id];
        
        if (user_role === "admin" && tenant_id) {
            updateQuery += " AND tenant_id = ?";
            updateParams.push(tenant_id);
        }

        await db.promise().query(updateQuery, updateParams);

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
const rejectBooking = async ({ booking_id, reason, tenant_id = null, user_role = "admin" }) => {
    try {
        let query = `UPDATE tbl_bookings SET booking_status = 'rejected', rejection_reason = ? WHERE id = ?`;
        let params = [reason, booking_id];
        
        if (user_role === "admin" && tenant_id) {
            query += " AND tenant_id = ?";
            params.push(tenant_id);
        }
        
        const [result] = await db.promise().query(query, params);
        
        if (result.affectedRows === 0) {
            const err = new Error("Booking not found or unauthorized");
            err.statusCode = 404;
            throw err;
        }
        
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
    tenant_id = null,
    user_role = "admin"
}) => {
    try {
        let selectQuery = "SELECT * FROM tbl_bookings WHERE id = ?";
        let selectParams = [booking_id];
        
        if (user_role === "admin" && tenant_id) {
            selectQuery += " AND tenant_id = ?";
            selectParams.push(tenant_id);
        }
        
        const [rows] = await db.promise().query(selectQuery, selectParams);
        
        if (rows.length === 0) {
            const err = new Error("Booking not found or unauthorized");
            err.statusCode = 404;
            throw err;
        }

        const booking = rows[0];

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

        let updateQuery = `
            UPDATE tbl_bookings
            SET advance_amount = ?, balance_amount = ?, payment_status = ?,
                payment_mode = ?, booking_status = 'confirmed', confirmed_at = NOW()
            WHERE id = ?
        `;
        let updateParams = [
            newAdvance,
            Math.max(0, newBalance),
            payment_status,
            payment_mode,
            booking_id,
        ];
        
        if (user_role === "admin" && tenant_id) {
            updateQuery += " AND tenant_id = ?";
            updateParams.push(tenant_id);
        }

        await db.promise().query(updateQuery, updateParams);

        await db
            .promise()
            .query("UPDATE tbl_slots SET status = 'booked' WHERE id = ?", [
                booking.slot_id,
            ]);

        await updateCustomerStats(booking.customer_phone, tenant_id);
        settingsService.checkAndRaiseSuggestion(booking.ground_id);

        // Send notifications (keep your existing notification code)
        
        return true;
    } catch (err) {
        throw err;
    }
};

// ── Cancel Booking ────────────────────────────────
const cancelBooking = async ({ booking_id, tenant_id = null, user_role = "admin" }) => {
    try {
        let selectQuery = "SELECT * FROM tbl_bookings WHERE id = ?";
        let selectParams = [booking_id];
        
        if (user_role === "admin" && tenant_id) {
            selectQuery += " AND tenant_id = ?";
            selectParams.push(tenant_id);
        }
        
        const [rows] = await db.promise().query(selectQuery, selectParams);
        
        if (rows.length === 0) {
            const err = new Error("Booking not found or unauthorized");
            err.statusCode = 404;
            throw err;
        }

        const booking = rows[0];

        let updateQuery = "UPDATE tbl_bookings SET booking_status = 'cancelled' WHERE id = ?";
        let updateParams = [booking_id];
        
        if (user_role === "admin" && tenant_id) {
            updateQuery += " AND tenant_id = ?";
            updateParams.push(tenant_id);
        }

        await db.promise().query(updateQuery, updateParams);

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
  payment_status,
  search,
  limit = 10,
  offset = 0,
  date = null,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    // ── Build shared WHERE conditions ──────────────
    const buildWhere = (alias = 'b') => {
      const conditions = [`${alias}.flag = 0`];
      const params = [];
      if (user_role === 'admin' && tenant_id) {
        conditions.push(`${alias}.tenant_id = ?`);
        params.push(tenant_id);
      }
      if (date) {
        conditions.push(`(${alias}.slot_date = ? OR DATE(${alias}.confirmed_at) = ?)`);
        params.push(date, date);
      }
      if (status) {
        conditions.push(`${alias}.booking_status = ?`);
        params.push(status);
      }
      if (payment_status) {
        conditions.push(`${alias}.payment_status = ?`);
        params.push(payment_status);
      }
      if (search) {
        conditions.push(`(${alias}.customer_name LIKE ? OR ${alias}.customer_phone LIKE ? OR ${alias}.bulk_booking_id LIKE ? OR ${alias}.booking_no LIKE ?)`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      return { where: 'WHERE ' + conditions.join(' AND '), params };
    };

    // ── Query 1: normal (non-bulk) bookings ────────
    const { where: w1, params: p1 } = buildWhere('b');
    const normalQuery = `
      SELECT b.id, b.booking_no, b.customer_name, b.customer_phone, b.customer_email,
             b.slot_date, b.start_time, b.end_time, b.total_amount, b.advance_amount,
             b.balance_amount, b.payment_status, b.booking_status, b.booking_type,
             b.payment_mode, b.notes, b.confirmed_at, b.created_at, b.tenant_id,
             b.ground_id, b.slot_id, b.bulk_booking_id,
             g.name AS ground_name,
             0 AS is_bulk, b.total_amount AS grand_total,
             b.advance_amount AS total_advance, b.balance_amount AS total_balance,
             1 AS slot_count, NULL AS date_range, b.booking_no AS sort_ref
      FROM tbl_bookings b
      LEFT JOIN tbl_grounds g ON g.id = b.ground_id
      ${w1} AND b.bulk_booking_id IS NULL
    `;

    // ── Query 2: bulk booking groups (one row per group) ──
    const { where: w2, params: p2 } = buildWhere('b');
    const bulkQuery = `
      SELECT
        MIN(b.id) AS id,
        b.bulk_booking_id AS booking_no,
        b.customer_name, b.customer_phone, b.customer_email,
        MIN(b.slot_date) AS slot_date, MIN(b.start_time) AS start_time,
        MAX(b.end_time) AS end_time,
        SUM(b.total_amount) AS total_amount,
        SUM(b.advance_amount) AS advance_amount,
        SUM(b.balance_amount) AS balance_amount,
        CASE
          WHEN SUM(b.balance_amount) = 0 THEN 'paid'
          WHEN SUM(b.advance_amount) > 0 THEN 'partial'
          ELSE 'pending'
        END AS payment_status,
        MAX(b.booking_status) AS booking_status,
        b.booking_type, b.payment_mode, b.notes, b.confirmed_at, MAX(b.created_at) AS created_at,
        b.tenant_id, b.ground_id, NULL AS slot_id, b.bulk_booking_id,
        g.name AS ground_name,
        1 AS is_bulk,
        SUM(b.total_amount) AS grand_total,
        SUM(b.advance_amount) AS total_advance,
        SUM(b.balance_amount) AS total_balance,
        COUNT(*) AS slot_count,
        CONCAT(
          DATE_FORMAT(MIN(b.slot_date), '%d %b'),
          CASE WHEN MIN(b.slot_date) != MAX(b.slot_date)
               THEN CONCAT(' – ', DATE_FORMAT(MAX(b.slot_date), '%d %b'))
               ELSE '' END
        ) AS date_range,
        b.bulk_booking_id AS sort_ref
      FROM tbl_bookings b
      LEFT JOIN tbl_grounds g ON g.id = b.ground_id
      ${w2} AND b.bulk_booking_id IS NOT NULL
      GROUP BY b.bulk_booking_id, b.customer_name, b.customer_phone, b.customer_email,
               b.booking_type, b.payment_mode, b.notes, b.confirmed_at, b.tenant_id,
               b.ground_id, g.name
    `;

    // ── UNION both, paginate ───────────────────────
    const unionQuery = `
      SELECT * FROM (
        ${normalQuery}
        UNION ALL
        ${bulkQuery}
      ) AS combined
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.promise().query(unionQuery, [...p1, ...p2, parseInt(limit), parseInt(offset)]);
    return rows.map(r => ({ ...r, is_bulk: !!r.is_bulk }));
  } catch (err) {
    throw err;
  }
};

// ── Get Total Bookings Count (for pagination) ───────────────────────
const getTotalBookingsCount = async ({
  status,
  payment_status,
  search,
  date = null,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    const buildWhere = (alias = 'b') => {
      const conditions = [`${alias}.flag = 0`];
      const params = [];
      if (user_role === 'admin' && tenant_id) { conditions.push(`${alias}.tenant_id = ?`); params.push(tenant_id); }
      if (date) { conditions.push(`(${alias}.slot_date = ? OR DATE(${alias}.confirmed_at) = ?)`); params.push(date, date); }
      if (status) { conditions.push(`${alias}.booking_status = ?`); params.push(status); }
      if (payment_status) { conditions.push(`${alias}.payment_status = ?`); params.push(payment_status); }
      if (search) {
        conditions.push(`(${alias}.customer_name LIKE ? OR ${alias}.customer_phone LIKE ? OR ${alias}.bulk_booking_id LIKE ? OR ${alias}.booking_no LIKE ?)`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      return { where: 'WHERE ' + conditions.join(' AND '), params };
    };

    // Count normal bookings
    const { where: w1, params: p1 } = buildWhere('b');
    const [[normalCount]] = await db.promise().query(
      `SELECT COUNT(*) AS cnt FROM tbl_bookings b ${w1} AND b.bulk_booking_id IS NULL`,
      p1
    );

    // Count distinct bulk groups
    const { where: w2, params: p2 } = buildWhere('b');
    const [[bulkCount]] = await db.promise().query(
      `SELECT COUNT(DISTINCT b.bulk_booking_id) AS cnt FROM tbl_bookings b ${w2} AND b.bulk_booking_id IS NOT NULL`,
      p2
    );

    return normalCount.cnt + bulkCount.cnt;
  } catch (err) {
    throw err;
  }
};

// ── Get Booking by ID ─────────────────────────────
const getBookingById = async ({
  booking_id,
  tenant_id = null,
  user_role = "admin",
}) => {
  try {
    let query = `
    SELECT b.*, g.name AS ground_name
    FROM tbl_bookings b
    LEFT JOIN tbl_grounds g ON g.id = b.ground_id
    WHERE b.id = ?
`;
    let params = [booking_id];

    if (user_role === "admin" && tenant_id) {
      query += " AND b.tenant_id = ?";
      params.push(tenant_id);
    }

    const [booking] = await db.promise().query(query, params);
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
    tenant_id = null,
    user_role = "admin"
}) => {
    try {
        let selectQuery = "SELECT id FROM tbl_bookings WHERE id = ?";
        let selectParams = [booking_id];
        
        if (user_role === "admin" && tenant_id) {
            selectQuery += " AND tenant_id = ?";
            selectParams.push(tenant_id);
        }
        
        const [rows] = await db.promise().query(selectQuery, selectParams);
        
        if (rows.length === 0) {
            const err = new Error("Booking not found or unauthorized");
            err.statusCode = 404;
            throw err;
        }

        let updateQuery = `
            UPDATE tbl_bookings
            SET customer_name = ?, customer_phone = ?, customer_email = ?,
                booking_type = ?, notes = ?
            WHERE id = ?
        `;
        let updateParams = [
            customer_name,
            customer_phone,
            customer_email || null,
            booking_type,
            notes || null,
            booking_id,
        ];
        
        if (user_role === "admin" && tenant_id) {
            updateQuery += " AND tenant_id = ?";
            updateParams.push(tenant_id);
        }

        await db.promise().query(updateQuery, updateParams);

        return true;
    } catch (err) {
        throw err;
    }
};

// ── Get Today's Stats ─────────────────────────────
const getTodayStats = async (tenant_id = null, user_role = "admin") => {
  try {
    // Use IST date for today
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    const tenantFilter = (user_role === 'admin' && tenant_id) ? 'AND b.tenant_id = ?' : '';
    const tenantParam  = (user_role === 'admin' && tenant_id) ? [tenant_id] : [];

    // ── Bookings created today (includes bulk, any slot date) ──
    const [bookingStats] = await db.promise().query(`
        SELECT
            COUNT(*)                                                              AS total,
            SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END)        AS confirmed,
            SUM(CASE WHEN booking_status = 'pending'   THEN 1 ELSE 0 END)        AS pending,
            SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END)        AS cancelled
        FROM tbl_bookings b
        WHERE DATE(b.created_at) = ? AND b.flag = 0
        ${tenantFilter}
    `, [today, ...tenantParam]);

    // ── Revenue = payments received today (advance + balance payments) ──
    const [revenueStats] = await db.promise().query(`
        SELECT COALESCE(SUM(p.amount), 0) AS revenue
        FROM tbl_payments p
        INNER JOIN tbl_bookings b ON b.id = p.booking_id AND b.flag = 0
        WHERE DATE(p.payment_date) = ?
        ${tenantFilter}
    `, [today, ...tenantParam]);

    return {
        total:     bookingStats[0].total     || 0,
        confirmed: bookingStats[0].confirmed || 0,
        pending:   bookingStats[0].pending   || 0,
        cancelled: bookingStats[0].cancelled || 0,
        revenue:   revenueStats[0].revenue   || 0,
    };
  } catch (err) {
    throw err;
  }
};

// ── Bulk Book ─────────────────────────────────────────────────
// Creates multiple bookings across multiple dates in one transaction.
// slots_by_date: [ { date: 'YYYY-MM-DD', start_time: 'HH:MM', end_time: 'HH:MM' }, ... ]
const bulkBook = async ({
  ground_id,
  customer_name,
  customer_phone,
  customer_email,
  booking_type,
  payment_mode,
  advance_amount,
  notes,
  slots_by_date,
  tenant_id,
}) => {
  const conn = await db.promise().getConnection();
  await conn.beginTransaction();
  try {
    // ── Get ground pricing config once ────────────
    const ground = await getGroundPricingConfig(db, ground_id, tenant_id);

    if (!slots_by_date.length) throw Object.assign(new Error('No slots selected'), { statusCode: 400 });
    if (slots_by_date.length > 100) throw Object.assign(new Error('Cannot book more than 100 slots at once.'), { statusCode: 400 });

    const customer_id = await findOrCreateCustomer({
      name: customer_name, phone: customer_phone,
      email: customer_email, tenant_id,
    });

    // ── Validate all slots + check conflicts + calculate prices ──
    let grand_total = 0;
    const bookingsToCreate = [];
    const skipped = [];

    for (const { date, start_time, end_time } of slots_by_date) {
      // Validate time + calculate price (throws if invalid)
      let priceResult;
      try {
        priceResult = calculatePrice({ startTime: start_time, endTime: end_time, ground });
      } catch (err) {
        skipped.push({ date, start_time, end_time, reason: err.message });
        continue;
      }

      // Check conflict for this date/time
      const { hasConflict, conflictingSlot } = await checkConflict({
        conn, ground_id, date, startTime: start_time, endTime: end_time, tenant_id,
      });

      if (hasConflict) {
        skipped.push({
          date, start_time, end_time,
          reason: `Conflicts with existing booking${conflictingSlot ? ` (${conflictingSlot.start_time.slice(0,5)}–${conflictingSlot.end_time.slice(0,5)})` : ''}`
        });
        continue;
      }

      grand_total += priceResult.total_amount;
      bookingsToCreate.push({ date, start_time, end_time, priceResult });
    }

    if (!bookingsToCreate.length) {
      throw Object.assign(new Error('All selected slots have conflicts or are invalid'), { statusCode: 409 });
    }

    // ── Generate bulk_booking_id ──────────────────
    const today = new Date();
    const bulkPrefix = `BLK-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const [[blkRow]] = await conn.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(bulk_booking_id, '-', -1) AS UNSIGNED)) AS max_serial
       FROM tbl_bookings WHERE bulk_booking_id LIKE ?`,
      [`${bulkPrefix}%`]
    );
    const bulk_booking_id = `${bulkPrefix}-${String((blkRow.max_serial || 0) + 1).padStart(3,'0')}`;

    // ── Generate booking numbers upfront ──────────
    const prefix = `SS-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const [[maxRow]] = await conn.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(booking_no, '-', -1) AS UNSIGNED)) AS max_serial
       FROM tbl_bookings WHERE booking_no LIKE ?`,
      [`${prefix}%`]
    );
    let serial = (maxRow.max_serial || 0) + 1;
    const bookingNumbers = bookingsToCreate.map(() => `${prefix}-${String(serial++).padStart(3,'0')}`);

    const adv = Math.min(parseFloat(advance_amount) || 0, grand_total);
    const created = [];

    for (let i = 0; i < bookingsToCreate.length; i++) {
      const { date, start_time, end_time, priceResult } = bookingsToCreate[i];
      const slotPrice = priceResult.total_amount;
      const booking_no = bookingNumbers[i];

      // Create slot row (status = booked immediately)
      const [slotResult] = await conn.query(
        `INSERT INTO tbl_slots
          (ground_id, date, start_time, end_time, duration_minutes,
           normal_minutes, peak_minutes, price, price_breakdown,
           slot_type, status, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?)`,
        [
          ground_id, date, start_time, end_time,
          priceResult.duration_minutes,
          priceResult.normal_minutes, priceResult.peak_minutes,
          slotPrice, priceResult.price_breakdown,
          priceResult.peak_minutes > priceResult.normal_minutes ? 'peak' : 'off_peak',
          tenant_id,
        ]
      );
      const slot_id = slotResult.insertId;

      // Advance: first booking gets full advance, rest get 0
      const slotAdv    = i === 0 ? Math.min(adv, slotPrice) : 0;
      const balance    = slotPrice - slotAdv;
      const pay_status = slotAdv >= slotPrice ? 'paid' : slotAdv > 0 ? 'partial' : 'pending';

      const pricingNote = priceResult.is_mixed
        ? `Split: Normal ₹${priceResult.normal_amount} (${priceResult.normal_minutes}min) + Peak ₹${priceResult.peak_amount} (${priceResult.peak_minutes}min)`
        : null;

      const [result] = await conn.query(
        `INSERT INTO tbl_bookings (
          customer_id, ground_id, booking_no, booking_type, slot_id,
          slot_date, start_time, end_time, duration_minutes,
          customer_name, customer_phone, customer_email,
          total_amount, original_amount, advance_amount, balance_amount,
          payment_status, payment_mode, booking_status,
          confirmed_at, notes, pricing_note, tenant_id, bulk_booking_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'confirmed',NOW(),?,?,?,?)`,
        [
          customer_id, ground_id, booking_no, booking_type, slot_id,
          date, start_time, end_time, priceResult.duration_minutes,
          customer_name, customer_phone, customer_email || null,
          slotPrice, slotPrice, slotAdv, balance,
          pay_status, payment_mode,
          notes || null, pricingNote, tenant_id, bulk_booking_id,
        ]
      );

      if (slotAdv > 0) {
        const payType = slotAdv >= slotPrice ? 'full' : 'advance';
        await conn.query(
          'INSERT INTO tbl_payments (booking_id, amount, payment_mode, payment_type) VALUES (?,?,?,?)',
          [result.insertId, slotAdv, payment_mode, payType]
        );
      }

      created.push({
        booking_id: result.insertId, booking_no, slot_id,
        advance_amount: slotAdv, balance_amount: balance,
        slot_date: date, start_time, end_time,
        duration_minutes: priceResult.duration_minutes,
        total_amount: slotPrice,
      });
    }

    await conn.commit();

    // Non-blocking: stats + email
    updateCustomerStats(customer_phone, tenant_id).catch(() => {});
    if (customer_email) {
      const [groundRows] = await db.promise().query('SELECT name FROM tbl_grounds WHERE id = ?', [ground_id]);
      const ground_name = groundRows[0]?.name || '';
      sendBookingConfirmation({
        customer_name, customer_email,
        booking_no: bulk_booking_id,
        slot_date: created[0].slot_date,
        start_time: created[0].start_time,
        end_time: created[created.length - 1].end_time,
        ground_name, total_amount: grand_total,
        advance_amount: adv, balance_amount: grand_total - adv, payment_mode,
      }).catch(() => {});
    }

    return {
      created, bulk_booking_id, grand_total,
      advance_paid: adv, balance_due: grand_total - adv,
      skipped,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── Record Bulk Payment ───────────────────────────────────────
// Distributes a payment amount across all unpaid/partial bookings in a bulk group
const recordBulkPayment = async ({ bulk_booking_id, amount, payment_mode, tenant_id = null, user_role = 'admin' }) => {
    try {
        let query = `SELECT * FROM tbl_bookings WHERE bulk_booking_id = ? AND flag = 0 AND balance_amount > 0`;
        const params = [bulk_booking_id];
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }
        query += ' ORDER BY slot_date ASC, start_time ASC';
        const [bookings] = await db.promise().query(query, params);
        if (!bookings.length) {
            const err = new Error('No outstanding balance found for this bulk booking');
            err.statusCode = 400;
            throw err;
        }

        const totalBalance = bookings.reduce((s, b) => s + parseFloat(b.balance_amount), 0);
        let remaining = Math.min(parseFloat(amount), totalBalance);
        if (remaining <= 0) {
            const err = new Error('Amount must be greater than zero');
            err.statusCode = 400;
            throw err;
        }

        // Distribute payment across slots in order (fill each slot fully before moving to next)
        for (const booking of bookings) {
            if (remaining <= 0) break;
            const bal = parseFloat(booking.balance_amount);
            const paying = Math.min(remaining, bal);
            remaining -= paying;

            const newAdvance = parseFloat(booking.advance_amount) + paying;
            const newBalance = Math.max(0, parseFloat(booking.total_amount) - newAdvance);
            const pay_status = newBalance <= 0 ? 'paid' : 'partial';

            await db.promise().query(
                `INSERT INTO tbl_payments (booking_id, amount, payment_mode, payment_type) VALUES (?,?,?,?)`,
                [booking.id, paying, payment_mode, newBalance <= 0 ? 'full' : 'advance']
            );
            await db.promise().query(
                `UPDATE tbl_bookings SET advance_amount=?, balance_amount=?, payment_status=?, payment_mode=? WHERE id=?`,
                [newAdvance, newBalance, pay_status, payment_mode, booking.id]
            );
        }

        // Return updated group totals
        const [updated] = await db.promise().query(
            `SELECT SUM(total_amount) AS grand_total, SUM(advance_amount) AS total_advance, SUM(balance_amount) AS total_balance
             FROM tbl_bookings WHERE bulk_booking_id = ? AND flag = 0`,
            [bulk_booking_id]
        );
        return updated[0];
    } catch (err) { throw err; }
};

// ── Soft Delete Booking ───────────────────────────────────────
const deleteBooking = async ({ booking_id, tenant_id = null, user_role = 'admin' }) => {
    try {
        // ── Must be cancelled before deleting ────────────────
        let checkQuery = 'SELECT booking_status FROM tbl_bookings WHERE id = ? AND flag = 0';
        const checkParams = [booking_id];
        if (user_role === 'admin' && tenant_id) {
            checkQuery += ' AND tenant_id = ?';
            checkParams.push(tenant_id);
        }
        const [rows] = await db.promise().query(checkQuery, checkParams);

        if (rows.length === 0) {
            const err = new Error('Booking not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }

        if (rows[0].booking_status !== 'cancelled') {
            const err = new Error('Booking must be cancelled before it can be deleted. Please cancel it first.');
            err.statusCode = 400;
            throw err;
        }

        // ── Safe to delete ────────────────────────────────────
        let query = 'UPDATE tbl_bookings SET flag = 1 WHERE id = ? AND flag = 0';
        const params = [booking_id];
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }
        const [result] = await db.promise().query(query, params);
        if (result.affectedRows === 0) {
            const err = new Error('Booking not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }
        return true;
    } catch (err) { throw err; }
};


// ── Bulk Booking Group ────────────────────────────────────────
const getBulkBookingGroup = async (bulk_booking_id, tenant_id = null, user_role = 'admin') => {
  try {
    let query = `
      SELECT b.*, g.name AS ground_name
      FROM tbl_bookings b
      LEFT JOIN tbl_grounds g ON g.id = b.ground_id
      WHERE b.bulk_booking_id = ? AND b.flag = 0
    `;
    const params = [bulk_booking_id];
    if (user_role === 'admin' && tenant_id) {
      query += ' AND b.tenant_id = ?';
      params.push(tenant_id);
    }
    query += ' ORDER BY b.slot_date ASC, b.start_time ASC';
    const [rows] = await db.promise().query(query, params);
    if (!rows.length) return null;

    const grand_total    = rows.reduce((s, r) => s + parseFloat(r.total_amount), 0);
    const total_advance  = rows.reduce((s, r) => s + parseFloat(r.advance_amount || 0), 0);
    const total_balance  = rows.reduce((s, r) => s + parseFloat(r.balance_amount || 0), 0);

    return {
      bulk_booking_id,
      bookings: rows,
      customer_name:  rows[0].customer_name,
      customer_phone: rows[0].customer_phone,
      customer_email: rows[0].customer_email,
      ground_name:    rows[0].ground_name,
      booking_type:   rows[0].booking_type,
      payment_mode:   rows[0].payment_mode,
      grand_total, total_advance, total_balance,
      slot_count: rows.length,
    };
  } catch (err) { throw err; }
};

module.exports = {
  getSettings,

  getAvailableDates,
  createBooking,
  quickBook,
  bulkBook,
  getBulkBookingGroup,
  recordBulkPayment,
  approveBooking,
  rejectBooking,
  recordPayment,
  recordBulkPayment,
  cancelBooking,
  deleteBooking,
  getAllBookings,
  getTotalBookingsCount,
  getBookingById,
  expireBookings,
  getTodayStats,
  updateBooking,
};