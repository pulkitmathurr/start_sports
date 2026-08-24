const db = require('../../config/db.config');
 
// ── Get All Grounds ───────────────────────────
const getAllGrounds = async (tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            SELECT g.*, 
                (SELECT filename FROM tbl_ground_images 
                 WHERE ground_id = g.id AND is_primary = 1 LIMIT 1) AS primary_image
             FROM tbl_grounds g WHERE g.flag = 0
        `;
        let params = [];
 
        // Only filter for admin users (super_admin sees all)
        if (user_role === 'admin' && tenant_id) {
            query += " AND g.tenant_id = ?";
            params.push(tenant_id);
        }
 
        query += " ORDER BY g.created_at DESC";
 
        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) {
        throw err;
    }
};
// ── Get Single Ground with Images ────────────
const getGroundById = async (id, tenant_id = null, user_role = 'admin') => {
    try {
        let query = 'SELECT * FROM tbl_grounds WHERE id = ? AND flag = 0';
        let params = [id];
 
        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            query += " AND tenant_id = ?";
            params.push(tenant_id);
        }
 
        const [rows] = await db.promise().query(query, params);
        
        if (rows.length === 0) {
            const err = new Error('Ground not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }
 
        const [images] = await db.promise().query(
            'SELECT * FROM tbl_ground_images WHERE ground_id = ? ORDER BY is_primary DESC, id ASC', [id]
        );
 
        return { ...rows[0], images };
    } catch (err) {
        throw err;
    }
};
 
// ── Create Ground ─────────────────────────────
const createGround = async (data, tenant_id = null) => {
    try {
        const {
            name, address, phone, sport_type,
            open_time, close_time, min_slot_minutes,
            normal_rate_per_30, peak_rate_per_30,
            peak_start_time, peak_end_time,
            peak_price, off_peak_price,
            advance_booking_days, advance_payment_hours
        } = data;
 
        // ── Plan ground limit check ───────────────────────────
        // Fetch the tenant's active plan and count existing grounds.
        // If at or over the limit, block creation with a clear error.
        if (tenant_id) {
            const [[limitRow]] = await db.promise().query(`
                SELECT p.max_grounds,
                       (SELECT COUNT(*) FROM tbl_grounds WHERE tenant_id = ? AND flag = 0) AS current_count
                FROM tbl_subscriptions s
                INNER JOIN tbl_plans p ON p.id = s.plan_id
                WHERE s.tenant_id = ?
                ORDER BY s.id DESC
                LIMIT 1
            `, [tenant_id, tenant_id]);
 
            if (limitRow && limitRow.max_grounds > 0 && limitRow.current_count >= limitRow.max_grounds) {
                const err = new Error(
                    `Your current plan allows a maximum of ${limitRow.max_grounds} ground${limitRow.max_grounds > 1 ? 's' : ''}. ` +
                    `Please upgrade your plan to add more grounds.`
                );
                err.statusCode = 403;
                throw err;
            }
        }
 
        const [result] = await db.promise().query(
            `INSERT INTO tbl_grounds
                (name, address, phone, sport_type,
                 open_time, close_time, min_slot_minutes,
                 normal_rate_per_30, peak_rate_per_30,
                 peak_start_time, peak_end_time,
                 peak_price, off_peak_price,
                 advance_booking_days, advance_payment_hours,
                 maps_link, amenities, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, address, phone, sport_type || 'cricket',
                open_time, close_time, parseInt(min_slot_minutes) || 30,
                parseFloat(normal_rate_per_30) || 100,
                parseFloat(peak_rate_per_30) || 150,
                peak_start_time, peak_end_time,
                parseFloat(peak_price) || 0, parseFloat(off_peak_price) || 0,
                parseInt(advance_booking_days), parseInt(advance_payment_hours),
                data.maps_link || null,
                data.amenities ? (typeof data.amenities === 'string' ? data.amenities : JSON.stringify(data.amenities)) : null,
                tenant_id
            ]
        );
        return result.insertId;
    } catch (err) {
        throw err;
    }
};
 
// ── Save Ground Images ────────────────────────
const saveGroundImages = async (groundId, filenames, tenant_id = null, user_role = 'admin') => {
    try {
        if (!filenames || filenames.length === 0) return;
 
        const gId = parseInt(groundId);
 
        // Verify ground belongs to this tenant
        if (user_role === 'admin' && tenant_id) {
            const [check] = await db.promise().query(
                'SELECT id FROM tbl_grounds WHERE id = ? AND tenant_id = ? AND flag = 0',
                [gId, tenant_id]
            );
            if (check.length === 0) {
                const err = new Error('Ground not found or unauthorized');
                err.statusCode = 404;
                throw err;
            }
        }
 
        const [existing] = await db.promise().query(
            'SELECT id FROM tbl_ground_images WHERE ground_id = ? AND is_primary = 1', [gId]
        );
        const hasPrimary = existing.length > 0;
 
        const values = filenames.map((filename, index) => [
            gId,
            filename,
            !hasPrimary && index === 0 ? 1 : 0
        ]);
 
        await db.promise().query(
            'INSERT INTO tbl_ground_images (ground_id, filename, is_primary) VALUES ?',
            [values]
        );
    } catch (err) {
        throw err;
    }
};
 
// ── Set Primary Image ─────────────────────────
const setPrimaryImage = async (groundId, imageId, tenant_id = null, user_role = 'admin') => {
    try {
        const gId = parseInt(groundId);
        const iId = parseInt(imageId);
 
        // Verify ground belongs to this tenant
        if (user_role === 'admin' && tenant_id) {
            const [check] = await db.promise().query(
                'SELECT id FROM tbl_grounds WHERE id = ? AND tenant_id = ? AND flag = 0',
                [gId, tenant_id]
            );
            if (check.length === 0) {
                const err = new Error('Ground not found or unauthorized');
                err.statusCode = 404;
                throw err;
            }
        }
 
        await db.promise().query(
            'UPDATE tbl_ground_images SET is_primary = 0 WHERE ground_id = ?', [gId]
        );
        await db.promise().query(
            'UPDATE tbl_ground_images SET is_primary = 1 WHERE id = ? AND ground_id = ?',
            [iId, gId]
        );
        return true;
    } catch (err) {
        throw err;
    }
};
 
// ── Delete Ground Image ───────────────────────
const deleteGroundImage = async (groundId, imageId, tenant_id = null, user_role = 'admin') => {
    try {
        const fs   = require('fs');
        const path = require('path');
 
        const gId = parseInt(groundId);
        const iId = parseInt(imageId);
 
        if (isNaN(gId) || isNaN(iId)) {
            const err = new Error('Invalid ground or image ID');
            err.statusCode = 400;
            throw err;
        }
 
        // Verify ground belongs to this tenant
        if (user_role === 'admin' && tenant_id) {
            const [check] = await db.promise().query(
                'SELECT id FROM tbl_grounds WHERE id = ? AND tenant_id = ? AND flag = 0',
                [gId, tenant_id]
            );
            if (check.length === 0) {
                const err = new Error('Ground not found or unauthorized');
                err.statusCode = 404;
                throw err;
            }
        }
 
        const [rows] = await db.promise().query(
            'SELECT filename, is_primary FROM tbl_ground_images WHERE id = ? AND ground_id = ?',
            [iId, gId]
        );
        if (rows.length === 0) return false;
 
        const { filename, is_primary } = rows[0];
 
        const filePath = path.join(__dirname, '../../public/uploads/grounds', filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
 
        await db.promise().query(
            'DELETE FROM tbl_ground_images WHERE id = ? AND ground_id = ?', [iId, gId]
        );
 
        // If the deleted image was primary, promote the next image to primary
        if (is_primary) {
            await db.promise().query(
                `UPDATE tbl_ground_images SET is_primary = 1 
                 WHERE ground_id = ? ORDER BY id ASC LIMIT 1`, [gId]
            );
        }
 
        return true;
    } catch (err) {
        throw err;
    }
};
 
// ── Update Ground ─────────────────────────────
const updateGround = async (id, data, tenant_id = null, user_role = 'admin') => {
    try {
        const {
            name, address, phone, sport_type,
            open_time, close_time, min_slot_minutes,
            normal_rate_per_30, peak_rate_per_30,
            peak_start_time, peak_end_time,
            peak_price, off_peak_price,
            advance_booking_days, advance_payment_hours,
            maps_link
        } = data;
 
        let query = `
            UPDATE tbl_grounds SET
                name                  = ?,
                address               = ?,
                phone                 = ?,
                sport_type            = ?,
                open_time             = ?,
                close_time            = ?,
                min_slot_minutes      = ?,
                normal_rate_per_30    = ?,
                peak_rate_per_30      = ?,
                peak_start_time       = ?,
                peak_end_time         = ?,
                peak_price            = ?,
                off_peak_price        = ?,
                advance_booking_days  = ?,
                advance_payment_hours = ?,
                maps_link             = ?,
                amenities             = ?
             WHERE id = ?
        `;
        let params = [
            name, address, phone, sport_type || 'cricket',
            open_time, close_time,
            parseInt(min_slot_minutes) || 30,
            parseFloat(normal_rate_per_30) || 100,
            parseFloat(peak_rate_per_30) || 150,
            peak_start_time, peak_end_time,
            parseFloat(peak_price) || 0, parseFloat(off_peak_price) || 0,
            parseInt(advance_booking_days), parseInt(advance_payment_hours),
            maps_link || null,
            data.amenities ? (typeof data.amenities === 'string' ? data.amenities : JSON.stringify(data.amenities)) : null,
            id
        ];
 
        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            query += " AND tenant_id = ?";
            params.push(tenant_id);
        }
 
        const [result] = await db.promise().query(query, params);
 
        if (result.affectedRows === 0) {
            const err = new Error('Ground not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }
 
        // Fix 1: only delete slots that are NOT tied to an active booking.
        // Deleting booked slots wipes the slot id, so INSERT IGNORE recreates them
        // as 'available' and the booking join finds nothing — slot looks free.
        await db.promise().query(`
            DELETE FROM tbl_slots
            WHERE ground_id = ?
              AND date >= CURDATE()
              AND id NOT IN (
                  SELECT slot_id FROM tbl_bookings
                  WHERE ground_id = ?
                    AND booking_status IN ('pending','approved','confirmed')
                    AND slot_date >= CURDATE()
              )
        `, [id, id]);
 
        return true;
    } catch (err) {
        throw err;
    }
};
 
// ── Toggle Ground Status ──────────────────────
const toggleStatus = async (id, tenant_id = null, user_role = 'admin') => {
    try {
        // Fix 2: before deactivating, check there are no confirmed/pending bookings
        // today or in the future. Allow reactivation freely.
        const [groundRows] = await db.promise().query(
            'SELECT status FROM tbl_grounds WHERE id = ? AND flag = 0 LIMIT 1', [id]
        );
        if (groundRows.length === 0) {
            const err = new Error('Ground not found');
            err.statusCode = 404;
            throw err;
        }
 
        const currentStatus = groundRows[0].status;
 
        if (currentStatus === 'active') {
            // Trying to deactivate — check for future/today bookings
            let checkQuery = `
                SELECT COUNT(*) as cnt FROM tbl_bookings
                WHERE ground_id = ?
                  AND slot_date >= CURDATE()
                  AND booking_status IN ('pending','approved','confirmed')
                  AND flag = 0
            `;
            let checkParams = [id];
            if (user_role === 'admin' && tenant_id) {
                checkQuery += ' AND tenant_id = ?';
                checkParams.push(tenant_id);
            }
            const [[{ cnt }]] = await db.promise().query(checkQuery, checkParams);
            if (cnt > 0) {
                const err = new Error(
                    `Cannot deactivate: ${cnt} active booking${cnt > 1 ? 's' : ''} exist for today or future dates. Cancel them first.`
                );
                err.statusCode = 400;
                throw err;
            }
        }
 
        let query = `UPDATE tbl_grounds SET status = IF(status='active','inactive','active') WHERE id = ?`;
        let params = [id];
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
 
        return { newStatus: currentStatus === 'active' ? 'inactive' : 'active' };
    } catch (err) {
        throw err;
    }
};
 
// ── Delete Ground ─────────────────────────────
const deleteGround = async (id, tenant_id = null, user_role = 'admin') => {
    try {
        let checkQuery = `
            SELECT id FROM tbl_bookings 
            WHERE ground_id = ? AND booking_status NOT IN ('cancelled','completed')
        `;
        let checkParams = [id];
 
        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            checkQuery += " AND tenant_id = ?";
            checkParams.push(tenant_id);
        }
        checkQuery += " LIMIT 1";
 
        const [bookings] = await db.promise().query(checkQuery, checkParams);
        
        if (bookings.length > 0) {
            const err = new Error('Cannot delete ground with active bookings');
            err.statusCode = 400;
            throw err;
        }
 
        const fs   = require('fs');
        const path = require('path');
        
        const [images] = await db.promise().query(
            'SELECT filename FROM tbl_ground_images WHERE ground_id = ?', [id]
        );
        images.forEach(img => {
            const filePath = path.join(__dirname, '../../public/uploads/grounds', img.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
 
        let updateQuery = 'UPDATE tbl_grounds SET flag = 1 WHERE id = ?';
        let updateParams = [id];
 
        // ADD TENANT FILTER
        if (user_role === 'admin' && tenant_id) {
            updateQuery += " AND tenant_id = ?";
            updateParams.push(tenant_id);
        }
 
        const [result] = await db.promise().query(updateQuery, updateParams);
 
        if (result.affectedRows === 0) {
            const err = new Error('Ground not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }
 
        // Delete future unbooked slots for this ground
        await db.promise().query(
            `DELETE FROM tbl_slots WHERE ground_id = ? AND date >= CURDATE()
             AND id NOT IN (
                 SELECT slot_id FROM tbl_bookings
                 WHERE booking_status IN ('pending','approved','confirmed')
                 AND slot_date >= CURDATE()
             )`,
            [id]
        );
 
        return true;
    } catch (err) {
        throw err;
    }
};
 
// ── Ground Blocks ─────────────────────────────────────────────────────────
 
const createGroundBlock = async ({ ground_id, start_date, end_date, block_type, start_time, end_time, reason, tenant_id }) => {
    try {
        const [result] = await db.promise().query(
            `INSERT INTO tbl_ground_blocks (ground_id, start_date, end_date, block_type, start_time, end_time, reason, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [ground_id, start_date, end_date, block_type,
             start_time || null, end_time || null,
             reason || null, tenant_id]
        );
        return result.insertId;
    } catch (err) { throw err; }
};
 
const getGroundBlocks = async (ground_id, tenant_id) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT * FROM tbl_ground_blocks
             WHERE ground_id = ? AND tenant_id = ? AND end_date >= CURDATE()
             ORDER BY start_date ASC`,
            [ground_id, tenant_id]
        );
        return rows;
    } catch (err) { throw err; }
};
 
const deleteGroundBlock = async (block_id, ground_id, tenant_id) => {
    try {
        await db.promise().query(
            `DELETE FROM tbl_ground_blocks WHERE id = ? AND ground_id = ? AND tenant_id = ?`,
            [block_id, ground_id, tenant_id]
        );
    } catch (err) { throw err; }
};
 
// Check if a given date+time slot falls inside any active block for that ground
const getActiveBlocksForDate = async (ground_id, date) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT * FROM tbl_ground_blocks
             WHERE ground_id = ? AND start_date <= ? AND DATE_ADD(end_date, INTERVAL 1 DAY) >= ?`,
            [ground_id, date, date]
        );
        return rows;
    } catch (err) { throw err; }
};
 
 

// ── Get Ground Slots ──────────────────────────────────────────
const getGroundSlots = async (ground_id, tenant_id = null) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT * FROM tbl_ground_slots WHERE ground_id = ? AND flag = 0 ORDER BY start_time ASC`,
            [ground_id]
        );
        return rows;
    } catch (err) { throw err; }
};

// ── Save Ground Slots (protect booked slots from timing changes) ──────────
const saveGroundSlots = async (ground_id, slots, tenant_id) => {
    try {
        const toMins = t => { if (!t) return 0; if (t.slice(0,5) === '24:00') return 1440; const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };

        // Build tenant filter clause (handles null tenant_id correctly)
        const tenantClause = tenant_id != null ? 'AND tenant_id = ?' : '';
        const tenantParam  = tenant_id != null ? [tenant_id] : [];

        // Soft-delete ALL existing template slots for this ground.
        // Bookings in tbl_bookings store their own start_time/end_time directly,
        // so they are completely unaffected by template changes.
        await db.promise().query(
            `UPDATE tbl_ground_slots SET flag = 1 WHERE ground_id = ? ${tenantClause}`,
            [ground_id, ...tenantParam]
        );

        // Insert the new template slots
        for (let i = 0; i < (slots || []).length; i++) {
            const { start_time, end_time, duration_minutes, price } = slots[i];
            await db.promise().query(
                `INSERT INTO tbl_ground_slots (ground_id, tenant_id, start_time, end_time, duration_minutes, price, display_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [ground_id, tenant_id, start_time, end_time, duration_minutes, price, i + 1]
            );
        }

        return { skipped: [] };
    } catch (err) { throw err; }
};

// ── Get Slots For Date (with booking status) ──────────────────
const getSlotsForDate = async (ground_id, date, tenant_id = null) => {
    try {
        const toMins = t => { if (!t) return 0; if (t.slice(0,5) === '24:00') return 1440; const [h,m] = t.slice(0,5).split(':').map(Number); return h*60+m; };

        // Get template slots for this ground
        const [groundSlots] = await db.promise().query(
            `SELECT * FROM tbl_ground_slots WHERE ground_id = ? AND flag = 0 ORDER BY start_time ASC`,
            [ground_id]
        );

        // Get actual bookings for this SPECIFIC date only
        const [bookings] = await db.promise().query(
            `SELECT b.start_time, b.end_time, b.customer_name, b.booking_no
             FROM tbl_bookings b
             WHERE b.ground_id = ?
               AND b.slot_date = ?
               AND b.booking_status IN ('pending','approved','confirmed')
               AND b.flag = 0`,
            [ground_id, date]
        );

        // ── Load active blocks for this ground+date ──────────────────────────
        // Mirrors the same query used in generateSlotsForGround so blocking
        // behaviour is consistent between the slot grid and the quick-book drawer.
        const [activeBlocks] = await db.promise().query(
            `SELECT * FROM tbl_ground_blocks
             WHERE ground_id = ? AND start_date <= ? AND end_date >= ?`,
            [ground_id, date, date]
        );
        const hasFullDayBlock  = activeBlocks.some(b => b.block_type === 'full_day');
        const timeRangeBlocks  = activeBlocks.filter(b => b.block_type === 'time_range');

        // Returns true if a slot starting at slotStartMins falls inside any time-range block
        const isBlockedByTime = (slotStartMins) => {
            return timeRangeBlocks.some(b => {
                let bStart = toMins(b.start_time.slice(0, 5));
                let bEnd   = toMins(b.end_time.slice(0, 5));
                // Overnight block (e.g. 20:00 → 00:30)
                if (bEnd <= bStart) bEnd += 24 * 60;
                return (slotStartMins >= bStart && slotStartMins < bEnd) ||
                       (slotStartMins + 24 * 60 >= bStart && slotStartMins + 24 * 60 < bEnd);
            });
        };

        // Build final slot list:
        // 1. Start with template slots, mark as booked/blocked if applicable
        // 2. Add any booked slots that don't match any template slot
        //    (these are bookings made with old slot timings)

        const usedBookings = new Set();
        const result = [];

        for (const slot of groundSlots) {
            const sStart = toMins(slot.start_time);
            const sEnd   = toMins(slot.end_time);

            const conflict = bookings.find((b, idx) => {
                if (usedBookings.has(idx)) return false;
                const bStart = toMins(b.start_time);
                const bEnd   = toMins(b.end_time);
                return sStart < bEnd && sEnd > bStart;
            });

            if (conflict) {
                // Show the booking's ACTUAL time (not template time)
                const idx = bookings.indexOf(conflict);
                usedBookings.add(idx);
                result.push({
                    ...slot,
                    start_time    : conflict.start_time,
                    end_time      : conflict.end_time,
                    status        : 'booked',
                    booking_no    : conflict.booking_no,
                    customer_name : conflict.customer_name,
                });
            } else if (hasFullDayBlock || isBlockedByTime(sStart)) {
                // Slot falls inside an active ground block — show as blocked/under maintenance
                result.push({ ...slot, status: 'blocked' });
            } else {
                // Available — use template time
                result.push({ ...slot, status: 'available' });
            }
        }

        // Add any bookings that didn't match any template slot
        // (old bookings made before slot template was changed)
        bookings.forEach((b, idx) => {
            if (usedBookings.has(idx)) return;
            result.push({
                id            : null,
                ground_id,
                start_time    : b.start_time,
                end_time      : b.end_time,
                status        : 'booked',
                booking_no    : b.booking_no,
                customer_name : b.customer_name,
                price         : 0,
            });
        });

        // Sort by start time
        result.sort((a, b) => toMins(a.start_time) - toMins(b.start_time));
        return result;

    } catch (err) { throw err; }
};

module.exports = {
    getAllGrounds, getGroundById,
    createGround, updateGround,
    saveGroundImages, setPrimaryImage, deleteGroundImage,
    toggleStatus, deleteGround,
    createGroundBlock, getGroundBlocks, deleteGroundBlock, getActiveBlocksForDate,
    getGroundSlots, saveGroundSlots, getSlotsForDate,
};