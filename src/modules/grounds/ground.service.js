const db = require('../../config/db.config');

// ── Get All Grounds ───────────────────────────
const getAllGrounds = async () => {
    try {
        const [rows] = await db.promise().query(
            `SELECT g.*, 
                (SELECT filename FROM tbl_ground_images 
                 WHERE ground_id = g.id AND is_primary = 1 LIMIT 1) AS primary_image
             FROM tbl_grounds g WHERE g.flag = 0 ORDER BY g.created_at DESC`
        );
        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get Single Ground with Images ────────────
const getGroundById = async (id) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT * FROM tbl_grounds WHERE id = ? AND flag = 0', [id]
        );
        if (rows.length === 0) {
            const err = new Error('Ground not found');
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
const createGround = async (data) => {
    try {
        const {
            name, address, phone, sport_type,
            open_time, close_time, slot_duration,
            peak_start_time, peak_end_time,
            peak_price, off_peak_price,
            advance_booking_days, advance_payment_hours
        } = data;

        const [result] = await db.promise().query(
            `INSERT INTO tbl_grounds
                (name, address, phone, sport_type,
                 open_time, close_time, slot_duration,
                 peak_start_time, peak_end_time,
                 peak_price, off_peak_price,
                 advance_booking_days, advance_payment_hours)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, address, phone, sport_type || 'cricket',
                open_time, close_time, parseInt(slot_duration),
                peak_start_time, peak_end_time,
                parseFloat(peak_price), parseFloat(off_peak_price),
                parseInt(advance_booking_days), parseInt(advance_payment_hours)
            ]
        );
        return result.insertId;
    } catch (err) {
        throw err;
    }
};

// ── Save Ground Images ────────────────────────
const saveGroundImages = async (groundId, filenames) => {
    try {
        if (!filenames || filenames.length === 0) return;

        const gId = parseInt(groundId);

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
const setPrimaryImage = async (groundId, imageId) => {
    try {
        const gId = parseInt(groundId);
        const iId = parseInt(imageId);
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
const deleteGroundImage = async (groundId, imageId) => {
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

        // Agar primary thi toh next wali ko primary banao
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
const updateGround = async (id, data) => {
    try {
        const {
            name, address, phone, sport_type,
            open_time, close_time, slot_duration,
            peak_start_time, peak_end_time,
            peak_price, off_peak_price,
            advance_booking_days, advance_payment_hours
        } = data;

        await db.promise().query(
            `UPDATE tbl_grounds SET
                name                  = ?,
                address               = ?,
                phone                 = ?,
                sport_type            = ?,
                open_time             = ?,
                close_time            = ?,
                slot_duration         = ?,
                peak_start_time       = ?,
                peak_end_time         = ?,
                peak_price            = ?,
                off_peak_price        = ?,
                advance_booking_days  = ?,
                advance_payment_hours = ?
             WHERE id = ?`,
            [
                name, address, phone, sport_type || 'cricket',
                open_time, close_time, parseInt(slot_duration),
                peak_start_time, peak_end_time,
                parseFloat(peak_price), parseFloat(off_peak_price),
                parseInt(advance_booking_days), parseInt(advance_payment_hours),
                id
            ]
        );

        await db.promise().query(
            'DELETE FROM tbl_slots WHERE ground_id = ? AND date >= CURDATE()', [id]
        );

        return true;
    } catch (err) {
        throw err;
    }
};

// ── Toggle Ground Status ──────────────────────
const toggleStatus = async (id) => {
    try {
        await db.promise().query(
            `UPDATE tbl_grounds SET status = IF(status='active','inactive','active') WHERE id = ?`, [id]
        );
        return true;
    } catch (err) {
        throw err;
    }
};

// ── Delete Ground ─────────────────────────────
const deleteGround = async (id) => {
    try {
        const [bookings] = await db.promise().query(
            `SELECT id FROM tbl_bookings WHERE ground_id = ? AND booking_status NOT IN ('cancelled','completed') LIMIT 1`, [id]
        );
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

        await db.promise().query('UPDATE tbl_grounds SET flag = 1 WHERE id = ?', [id]);
        return true;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    getAllGrounds, getGroundById,
    createGround, updateGround,
    saveGroundImages, setPrimaryImage, deleteGroundImage,
    toggleStatus, deleteGround
};