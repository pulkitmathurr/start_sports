const db     = require('../../config/db.config');
const logger = require('../../utils/logger');

// ── Get Ground Settings ───────────────────────────
const getSettings = async (tenant_id = null, user_role = 'admin') => {
    try {
        let query = 'SELECT * FROM tbl_ground_settings';
        let params = [];

        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            query += ' WHERE tenant_id = ?';
            params.push(tenant_id);
        }
        
        query += ' LIMIT 1';

        const [rows] = await db.promise().query(query, params);

        if (rows.length === 0) {
            // Return default settings if none exist for this tenant
            return {
                id: null,
                ground_name: '',
                ground_address: '',
                ground_phone: '',
                open_time: '06:00:00',
                close_time: '22:00:00',
                min_slot_minutes: 30,
                normal_rate_per_30: 100,
                peak_rate_per_30: 150,
                peak_start_time: '17:00:00',
                peak_end_time: '20:00:00',
                advance_booking_days: 7,
                advance_payment_hours: 2,
                tenant_id: tenant_id
            };
        }

        return rows[0];
    } catch (err) {
        throw err;
    }
};

// ── Update Ground Settings ────────────────────────
const updateSettings = async ({
    ground_name,
    ground_address,
    ground_phone,
    open_time,
    close_time,
    min_slot_minutes,
    normal_rate_per_30,
    peak_rate_per_30,
    peak_start_time,
    peak_end_time,
    advance_booking_days,
    advance_payment_hours
}, tenant_id = null, user_role = 'admin') => {
    try {
        // Check if settings exist for this tenant
        let checkQuery = 'SELECT id FROM tbl_ground_settings';
        let checkParams = [];

        if (user_role === 'admin' && tenant_id) {
            checkQuery += ' WHERE tenant_id = ?';
            checkParams.push(tenant_id);
        }
        checkQuery += ' LIMIT 1';

        const [existing] = await db.promise().query(checkQuery, checkParams);

        if (existing.length === 0) {
            // Insert new settings
            await db.promise().query(
                `INSERT INTO tbl_ground_settings 
                    (ground_name, ground_address, ground_phone, open_time, close_time, 
                     min_slot_minutes, normal_rate_per_30, peak_rate_per_30,
                     peak_start_time, peak_end_time,
                     advance_booking_days, advance_payment_hours, tenant_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ground_name || '',
                    ground_address || '',
                    ground_phone || '',
                    open_time,
                    close_time,
                    min_slot_minutes,
                    normal_rate_per_30,
                    peak_rate_per_30,
                    peak_start_time,
                    peak_end_time,
                    advance_booking_days,
                    advance_payment_hours,
                    tenant_id
                ]
            );
        } else {
            // Update existing settings
            let query = `
                UPDATE tbl_ground_settings SET
                    ground_name           = ?,
                    ground_address        = ?,
                    ground_phone          = ?,
                    open_time             = ?,
                    close_time            = ?,
                    min_slot_minutes      = ?,
                    normal_rate_per_30    = ?,
                    peak_rate_per_30      = ?,
                    peak_start_time       = ?,
                    peak_end_time         = ?,
                    advance_booking_days  = ?,
                    advance_payment_hours = ?
            `;
            let params = [
                ground_name, ground_address, ground_phone,
                open_time, close_time,
                min_slot_minutes, normal_rate_per_30, peak_rate_per_30,
                peak_start_time, peak_end_time,
                advance_booking_days, advance_payment_hours
            ];

            // ADD TENANT FILTER
            if (user_role === 'admin' && tenant_id) {
                query += ' WHERE tenant_id = ?';
                params.push(tenant_id);
            } else {
                query += ' WHERE id = 1';
            }

            await db.promise().query(query, params);
        }

        return true;
    } catch (err) {
        throw err;
    }
};

// ── Delete Future Slots ───────────────────────────
const deleteFutureSlots = async (tenant_id = null, user_role = 'admin') => {
    try {
        let query = `DELETE FROM tbl_slots WHERE date >= CURDATE()
            AND id NOT IN (
                SELECT slot_id FROM tbl_bookings
                WHERE booking_status IN ('pending','approved','confirmed')
                AND slot_date >= CURDATE()
            )`;
        let params = [];

        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }

        await db.promise().query(query, params);
        return true;
    } catch (err) {
        throw err;
    }
};

// ── Get ALL Pending Peak Suggestions (all grounds) ─
const getPendingSuggestion = async (tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            SELECT id, name,
                    peak_suggestion_start, peak_suggestion_end,
                    peak_suggestion_count, peak_suggestion_runner
             FROM tbl_grounds
             WHERE peak_suggestion_status = 'pending'
        `;
        let params = [];

        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }

        const [rows] = await db.promise().query(query, params);

        if (rows.length === 0) return null;

        return rows.map(g => ({
            ground_id:      g.id,
            ground_name:    g.name,
            suggested_start: g.peak_suggestion_start,
            suggested_end:   g.peak_suggestion_end,
            booking_count:   g.peak_suggestion_count,
            runner_up_count: g.peak_suggestion_runner
        }));
    } catch (err) {
        throw err;
    }
};

// ── Check and Raise Peak Suggestion (per ground) ──
const checkAndRaiseSuggestion = async (ground_id, tenant_id = null, user_role = 'admin') => {
    try {
        // First verify ground belongs to this tenant if admin
        if (user_role === 'admin' && tenant_id) {
            const [check] = await db.promise().query(
                'SELECT id FROM tbl_grounds WHERE id = ? AND tenant_id = ?',
                [ground_id, tenant_id]
            );
            if (check.length === 0) return;
        }

        const [topSlotsResult, groundResult] = await Promise.all([
            db.promise().query(
                `SELECT start_time, end_time, COUNT(*) AS booking_count
                 FROM tbl_bookings
                 WHERE booking_status = 'confirmed'
                   AND ground_id = ?
                   AND slot_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
                 GROUP BY start_time, end_time
                 ORDER BY booking_count DESC
                 LIMIT 2`,
                [ground_id]
            ),
            db.promise().query(
                `SELECT peak_start_time, peak_end_time,
                        peak_suggestion_start, peak_suggestion_end,
                        peak_suggestion_status
                 FROM tbl_grounds
                 WHERE id = ?`,
                [ground_id]
            )
        ]);

        const topSlots = topSlotsResult[0];
        const ground   = groundResult[0][0];

        if (topSlots.length === 0 || !ground) return;

        const top      = topSlots[0];
        const runnerUp = topSlots[1] || null;

        // Only suggest when #1 is strictly ahead of #2
        if (runnerUp && top.booking_count <= runnerUp.booking_count) return;

        const suggestedStart = top.start_time.slice(0, 5);
        const suggestedEnd   = top.end_time.slice(0, 5);
        const currentStart   = ground.peak_start_time ? ground.peak_start_time.slice(0, 5) : null;
        const currentEnd     = ground.peak_end_time   ? ground.peak_end_time.slice(0, 5)   : null;

        // Top slot is already the current peak window
        if (suggestedStart === currentStart && suggestedEnd === currentEnd) return;

        // Same suggestion already pending
        if (
            ground.peak_suggestion_status === 'pending' &&
            ground.peak_suggestion_start  === suggestedStart &&
            ground.peak_suggestion_end    === suggestedEnd
        ) return;

        await db.promise().query(
            `UPDATE tbl_grounds
             SET peak_suggestion_start  = ?,
                 peak_suggestion_end    = ?,
                 peak_suggestion_count  = ?,
                 peak_suggestion_runner = ?,
                 peak_suggestion_status = 'pending'
             WHERE id = ?`,
            [suggestedStart, suggestedEnd, top.booking_count, runnerUp ? runnerUp.booking_count : 0, ground_id]
        );

        logger.info('Peak suggestion raised', { ground_id, suggestedStart, suggestedEnd });

    } catch (err) {
        logger.error('Peak suggestion check failed', { message: err.message });
    }
};

// ── Accept Peak Suggestion for a ground ───────────
const acceptSuggestion = async (ground_id, tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            SELECT peak_suggestion_start, peak_suggestion_end, peak_suggestion_status
            FROM tbl_grounds WHERE id = ?
        `;
        let params = [ground_id];

        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }

        const [rows] = await db.promise().query(query, params);

        if (!rows[0] || rows[0].peak_suggestion_status !== 'pending') {
            const err = new Error('No pending suggestion found');
            err.statusCode = 404;
            throw err;
        }

        const s = rows[0];

        let updateQuery = `
            UPDATE tbl_grounds
            SET peak_start_time        = ?,
                peak_end_time          = ?,
                peak_suggestion_start  = NULL,
                peak_suggestion_end    = NULL,
                peak_suggestion_count  = NULL,
                peak_suggestion_runner = NULL,
                peak_suggestion_status = NULL
            WHERE id = ?
        `;
        let updateParams = [s.peak_suggestion_start, s.peak_suggestion_end, ground_id];

        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            updateQuery += ' AND tenant_id = ?';
            updateParams.push(tenant_id);
        }

        await Promise.all([
            db.promise().query(updateQuery, updateParams),
            db.promise().query(
                `DELETE FROM tbl_slots WHERE ground_id = ? AND date >= CURDATE()
                 AND id NOT IN (
                     SELECT slot_id FROM tbl_bookings
                     WHERE booking_status IN ('pending','approved','confirmed')
                     AND slot_date >= CURDATE()
                 )`,
                [ground_id]
            )
        ]);

        logger.info('Peak suggestion accepted', { ground_id });
        return true;
    } catch (err) {
        throw err;
    }
};

// ── Dismiss Peak Suggestion for a ground ──────────
const dismissSuggestion = async (ground_id, tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            UPDATE tbl_grounds
            SET peak_suggestion_start  = NULL,
                peak_suggestion_end    = NULL,
                peak_suggestion_count  = NULL,
                peak_suggestion_runner = NULL,
                peak_suggestion_status = NULL
            WHERE id = ?
        `;
        let params = [ground_id];

        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }

        const [result] = await db.promise().query(query, params);

        if (result.affectedRows === 0) {
            const err = new Error('Ground not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }

        logger.info('Peak suggestion dismissed', { ground_id });
        return true;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    getSettings,
    updateSettings,
    deleteFutureSlots,
    getPendingSuggestion,
    checkAndRaiseSuggestion,
    acceptSuggestion,
    dismissSuggestion
};