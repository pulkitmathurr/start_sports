const db = require('../../../config/db.config');

// ── Get batches for tenant ────────────────────────────────────
const getBatchesForTenant = async (tenant_id, user_role) => {
    let sql    = 'SELECT id, batch_name, sport, start_time, end_time, days_of_week FROM tbl_academy_batches WHERE 1=1';
    const params = [];
    if (user_role === 'admin' && tenant_id) { sql += ' AND tenant_id = ?'; params.push(tenant_id); }
    sql += ' ORDER BY batch_name ASC';
    const [rows] = await db.promise().query(sql, params);
    return rows;
};

// ── Get students enrolled in a batch ─────────────────────────
// Uses explicit column aliases so mysql2 never confuses bs.id with s.id
const getBatchStudents = async (batch_id) => {
    const [rows] = await db.promise().query(
        `SELECT
            s.id          AS student_id,
            s.name        AS student_name,
            s.phone       AS student_phone,
            s.parent_phone,
            s.parent_name,
            s.photo       AS student_photo,
            s.status      AS student_status
         FROM tbl_academy_batch_students bs
         JOIN tbl_academy_students s ON s.id = bs.student_id
         WHERE bs.batch_id = ? AND bs.status = 'active'
         ORDER BY s.name ASC`,
        [batch_id]
    );
    return rows;
};

// ── Get existing attendance for a batch+date ─────────────────
const getAttendanceForDate = async (batch_id, date) => {
    const [rows] = await db.promise().query(
        `SELECT student_id, status, note FROM tbl_academy_attendance WHERE batch_id = ? AND date = ?`,
        [batch_id, date]
    );
    const map = {};
    rows.forEach(r => { map[r.student_id] = { status: r.status, note: r.note }; });
    return map;
};

// ── Save attendance ───────────────────────────────────────────
const saveAttendance = async (batch_id, date, records, marked_by) => {
    if (!records || records.length === 0) return [];
    const values = records.map(r => [batch_id, r.student_id, date, r.status || 'present', marked_by || null, r.note || null]);
    await db.promise().query(
        `INSERT INTO tbl_academy_attendance (batch_id, student_id, date, status, marked_by, note)
         VALUES ?
         ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by), note = VALUES(note), updated_at = NOW()`,
        [values]
    );
    return records;
};

// ── Get students for filter dropdown ─────────────────────────
const getStudentsForTenant = async (tenant_id, user_role) => {
    let sql    = 'SELECT id, name FROM tbl_academy_students WHERE 1=1';
    const params = [];
    if (user_role === 'admin' && tenant_id) { sql += ' AND tenant_id = ?'; params.push(tenant_id); }
    sql += ' ORDER BY name ASC';
    const [rows] = await db.promise().query(sql, params);
    return rows;
};

// ── Get attendance history ────────────────────────────────────
const getAttendanceHistory = async ({ tenant_id, user_role, batch_id = null, student_id = null, date_from = null, date_to = null }) => {
    let sql = `
        SELECT
            a.id, a.date, a.status, a.note,
            a.student_id,
            s.name  AS student_name,
            s.phone AS student_phone,
            s.photo AS student_photo,
            a.batch_id,
            b.batch_name,
            b.sport
        FROM tbl_academy_attendance a
        JOIN tbl_academy_students s ON s.id = a.student_id
        JOIN tbl_academy_batches  b ON b.id = a.batch_id
        WHERE 1=1
    `;
    const params = [];

    if (user_role === 'admin' && tenant_id) {
        sql += ' AND b.tenant_id = ?';
        params.push(tenant_id);
    }
    if (batch_id)   { sql += ' AND a.batch_id = ?';    params.push(batch_id); }
    if (student_id) { sql += ' AND a.student_id = ?';  params.push(student_id); }
    if (date_from)  { sql += ' AND a.date >= ?';        params.push(date_from); }
    if (date_to)    { sql += ' AND a.date <= ?';        params.push(date_to); }

    sql += ' ORDER BY a.date DESC, b.batch_name ASC, s.name ASC';
    const [rows] = await db.promise().query(sql, params);
    return rows;
};

// ── Get session summary ───────────────────────────────────────
const getSessionSummary = async (batch_id, date) => {
    const [rows] = await db.promise().query(
        `SELECT status, COUNT(*) AS count FROM tbl_academy_attendance WHERE batch_id = ? AND date = ? GROUP BY status`,
        [batch_id, date]
    );
    const summary = { present: 0, absent: 0, late: 0 };
    rows.forEach(r => { summary[r.status] = r.count; });
    return summary;
};

module.exports = {
    getBatchesForTenant,
    getStudentsForTenant,
    getBatchStudents,
    getAttendanceForDate,
    saveAttendance,
    getAttendanceHistory,
    getSessionSummary,
};