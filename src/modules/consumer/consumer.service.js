const db = require('../../config/db.config');

// ══════════════════════════════════════════════════
// EXISTING APIs — legacy single-ground (tbl_ground_settings)
// Kept so the old consumer frontend doesn't break
// ══════════════════════════════════════════════════

// ── Get Ground Info (public) ──────────────────────
const getGroundInfo = async () => {
    try {
        const [rows] = await db.promise().query(
            `SELECT
                ground_name, ground_address, ground_phone,
                open_time, close_time, slot_duration,
                peak_start_time, peak_end_time,
                peak_price, off_peak_price,
                advance_booking_days, advance_payment_hours
             FROM tbl_ground_settings LIMIT 1`
        );
        if (rows.length === 0) {
            const err = new Error('Ground settings not configured');
            err.statusCode = 503;
            throw err;
        }
        return rows[0];
    } catch (err) {
        throw err;
    }
};

// ── Get Available Dates (legacy) ──────────────────
const getAvailableDates = async () => {
    try {
        const [rows] = await db.promise().query(
            'SELECT advance_booking_days FROM tbl_ground_settings LIMIT 1'
        );
        const days  = rows[0]?.advance_booking_days ?? 3;
        const dates = [];
        for (let i = 0; i <= days; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            dates.push(date.toISOString().split('T')[0]);
        }
        return dates;
    } catch (err) {
        throw err;
    }
};

// ── Generate Slots for Date (legacy, no ground_id) ─
// Fixed: uses INSERT IGNORE to prevent duplicate-key crash
const generateSlotsForDate = async (date, settings) => {
    try {
        const open         = settings.open_time.slice(0, 5);
        const close        = settings.close_time.slice(0, 5);
        const duration     = settings.slot_duration;
        const peakStart    = settings.peak_start_time.slice(0, 5);
        const peakEnd      = settings.peak_end_time.slice(0, 5);
        const offPeakPrice = settings.off_peak_price;
        const peakPrice    = settings.peak_price;

        const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const toTime = (mins) => {
            const h = String(Math.floor(mins / 60)).padStart(2, '0');
            const m = String(mins % 60).padStart(2, '0');
            return `${h}:${m}:00`;
        };

        const openMins      = toMins(open);
        let   closeMins     = toMins(close);
        // Overnight support: if close ≤ open, closing is next day
        if (closeMins <= openMins) closeMins += 24 * 60;
        const peakStartMins = toMins(peakStart);
        const peakEndMins   = toMins(peakEnd);
        let current         = openMins;

        while (current + duration <= closeMins) {
            const start    = toTime(current);
            const end      = toTime(current + duration);
            const isPeak   = current >= peakStartMins && current < peakEndMins;
            const slotType = isPeak ? 'peak' : 'off_peak';
            const price    = isPeak ? peakPrice : offPeakPrice;

            await db.promise().query(
                `INSERT IGNORE INTO tbl_slots (date, start_time, end_time, slot_type, price, status)
                 VALUES (?, ?, ?, ?, ?, 'available')`,
                [date, start, end, slotType, price]
            );

            current += duration;
        }
    } catch (err) {
        throw err;
    }
};

// ── Get Slots for Date (legacy consumer view) ─────
const getSlotsForDate = async (date) => {
    try {
        const [settingsRows] = await db.promise().query('SELECT * FROM tbl_ground_settings LIMIT 1');
        if (settingsRows.length === 0) {
            const err = new Error('Ground settings not configured');
            err.statusCode = 503;
            throw err;
        }

        await generateSlotsForDate(date, settingsRows[0]);

        const [slots] = await db.promise().query(
            `SELECT
                s.id,
                DATE_FORMAT(s.date, '%Y-%m-%d') AS date,
                s.start_time,
                s.end_time,
                s.slot_type,
                s.price,
                s.status AS slot_status,
                b.booking_status
             FROM tbl_slots s
             LEFT JOIN tbl_bookings b
                ON b.slot_id = s.id
                AND b.booking_status IN ('pending', 'approved', 'confirmed')
             WHERE s.date = ?
             ORDER BY s.start_time`,
            [date]
        );

        return slots.map(slot => {
            let availability = 'available';
            if (slot.slot_status === 'blocked')                                          availability = 'blocked';
            else if (slot.slot_status === 'booked')                                      availability = 'booked';
            else if (slot.booking_status === 'confirmed')                                availability = 'booked';
            else if (slot.booking_status === 'pending' || slot.booking_status === 'approved') availability = 'unavailable';

            return {
                slot_id:    slot.id,
                date:       slot.date,
                start_time: slot.start_time,
                end_time:   slot.end_time,
                slot_type:  slot.slot_type,
                price:      slot.price,
                availability
            };
        });
    } catch (err) {
        throw err;
    }
};

// ── Submit Booking Request (legacy consumer) ──────
const submitBooking = async ({ slot_id, slot_date, customer_name, customer_phone, customer_email, notes }) => {
    try {
        const [slotRows] = await db.promise().query('SELECT * FROM tbl_slots WHERE id = ?', [slot_id]);
        if (slotRows.length === 0) {
            const err = new Error('Slot not found'); err.statusCode = 404; throw err;
        }

        const slot = slotRows[0];

        if (slot.status === 'blocked') {
            const err = new Error('This slot is not available for booking'); err.statusCode = 409; throw err;
        }

        const [activeBooking] = await db.promise().query(
            `SELECT id FROM tbl_bookings
             WHERE slot_id = ? AND booking_status IN ('pending', 'approved', 'confirmed')`,
            [slot_id]
        );
        if (activeBooking.length > 0) {
            const err = new Error('This slot is already taken'); err.statusCode = 409; throw err;
        }

        const availableDates = await getAvailableDates();
        if (!availableDates.includes(slot_date)) {
            const err = new Error('Booking is not allowed for this date'); err.statusCode = 400; throw err;
        }

        const today  = new Date();
        const dd     = String(today.getDate()).padStart(2, '0');
        const mm     = String(today.getMonth() + 1).padStart(2, '0');
        const yy     = today.getFullYear();
        const prefix = `SS-${yy}${mm}${dd}`;

        const [countRows] = await db.promise().query(
            'SELECT MAX(CAST(SUBSTRING_INDEX(booking_no, \'-\', -1) AS UNSIGNED)) as max_serial FROM tbl_bookings WHERE booking_no LIKE ?', [`${prefix}%`]
        );
        const booking_no   = `${prefix}-${String((countRows[0].max_serial || 0) + 1).padStart(3, '0')}`;
        const total_amount = slot.price;
        const tenant_id    = slot.tenant_id || 0;

        const [result] = await db.promise().query(
            `INSERT INTO tbl_bookings (
                booking_no, booking_type, slot_id,
                slot_date, start_time, end_time,
                customer_name, customer_phone, customer_email,
                total_amount, advance_amount, balance_amount,
                payment_status, booking_status, notes, tenant_id
            ) VALUES (?, 'online', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', 'pending', ?, ?)`,
            [booking_no, slot_id, slot_date, slot.start_time, slot.end_time, customer_name, customer_phone, customer_email || null, total_amount, total_amount, notes || null, tenant_id]
        );

        return {
            booking_id: result.insertId,
            booking_no,
            slot_date,
            start_time:     slot.start_time,
            end_time:       slot.end_time,
            total_amount,
            booking_status: 'pending',
            message: 'Your booking request has been submitted. You will be notified once it is approved.'
        };
    } catch (err) {
        throw err;
    }
};

// ── Get Booking Status (consumer tracking) ───────
const getBookingStatus = async ({ booking_no, customer_phone }) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT
                booking_no, booking_type,
                DATE_FORMAT(slot_date, '%Y-%m-%d') AS slot_date,
                start_time, end_time,
                customer_name, customer_phone, customer_email,
                total_amount, advance_amount, balance_amount,
                payment_status, booking_status,
                approval_expires_at, rejection_reason,
                created_at, confirmed_at
             FROM tbl_bookings
             WHERE booking_no = ? AND customer_phone = ?`,
            [booking_no, customer_phone]
        );

        if (rows.length === 0) {
            const err = new Error('Booking not found. Please check your booking number and phone number.');
            err.statusCode = 404;
            throw err;
        }

        const booking = rows[0];
        let status_message = '';

        switch (booking.booking_status) {
            case 'pending':
                status_message = 'Your booking request is pending admin approval.';
                break;
            case 'approved':
                const deadline = booking.approval_expires_at
                    ? new Date(booking.approval_expires_at).toLocaleString('en-IN')
                    : 'soon';
                status_message = `Your booking is approved! Please pay the advance before ${deadline} to confirm.`;
                break;
            case 'confirmed':
                status_message = 'Your booking is confirmed.';
                break;
            case 'rejected':
                status_message = `Your booking was rejected. Reason: ${booking.rejection_reason || 'Not specified'}`;
                break;
            case 'cancelled':
                status_message = 'Your booking has been cancelled.';
                break;
            case 'expired':
                status_message = 'Your booking approval has expired because payment was not received in time.';
                break;
            default:
                status_message = booking.booking_status;
        }

        return { ...booking, status_message };
    } catch (err) {
        throw err;
    }
};


// ── Get Tenant Info by Slug (public) ─────────────
const getTenantInfo = async (slug) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT t.id, t.business_name, t.slug, t.city, t.status,
                    u.email, u.phone
             FROM tbl_tenants t
             LEFT JOIN tbl_users u ON u.id = t.user_id
             WHERE t.slug = ? LIMIT 1`,
            [slug]
        );
        if (rows.length === 0) {
            const err = new Error('Tenant not found'); err.statusCode = 404; throw err;
        }
        return rows[0];
    } catch (err) { 
        throw err;
    }
};

// ══════════════════════
// NEW MULTI-GROUND APIs
// ══════════════════════

// ── Get All Active Grounds (with images) ─────────
const getAllActiveGrounds = async (tenant_id) => {
    try {
        const [grounds] = await db.promise().query(
            `SELECT
                g.id, g.name, g.address, g.phone, g.sport_type,
                g.open_time, g.close_time, g.slot_duration,
                g.peak_start_time, g.peak_end_time,
                g.peak_price, g.off_peak_price,
                g.advance_booking_days, g.advance_payment_hours,
                g.maps_link,
                g.status,
                (SELECT filename FROM tbl_ground_images
                 WHERE ground_id = g.id AND is_primary = 1 LIMIT 1) AS primary_image
             FROM tbl_grounds g
             WHERE g.status = 'active' AND g.flag = 0 AND g.tenant_id = ?
             ORDER BY g.created_at ASC`,
            [tenant_id]
        );

        if (grounds.length === 0) return grounds;

        // Batch-fetch all images in a single query instead of N+1 per ground
        const groundIds = grounds.map(g => g.id);
        const [allImages] = await db.promise().query(
            `SELECT id, ground_id, filename, is_primary
             FROM tbl_ground_images
             WHERE ground_id IN (?)
             ORDER BY is_primary DESC, id ASC`,
            [groundIds]
        );

        const imagesByGround = {};
        for (const img of allImages) {
            if (!imagesByGround[img.ground_id]) imagesByGround[img.ground_id] = [];
            imagesByGround[img.ground_id].push({
                id:         img.id,
                url:        `/uploads/grounds/${img.filename}`,
                is_primary: img.is_primary === 1
            });
        }

        for (const ground of grounds) {
            ground.images = imagesByGround[ground.id] || [];
        }

        return grounds;
    } catch (err) {
        throw err;
    }
};

// ── Get Available Dates for a Ground ─────────────
const getAvailableDatesForGround = async (groundId, tenant_id) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT advance_booking_days FROM tbl_grounds WHERE id = ? AND status = ? AND tenant_id = ?',
            [groundId, 'active', tenant_id]
        );
        if (rows.length === 0) {
            const err = new Error('Ground not found or inactive'); err.statusCode = 404; throw err;
        }

        const days  = rows[0].advance_booking_days ?? 7;
        const dates = [];
        for (let i = 0; i <= days; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            dates.push(date.toISOString().split('T')[0]);
        }
        return dates;
    } catch (err) {
        throw err;
    }
};

// ── Generate Slots for Ground + Date ─────────────
// Fixed: uses INSERT IGNORE to prevent duplicate-key crash across grounds
const generateSlotsForGroundDate = async (groundId, date, settings) => {
    try {
        const open      = settings.open_time.slice(0, 5);
        const close     = settings.close_time.slice(0, 5);
        const duration  = settings.slot_duration;
        const peakStart = settings.peak_start_time.slice(0, 5);
        const peakEnd   = settings.peak_end_time.slice(0, 5);

        const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const toTime = (mins) => {
            const h = String(Math.floor(mins / 60)).padStart(2, '0');
            const m = String(mins % 60).padStart(2, '0');
            return `${h}:${m}:00`;
        };

        const openMins      = toMins(open);
        let   closeMins     = toMins(close);
        // Overnight support: if close ≤ open, closing is next day
        if (closeMins <= openMins) closeMins += 24 * 60;
        const peakStartMins = toMins(peakStart);
        const peakEndMins   = toMins(peakEnd);
        let current         = openMins;

        while (current + duration <= closeMins) {
            const start    = toTime(current);
            const end      = toTime(current + duration);
            const isPeak   = current >= peakStartMins && current < peakEndMins;
            const slotType = isPeak ? 'peak' : 'off_peak';
            const price    = isPeak ? settings.peak_price : settings.off_peak_price;

            await db.promise().query(
                `INSERT IGNORE INTO tbl_slots (ground_id, date, start_time, end_time, slot_type, price, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'available')`,
                [groundId, date, start, end, slotType, price]
            );

            current += duration;
        }
    } catch (err) {
        throw err;
    }
};

// ── Get Slots for Ground + Date ───────────────────
const getSlotsForGroundDate = async (groundId, date, tenant_id) => {
    try {
        const gId = parseInt(groundId);

        const [groundRows] = await db.promise().query(
            'SELECT * FROM tbl_grounds WHERE id = ? AND status = ? AND tenant_id = ?', [gId, 'active', tenant_id]
        );
        if (groundRows.length === 0) {
            const err = new Error('Ground not found or inactive'); err.statusCode = 404; throw err;
        }

        await generateSlotsForGroundDate(gId, date, groundRows[0], tenant_id);

        const [slots] = await db.promise().query(
            `SELECT
                s.id,
                DATE_FORMAT(s.date, '%Y-%m-%d') AS date,
                s.start_time,
                s.end_time,
                s.slot_type,
                s.price,
                s.status AS slot_status,
                b.booking_status,
                b.booking_no,
                b.customer_name,
                b.customer_phone,
                b.booking_type,
                b.advance_amount,
                b.total_amount,
                b.payment_status
             FROM tbl_slots s
             LEFT JOIN tbl_bookings b
                ON b.slot_id = s.id
                AND b.booking_status IN ('pending', 'approved', 'confirmed')
             WHERE s.ground_id = ? AND s.date = ?
             ORDER BY s.start_time`,
            [gId, date]
        );

        // Filter out past slots when date is today
        const today   = new Date().toISOString().split('T')[0];
        const isToday = date === today;
        const nowMins = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;

        return slots
            .filter(slot => {
                if (isToday) {
                    const [h, m] = slot.start_time.slice(0, 5).split(':').map(Number);
                    return h * 60 + m > nowMins;
                }
                return true;
            })
            .map(slot => {
                let availability = 'available';
                if (slot.slot_status === 'blocked')                                               availability = 'blocked';
                else if (slot.slot_status === 'booked')                                           availability = 'booked';
                else if (slot.booking_status === 'confirmed')                                     availability = 'booked';
                else if (slot.booking_status === 'pending' || slot.booking_status === 'approved') availability = 'unavailable';

                return {
                    slot_id:        slot.id,
                    date:           slot.date,
                    start_time:     slot.start_time,
                    end_time:       slot.end_time,
                    slot_type:      slot.slot_type,
                    price:          slot.price,
                    availability,
                    booking_no:     slot.booking_no     || null,
                    customer_name:  slot.customer_name  || null,
                    customer_phone: slot.customer_phone || null,
                    booking_type:   slot.booking_type   || null,
                    advance_amount: slot.advance_amount || null,
                    total_amount:   slot.total_amount   || null,
                    payment_status: slot.payment_status || null,
                };
            });
    } catch (err) {
        throw err;
    }
};

// ── Submit Booking for Specific Ground ───────────
// Fixed: removed duplicate 'online' from params array (was shifting all columns by 1)
const submitGroundBooking = async ({ ground_id, slot_id, slot_date, customer_name, customer_phone, customer_email, notes, tenant_id }) => {
    try {
        const gId = parseInt(ground_id);

        const [groundRows] = await db.promise().query(
            'SELECT * FROM tbl_grounds WHERE id = ? AND status = ? AND tenant_id = ?', [gId, 'active', tenant_id]
        );
        if (groundRows.length === 0) {
            const err = new Error('Ground not found or inactive'); err.statusCode = 404; throw err;
        }
        const ground = groundRows[0];

        const [slotRows] = await db.promise().query(
            'SELECT * FROM tbl_slots WHERE id = ? AND ground_id = ?', [slot_id, gId]
        );
        if (slotRows.length === 0) {
            const err = new Error('Slot not found'); err.statusCode = 404; throw err;
        }
        const slot = slotRows[0];

        if (slot.status === 'blocked') {
            const err = new Error('This slot is not available for booking'); err.statusCode = 409; throw err;
        }

        const [activeBooking] = await db.promise().query(
            `SELECT id FROM tbl_bookings
             WHERE slot_id = ? AND booking_status IN ('pending', 'approved', 'confirmed')`,
            [slot_id]
        );
        if (activeBooking.length > 0) {
            const err = new Error('This slot is already taken'); err.statusCode = 409; throw err;
        }

        const availableDates = await getAvailableDatesForGround(gId, ground.tenant_id);
        if (!availableDates.includes(slot_date)) {
            const err = new Error('Booking is not allowed for this date'); err.statusCode = 400; throw err;
        }

        const today  = new Date();
        const dd     = String(today.getDate()).padStart(2, '0');
        const mm     = String(today.getMonth() + 1).padStart(2, '0');
        const yy     = today.getFullYear();
        const prefix = `SS-${yy}${mm}${dd}`;

        const [countRows] = await db.promise().query(
            'SELECT MAX(CAST(SUBSTRING_INDEX(booking_no, \'-\', -1) AS UNSIGNED)) as max_serial FROM tbl_bookings WHERE booking_no LIKE ?', [`${prefix}%`]
        );
        const booking_no   = `${prefix}-${String((countRows[0].max_serial || 0) + 1).padStart(3, '0')}`;
        const total_amount = slot.price;
        const tenant_id    = ground.tenant_id || 0;

        const [result] = await db.promise().query(
            `INSERT INTO tbl_bookings (
                booking_no, booking_type, ground_id, slot_id,
                slot_date, start_time, end_time,
                customer_name, customer_phone, customer_email,
                total_amount, advance_amount, balance_amount,
                payment_status, booking_status, notes, tenant_id
            ) VALUES (?, 'online', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', 'pending', ?, ?)`,
            [
                booking_no, gId, slot_id, slot_date,
                slot.start_time, slot.end_time,
                customer_name, customer_phone, customer_email || null,
                total_amount, total_amount, notes || null, tenant_id
            ]
        );

        return {
            booking_id:     result.insertId,
            booking_no,
            ground_id:      gId,
            ground_name:    ground.name,
            slot_date,
            start_time:     slot.start_time,
            end_time:       slot.end_time,
            total_amount,
            booking_status: 'pending',
            message: 'Your booking request has been submitted. You will be notified once it is approved.'
        };
    } catch (err) {
        throw err;
    }
};

module.exports = {
    // Legacy single-ground
    getGroundInfo,
    getAvailableDates,
    getSlotsForDate,
    submitBooking,
    getBookingStatus,
    // Tenant info
    getTenantInfo,
    // Multi-ground
    getAllActiveGrounds,
    getAvailableDatesForGround,
    getSlotsForGroundDate,
    submitGroundBooking
};