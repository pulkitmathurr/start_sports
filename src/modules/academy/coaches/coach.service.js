const db = require('../../../config/db.config');

// ── Get All Coaches ───────────────────────────────────────────
const getAllCoaches = async (tenant_id = null, user_role = 'admin') => {
    try {
        let query = `
            SELECT *
            FROM tbl_academy_coaches
            WHERE flag = 0
        `;
        const params = [];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }

        query += ' ORDER BY created_at DESC';

        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) {
        throw err;
    }
};

// ── Get Single Coach ──────────────────────────────────────────
const getCoachById = async (id, tenant_id = null, user_role = 'admin') => {
    try {
        let query = 'SELECT * FROM tbl_academy_coaches WHERE id = ? AND flag = 0';
        const params = [id];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }

        const [rows] = await db.promise().query(query, params);

        if (rows.length === 0) {
            const err = new Error('Coach not found or unauthorized');
            err.statusCode = 404;
            throw err;
        }

        return rows[0];
    } catch (err) {
        throw err;
    }
};

// ── Get Coach with their assigned batches ─────────────────────
const getCoachWithBatches = async (id, tenant_id = null, user_role = 'admin') => {
    try {
        const coach = await getCoachById(id, tenant_id, user_role);

        const [batches] = await db.promise().query(
            `SELECT b.id, b.batch_name, b.sport, b.start_time, b.end_time,
                    b.days_of_week, b.status,
                    COUNT(bs.id) AS student_count
             FROM tbl_academy_batches b
             LEFT JOIN tbl_academy_batch_students bs
                ON bs.batch_id = b.id AND bs.status = 'active'
             WHERE b.coach_id = ? AND b.flag = 0
             GROUP BY b.id
             ORDER BY b.batch_name ASC`,
            [id]
        );

        return { ...coach, batches };
    } catch (err) {
        throw err;
    }
};

// ── Create Coach ──────────────────────────────────────────────
const createCoach = async (data, tenant_id, photo = null) => {
    try {
        const {
            name, phone, email,
            specialization, experience_years, bio
        } = data;

        const [result] = await db.promise().query(
            `INSERT INTO tbl_academy_coaches
                (tenant_id, name, phone, email, specialization, experience_years, bio, photo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenant_id,
                name.trim(),
                phone.trim(),
                email   ? email.trim()          : null,
                specialization ? specialization.trim() : null,
                experience_years ? parseInt(experience_years) : 0,
                bio     ? bio.trim()            : null,
                photo
            ]
        );

        return result.insertId;
    } catch (err) {
        throw err;
    }
};

// ── Update Coach ──────────────────────────────────────────────
const updateCoach = async (id, data, tenant_id, user_role, newPhoto = null) => {
    try {
        const existing = await getCoachById(id, tenant_id, user_role);

        const {
            name, phone, email,
            specialization, experience_years, bio
        } = data;

        // Use new photo if uploaded, else keep existing
        const photo = newPhoto || existing.photo;

        await db.promise().query(
            `UPDATE tbl_academy_coaches
             SET name = ?, phone = ?, email = ?, specialization = ?,
                 experience_years = ?, bio = ?, photo = ?
             WHERE id = ?`,
            [
                name.trim(),
                phone.trim(),
                email          ? email.trim()          : null,
                specialization ? specialization.trim() : null,
                experience_years ? parseInt(experience_years) : 0,
                bio            ? bio.trim()            : null,
                photo,
                id
            ]
        );

        return id;
    } catch (err) {
        throw err;
    }
};

// ── Toggle Status (active / inactive) ────────────────────────
const toggleStatus = async (id, tenant_id, user_role) => {
    try {
        const coach = await getCoachById(id, tenant_id, user_role);

        const newStatus = coach.status === 1 ? 0 : 1;

        await db.promise().query(
            'UPDATE tbl_academy_coaches SET status = ? WHERE id = ?',
            [newStatus, id]
        );

        return newStatus;
    } catch (err) {
        throw err;
    }
};

// ── Soft Delete Coach ─────────────────────────────────────────
const deleteCoach = async (id, tenant_id, user_role) => {
    try {
        await getCoachById(id, tenant_id, user_role); // throws 404 if not found/unauthorized

        // Unassign coach from all batches before deleting
        await db.promise().query(
            'UPDATE tbl_academy_batches SET coach_id = NULL WHERE coach_id = ? AND flag = 0',
            [id]
        );

        await db.promise().query(
            'UPDATE tbl_academy_coaches SET flag = 1 WHERE id = ?',
            [id]
        );
    } catch (err) {
        throw err;
    }
};

module.exports = {
    getAllCoaches,
    getCoachById,
    getCoachWithBatches,
    createCoach,
    updateCoach,
    toggleStatus,
    deleteCoach,
};