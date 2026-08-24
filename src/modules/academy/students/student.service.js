const db = require('../../../config/db.config');

// ── Get All Students ──────────────────────────────────────────
const getAllStudents = async ({ tenant_id = null, user_role = 'admin', search = null, status = null } = {}) => {
    try {
        let query = `
            SELECT
                s.*,
                b.batch_name,
                b.id   AS batch_id,
                b.sport AS batch_sport
            FROM tbl_academy_students s
            LEFT JOIN tbl_academy_batch_students bs
                ON bs.student_id = s.id AND bs.status = 'active'
            LEFT JOIN tbl_academy_batches b
                ON b.id = bs.batch_id AND b.flag = 0
            WHERE s.flag = 0
        `;
        const params = [];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND s.tenant_id = ?';
            params.push(tenant_id);
        }

        if (search) {
            query += ' AND (s.name LIKE ? OR s.phone LIKE ? OR s.parent_phone LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like, like);
        }

        if (status !== null && status !== '') {
            query += ' AND s.status = ?';
            params.push(status);
        }

        query += ' ORDER BY s.created_at DESC';

        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get Single Student ────────────────────────────────────────
const getStudentById = async (id, tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            SELECT
                s.*,
                b.batch_name,
                b.id   AS batch_id,
                b.sport AS batch_sport
            FROM tbl_academy_students s
            LEFT JOIN tbl_academy_batch_students bs
                ON bs.student_id = s.id AND bs.status = 'active'
            LEFT JOIN tbl_academy_batches b
                ON b.id = bs.batch_id AND b.flag = 0
            WHERE s.id = ? AND s.flag = 0
        `;
        const params = [id];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND s.tenant_id = ?';
            params.push(tenant_id);
        }

        const [rows] = await db.promise().query(query, params);

        if (rows.length === 0) {
            const err = new Error('Student not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }

        return rows[0];
    } catch (err) {
        throw err;
    }
};

// ── Create Student ────────────────────────────────────────────
const createStudent = async (data, tenant_id, photo = null) => {
    try {
        const {
            name, dob, gender, phone, email,
            parent_name, parent_phone, address, enrolled_at
        } = data;

        const [result] = await db.promise().query(
            `INSERT INTO tbl_academy_students
                (tenant_id, name, dob, gender, phone, email,
                 parent_name, parent_phone, address, photo, enrolled_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenant_id,
                name.trim(),
                dob          || null,
                gender       || null,
                phone        ? phone.trim()        : null,
                email        ? email.trim()        : null,
                parent_name  ? parent_name.trim()  : null,
                parent_phone.trim(),
                address      ? address.trim()      : null,
                photo,
                enrolled_at  || new Date().toISOString().slice(0, 10)
            ]
        );

        return result.insertId;
    } catch (err) {
        throw err;
    }
};

// ── Update Student ────────────────────────────────────────────
const updateStudent = async (id, data, tenant_id, user_role, newPhoto = null) => {
    try {
        const existing = await getStudentById(id, tenant_id, user_role);

        const {
            name, dob, gender, phone, email,
            parent_name, parent_phone, address, enrolled_at
        } = data;

        const photo = newPhoto || existing.photo;

        await db.promise().query(
            `UPDATE tbl_academy_students
             SET name = ?, dob = ?, gender = ?, phone = ?, email = ?,
                 parent_name = ?, parent_phone = ?, address = ?,
                 photo = ?, enrolled_at = ?
             WHERE id = ?`,
            [
                name.trim(),
                dob          || null,
                gender       || null,
                phone        ? phone.trim()        : null,
                email        ? email.trim()        : null,
                parent_name  ? parent_name.trim()  : null,
                parent_phone.trim(),
                address      ? address.trim()      : null,
                photo,
                enrolled_at  || existing.enrolled_at,
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
        const student = await getStudentById(id, tenant_id, user_role);
        const newStatus = student.status === 1 ? 0 : 1;

        await db.promise().query(
            'UPDATE tbl_academy_students SET status = ? WHERE id = ?',
            [newStatus, id]
        );

        return newStatus;
    } catch (err) {
        throw err;
    }
};

// ── Soft Delete ───────────────────────────────────────────────
// Cascades: deactivates batch enrollments, cancels unpaid fees
const deleteStudent = async (id, tenant_id, user_role) => {
    try {
        await getStudentById(id, tenant_id, user_role);

        // 1. Deactivate all batch enrollments
        await db.promise().query(
            `UPDATE tbl_academy_batch_students
             SET status = 'inactive'
             WHERE student_id = ?`,
            [id]
        );

        // 2. Cancel all unpaid/pending fees
        await db.promise().query(
            `UPDATE tbl_academy_student_fees
             SET status = 'cancelled'
             WHERE student_id = ? AND status IN ('due', 'partial', 'overdue')`,
            [id]
        );

        // 3. Soft delete the student
        await db.promise().query(
            'UPDATE tbl_academy_students SET flag = 1 WHERE id = ?',
            [id]
        );
    } catch (err) {
        throw err;
    }
};

// ── Get Student Attendance History ────────────────────────────
const getStudentAttendance = async (student_id, tenant_id, user_role, limit = 90) => {
    try {
        await getStudentById(student_id, tenant_id, user_role);

        const [rows] = await db.promise().query(
            `SELECT a.*, b.batch_name
             FROM tbl_academy_attendance a
             LEFT JOIN tbl_academy_batches b ON b.id = a.batch_id
             WHERE a.student_id = ?
             ORDER BY a.date DESC
             LIMIT ?`,
            [student_id, limit]
        );

        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get Student Fee Records ───────────────────────────────────
const getStudentFees = async (student_id, tenant_id, user_role) => {
    try {
        await getStudentById(student_id, tenant_id, user_role);

        const [rows] = await db.promise().query(
            `SELECT sf.*,
                    b.batch_name,
                    fp.plan_name,
                    fp.frequency
             FROM tbl_academy_student_fees sf
             LEFT JOIN tbl_academy_batches b    ON b.id  = sf.batch_id  AND b.flag = 0
             LEFT JOIN tbl_academy_fee_plans fp ON fp.id = sf.fee_plan_id AND fp.flag = 0
             WHERE sf.student_id = ?
             ORDER BY sf.due_date DESC`,
            [student_id]
        );

        return rows;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    getAllStudents,
    getStudentById,
    createStudent,
    updateStudent,
    toggleStatus,
    deleteStudent,
    getStudentAttendance,
    getStudentFees,
};