/**
 * Key rules:
 *  - Price is calculated per minute based on normal/peak rate per 30 min
 *  - If a booking spans both normal and peak hours, each segment is priced
 *    separately and totalled (split at peak boundary)
 *  - Overnight support: close time < open time means next-day close
 *  - Minimum slot duration is enforced
 *  - Price is LOCKED at booking creation time — settings changes never
 *    retroactively affect confirmed bookings
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ── Helpers ──

/**
 * Convert "HH:MM" or "HH:MM:SS" to total minutes from midnight.
 */
const toMins = (t) => {
    if (!t) return 0;
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
};

/**
 * Convert total minutes to "HH:MM:SS" string.
 * Handles times > 24h (overnight) by wrapping with modulo.
 */
const toTimeStr = (mins) => {
    const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const m = String(wrapped % 60).padStart(2, '0');
    return `${h}:${m}:00`;
};

/**
 * Round to 2 decimal places to avoid floating point drift.
 */
const round2 = (n) => Math.round(n * 100) / 100;


// ── Main Price Calculator ─────────────────────────────────────────────────

/**
 * calculatePrice({ startTime, endTime, ground })
 *
 * @param {string} startTime        - "HH:MM" or "HH:MM:SS"
 * @param {string} endTime          - "HH:MM" or "HH:MM:SS"
 * @param {object} ground           - ground row from tbl_grounds or tbl_ground_settings
 *   @param {number} ground.normal_rate_per_30   - ₹ per 30 min during normal hours
 *   @param {number} ground.peak_rate_per_30     - ₹ per 30 min during peak hours
 *   @param {string} ground.peak_start_time      - peak window start "HH:MM"
 *   @param {string} ground.peak_end_time        - peak window end "HH:MM"
 *   @param {string} ground.open_time            - ground opens "HH:MM"
 *   @param {string} ground.close_time           - ground closes "HH:MM"
 *   @param {number} ground.min_slot_minutes     - minimum bookable minutes
 *
 * @returns {object} {
 *   total_amount     : number   — total price (₹),
 *   normal_minutes   : number   — minutes in normal hours,
 *   peak_minutes     : number   — minutes in peak hours,
 *   normal_amount    : number   — ₹ from normal segment,
 *   peak_amount      : number   — ₹ from peak segment,
 *   duration_minutes : number   — total booking duration,
 *   is_mixed         : boolean  — spans both normal & peak,
 *   breakdown        : string   — human readable breakdown,
 *   price_breakdown  : string   — JSON string for DB storage
 * }
 *
 * @throws {Error} with .code if validation fails:
 *   'MIN_SLOT'        — duration < min_slot_minutes
 *   'OUTSIDE_HOURS'   — booking outside open/close window
 *   'INVALID_TIME'    — start >= end or bad format
 */
const calculatePrice = ({ startTime, endTime, ground }) => {
    const normalRate  = parseFloat(ground.normal_rate_per_30) || 100;
    const peakRate    = parseFloat(ground.peak_rate_per_30)   || 150;
    const minSlot     = parseInt(ground.min_slot_minutes)     || 30;

    const startMins   = toMins(startTime);
    let   endMins     = toMins(endTime);
    const peakSMins   = toMins(ground.peak_start_time);
    const peakEMins   = toMins(ground.peak_end_time);
    const openMins    = toMins(ground.open_time);
    let   closeMins   = toMins(ground.close_time);

    // Overnight close support (e.g. opens 06:00, closes 02:00 next day)
    if (closeMins <= openMins) closeMins += 24 * 60;

    // Overnight booking support (e.g. 23:00 → 01:00)
    if (endMins <= startMins) endMins += 24 * 60;

    const duration = endMins - startMins;

    // ── Validation ──────────────────────────────────────────────────────
    if (duration <= 0) {
        const err = new Error('End time must be after start time');
        err.code = 'INVALID_TIME';
        throw err;
    }

    if (duration < minSlot) {
        const err = new Error(
            `Minimum booking duration is ${minSlot} minutes. ` +
            `You selected ${duration} minutes.`
        );
        err.code = 'MIN_SLOT';
        err.min_slot = minSlot;
        err.selected = duration;
        throw err;
    }

    // Normalize startMins relative to open time for boundary checking
    let normStart = startMins;
    let normEnd   = endMins;
    // If start is before open (could happen with overnight) shift by 24h
    if (normStart < openMins) {
        normStart += 24 * 60;
        normEnd   += 24 * 60;
    }

    if (normStart < openMins || normEnd > closeMins) {
        const err = new Error(
            `Booking must be within operating hours ` +
            `(${ground.open_time ? ground.open_time.slice(0,5) : '?'} – ` +
            `${ground.close_time ? ground.close_time.slice(0,5) : '?'})`
        );
        err.code = 'OUTSIDE_HOURS';
        throw err;
    }

    // ── Per-minute rate calculation ──────────────────────────────────────
    // Rate per minute = rate_per_30 / 30
    const normalRatePerMin = normalRate / 30;
    const peakRatePerMin   = peakRate   / 30;

    let normalMins = 0;
    let peakMins   = 0;

    // Walk minute by minute to correctly handle all boundary cases
    // This is simple and correct. For a max booking of ~14hrs = 840 iterations — trivial.
    for (let m = startMins; m < endMins; m++) {
        const mNorm = m % (24 * 60); // wrap to 0-1439 for peak comparison
        const isPeak = mNorm >= peakSMins && mNorm < peakEMins;
        if (isPeak) peakMins++;
        else normalMins++;
    }

    const normalAmount = round2(normalMins * normalRatePerMin);
    const peakAmount   = round2(peakMins   * peakRatePerMin);
    const totalAmount  = round2(normalAmount + peakAmount);
    const isMixed      = normalMins > 0 && peakMins > 0;

    // ── Breakdown strings ────────────────────────────────────────────────
    let breakdown = '';
    if (isMixed) {
        breakdown =
            `Normal: ${normalMins} min × ₹${normalRatePerMin.toFixed(2)}/min = ₹${normalAmount} | ` +
            `Peak: ${peakMins} min × ₹${peakRatePerMin.toFixed(2)}/min = ₹${peakAmount} | ` +
            `Total: ₹${totalAmount}`;
    } else if (peakMins > 0) {
        breakdown = `Peak: ${peakMins} min × ₹${peakRatePerMin.toFixed(2)}/min = ₹${totalAmount}`;
    } else {
        breakdown = `Normal: ${normalMins} min × ₹${normalRatePerMin.toFixed(2)}/min = ₹${totalAmount}`;
    }

    const priceBreakdown = JSON.stringify({
        normal_minutes : normalMins,
        peak_minutes   : peakMins,
        normal_amount  : normalAmount,
        peak_amount    : peakAmount,
        normal_rate    : normalRate,
        peak_rate      : peakRate,
    });

    return {
        total_amount    : totalAmount,
        normal_minutes  : normalMins,
        peak_minutes    : peakMins,
        normal_amount   : normalAmount,
        peak_amount     : peakAmount,
        duration_minutes: duration,
        is_mixed        : isMixed,
        breakdown,
        price_breakdown : priceBreakdown,
    };
};


// ── Conflict Checker ──────────────────────────────────────────────────────

/**
 * Check if a proposed time slot overlaps with existing bookings.
 *
 * Uses SELECT ... FOR UPDATE inside a transaction to prevent race conditions.
 * Two bookings overlap if:  existing.start < proposed.end AND existing.end > proposed.start
 *
 * @param {object} db           - mysql2 pool
 * @param {object} conn         - active db connection (for transaction lock)
 * @param {number} ground_id
 * @param {string} date         - "YYYY-MM-DD"
 * @param {string} startTime    - "HH:MM" or "HH:MM:SS"
 * @param {string} endTime      - "HH:MM" or "HH:MM:SS"
 * @param {number|null} excludeSlotId  - slot id to exclude (for edits)
 * @param {number|null} tenant_id
 *
 * @returns {object} { hasConflict: boolean, conflictingSlot: object|null }
 */
const checkConflict = async ({
    conn,
    ground_id,
    date,
    startTime,
    endTime,
    excludeSlotId = null,
    tenant_id = null,
}) => {
    let query = `
        SELECT s.id, s.start_time, s.end_time, s.status,
               b.booking_no, b.customer_name
        FROM tbl_slots s
        LEFT JOIN tbl_bookings b ON b.slot_id = s.id
            AND b.booking_status IN ('pending','approved','confirmed')
            AND b.flag = 0
        WHERE s.ground_id = ?
          AND s.date = ?
          AND s.flag = 0
          AND s.status IN ('booked')
          AND s.start_time < ?
          AND s.end_time   > ?
    `;
    const params = [ground_id, date, endTime, startTime];

    if (excludeSlotId) {
        query += ' AND s.id != ?';
        params.push(excludeSlotId);
    }

    if (tenant_id) {
        query += ' AND s.tenant_id = ?';
        params.push(tenant_id);
    }

    // FOR UPDATE locks matching rows — prevents race condition
    query += ' FOR UPDATE';

    const [rows] = await conn.query(query, params);

    return {
        hasConflict    : rows.length > 0,
        conflictingSlot: rows[0] || null,
    };
};


// ── Validate Booking Time ─────────────────────────────────────────────────

/**
 * Validate that a booking time is within ground operating hours
 * and meets minimum slot requirements — without calculating price.
 * Useful for quick validation before opening a transaction.
 *
 * @returns {object} { valid: boolean, error: string|null }
 */
const validateBookingTime = ({ startTime, endTime, ground }) => {
    try {
        calculatePrice({ startTime, endTime, ground });
        return { valid: true, error: null };
    } catch (err) {
        return { valid: false, error: err.message, code: err.code };
    }
};


// ── Get Ground Pricing Config ─────────────────────────────────────────────

/**
 * Fetch the pricing config for a ground.
 * Falls back to tbl_ground_settings if ground row doesn't have rates set.
 *
 * @param {object} db
 * @param {number} ground_id
 * @param {number|null} tenant_id
 * @returns {object} ground row with pricing fields guaranteed
 */
const getGroundPricingConfig = async (db, ground_id, tenant_id = null) => {
    const [rows] = await db.promise().query(
        `SELECT g.*,
                COALESCE(g.normal_rate_per_30, gs.normal_rate_per_30, 100) AS normal_rate_per_30,
                COALESCE(g.peak_rate_per_30,   gs.peak_rate_per_30,   150) AS peak_rate_per_30,
                COALESCE(g.min_slot_minutes,   gs.min_slot_minutes,    30) AS min_slot_minutes
         FROM tbl_grounds g
         LEFT JOIN tbl_ground_settings gs ON gs.tenant_id = g.tenant_id AND gs.flag = 0
         WHERE g.id = ? AND g.flag = 0
         LIMIT 1`,
        [ground_id]
    );

    if (!rows.length) {
        const err = new Error('Ground not found');
        err.statusCode = 404;
        throw err;
    }

    return rows[0];
};


module.exports = {
    calculatePrice,
    checkConflict,
    validateBookingTime,
    getGroundPricingConfig,
    toMins,
    toTimeStr,
};