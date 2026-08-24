const db = require('../../../config/db.config');

// ── Get All Batches ───────────────────────────────────────────
const getAllBatches = async (tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            SELECT
                b.*,
                c.name        AS coach_name,
                c.phone       AS coach_phone,
                COUNT(bs.id)  AS student_count
            FROM tbl_academy_batches b
            LEFT JOIN tbl_academy_coaches c
                ON c.id = b.coach_id AND c.flag = 0
            LEFT JOIN tbl_academy_batch_students bs
                ON bs.batch_id = b.id AND bs.status = 'active'
            WHERE b.flag = 0
        `;
        const params = [];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND b.tenant_id = ?';
            params.push(tenant_id);
        }

        query += ' GROUP BY b.id ORDER BY b.created_at DESC';

        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get Single Batch with students ───────────────────────────
const getBatchById = async (id, tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            SELECT
                b.*,
                c.name  AS coach_name,
                c.phone AS coach_phone
            FROM tbl_academy_batches b
            LEFT JOIN tbl_academy_coaches c ON c.id = b.coach_id AND c.flag = 0
            WHERE b.id = ? AND b.flag = 0
        `;
        const params = [id];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND b.tenant_id = ?';
            params.push(tenant_id);
        }

        const [rows] = await db.promise().query(query, params);

        if (rows.length === 0) {
            const err = new Error('Batch not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }

        // Get enrolled students
        const [students] = await db.promise().query(
            `SELECT s.id, s.name, s.phone, s.parent_phone, s.photo, s.status,
                    bs.enrolled_at AS batch_enrolled_at, bs.status AS batch_status
             FROM tbl_academy_batch_students bs
             JOIN tbl_academy_students s ON s.id = bs.student_id AND s.flag = 0
             WHERE bs.batch_id = ?
             ORDER BY s.name ASC`,
            [id]
        );

        return { ...rows[0], students };
    } catch (err) {
        throw err;
    }
};

// ── Create Batch ──────────────────────────────────────────────
const createBatch = async (data, tenant_id) => {
    try {
        const {
            batch_name, sport, coach_id,
            start_time, end_time, days_of_week,
            max_students, description
        } = data;

        // days_of_week comes as array from checkboxes — join to string
        const days = Array.isArray(days_of_week)
            ? days_of_week.join(',')
            : days_of_week || null;

        const [result] = await db.promise().query(
            `INSERT INTO tbl_academy_batches
                (tenant_id, batch_name, sport, coach_id,
                 start_time, end_time, days_of_week, max_students, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenant_id,
                batch_name.trim(),
                sport       ? sport.trim()       : null,
                coach_id    ? parseInt(coach_id) : null,
                start_time  || null,
                end_time    || null,
                days,
                max_students ? parseInt(max_students) : 30,
                description ? description.trim() : null
            ]
        );

        return result.insertId;
    } catch (err) {
        throw err;
    }
};

// ── Update Batch ──────────────────────────────────────────────
const updateBatch = async (id, data, tenant_id, user_role) => {
    try {
        await getBatchById(id, tenant_id, user_role); // auth check

        const {
            batch_name, sport, coach_id,
            start_time, end_time, days_of_week,
            max_students, description
        } = data;

        const days = Array.isArray(days_of_week)
            ? days_of_week.join(',')
            : days_of_week || null;

        await db.promise().query(
            `UPDATE tbl_academy_batches
             SET batch_name = ?, sport = ?, coach_id = ?,
                 start_time = ?, end_time = ?, days_of_week = ?,
                 max_students = ?, description = ?
             WHERE id = ?`,
            [
                batch_name.trim(),
                sport       ? sport.trim()       : null,
                coach_id    ? parseInt(coach_id) : null,
                start_time  || null,
                end_time    || null,
                days,
                max_students ? parseInt(max_students) : 30,
                description ? description.trim() : null,
                id
            ]
        );

        return id;
    } catch (err) {
        throw err;
    }
};

// ── Toggle Status ─────────────────────────────────────────────
const toggleStatus = async (id, tenant_id, user_role) => {
    try {
        const batch = await getBatchById(id, tenant_id, user_role);
        const newStatus = batch.status === 1 ? 0 : 1;

        await db.promise().query(
            'UPDATE tbl_academy_batches SET status = ? WHERE id = ?',
            [newStatus, id]
        );

        return newStatus;
    } catch (err) {
        throw err;
    }
};

// ── Soft Delete Batch ─────────────────────────────────────────
// Cascades: deactivates all student enrollments for this batch
const deleteBatch = async (id, tenant_id, user_role) => {
    try {
        await getBatchById(id, tenant_id, user_role);

        // 1. Deactivate all enrollments in this batch
        await db.promise().query(
            `UPDATE tbl_academy_batch_students SET status = 'inactive' WHERE batch_id = ?`,
            [id]
        );

        // 2. Soft delete the batch
        await db.promise().query(
            'UPDATE tbl_academy_batches SET flag = 1 WHERE id = ?',
            [id]
        );
    } catch (err) {
        throw err;
    }
};

// ── Enrol Student into Batch ──────────────────────────────────
const enrolStudent = async (batch_id, student_id, tenant_id, user_role) => {
    try {
        await getBatchById(batch_id, tenant_id, user_role); // auth check

        // Check capacity
        const [[countRow]] = await db.promise().query(
            `SELECT b.max_students,
                    COUNT(bs.id) AS enrolled
             FROM tbl_academy_batches b
             LEFT JOIN tbl_academy_batch_students bs
                ON bs.batch_id = b.id AND bs.status = 'active'
             WHERE b.id = ?
             GROUP BY b.id`,
            [batch_id]
        );

        if (countRow && countRow.max_students > 0 && countRow.enrolled >= countRow.max_students) {
            const err = new Error(`Batch is full. Maximum ${countRow.max_students} students allowed.`);
            err.statusCode = 400;
            throw err;
        }

        // Insert or re-activate
        await db.promise().query(
            `INSERT INTO tbl_academy_batch_students (batch_id, student_id, status)
             VALUES (?, ?, 'active')
             ON DUPLICATE KEY UPDATE status = 'active', enrolled_at = NOW()`,
            [batch_id, student_id]
        );
    } catch (err) {
        throw err;
    }
};

// ── Remove Student from Batch ─────────────────────────────────
const removeStudent = async (batch_id, student_id, tenant_id, user_role) => {
    try {
        await getBatchById(batch_id, tenant_id, user_role);

        await db.promise().query(
            `UPDATE tbl_academy_batch_students
             SET status = 'inactive'
             WHERE batch_id = ? AND student_id = ?`,
            [batch_id, student_id]
        );
    } catch (err) {
        throw err;
    }
};

// ── Get students NOT yet in this batch (for enrol dropdown) ──
const getAvailableStudents = async (batch_id, tenant_id, user_role) => {
    try {
        let query = `
            SELECT id, name, phone, photo
            FROM tbl_academy_students
            WHERE flag = 0
              AND status = 1
              AND id NOT IN (
                  SELECT student_id FROM tbl_academy_batch_students
                  WHERE batch_id = ? AND status = 'active'
              )
        `;
        const params = [batch_id];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }

        query += ' ORDER BY name ASC';

        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    getAllBatches,
    getBatchById,
    createBatch,
    updateBatch,
    toggleStatus,
    deleteBatch,
    enrolStudent,
    removeStudent,
    getAvailableStudents,
};