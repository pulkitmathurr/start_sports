const db = require('../../../config/db.config');

// ════════════════════════════════════════════════
//  FEE PLANS
// ════════════════════════════════════════════════

const getAllPlans = async (tenant_id, user_role) => {
    try {
        let query = `SELECT * FROM tbl_academy_fee_plans WHERE flag = 0`;
        const params = [];
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }
        query += ' ORDER BY created_at DESC';
        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) { throw err; }
};

const getPlanById = async (id, tenant_id, user_role) => {
    try {
        let query = `SELECT * FROM tbl_academy_fee_plans WHERE id = ? AND flag = 0`;
        const params = [id];
        if (user_role === 'admin' && tenant_id) {
            query += ' AND tenant_id = ?';
            params.push(tenant_id);
        }
        const [rows] = await db.promise().query(query, params);
        if (rows.length === 0) {
            const err = new Error('Fee plan not found');
            err.statusCode = 404;
            throw err;
        }
        return rows[0];
    } catch (err) { throw err; }
};

const createPlan = async (data, tenant_id) => {
    try {
        const { plan_name, amount, frequency, sport, description } = data;
        const [result] = await db.promise().query(
            `INSERT INTO tbl_academy_fee_plans
                (tenant_id, plan_name, amount, frequency, sport, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                tenant_id,
                plan_name.trim(),
                parseFloat(amount) || 0,
                frequency || 'monthly',
                sport       ? sport.trim()       : null,
                description ? description.trim() : null
            ]
        );
        return result.insertId;
    } catch (err) { throw err; }
};

const updatePlan = async (id, data, tenant_id, user_role) => {
    try {
        await getPlanById(id, tenant_id, user_role);
        const { plan_name, amount, frequency, sport, description } = data;
        await db.promise().query(
            `UPDATE tbl_academy_fee_plans
             SET plan_name = ?, amount = ?, frequency = ?, sport = ?, description = ?
             WHERE id = ?`,
            [
                plan_name.trim(),
                parseFloat(amount) || 0,
                frequency || 'monthly',
                sport       ? sport.trim()       : null,
                description ? description.trim() : null,
                id
            ]
        );
    } catch (err) { throw err; }
};

const deletePlan = async (id, tenant_id, user_role) => {
    try {
        await getPlanById(id, tenant_id, user_role);
        await db.promise().query(
            'UPDATE tbl_academy_fee_plans SET flag = 1 WHERE id = ?', [id]
        );
    } catch (err) { throw err; }
};

// ════════════════════════════════════════════════
//  STUDENT FEE ASSIGNMENTS
// ════════════════════════════════════════════════

const getAllStudentFees = async ({ tenant_id, user_role, status = null, batch_id = null, student_id = null }) => {
    try {
        let query = `
            SELECT
                sf.*,
                s.name          AS student_name,
                s.phone         AS student_phone,
                s.parent_phone,
                s.parent_name,
                s.photo         AS student_photo,
                b.batch_name,
                fp.plan_name,
                fp.frequency
            FROM tbl_academy_student_fees sf
            JOIN tbl_academy_students s  ON s.id  = sf.student_id AND s.flag = 0
            LEFT JOIN tbl_academy_batches b   ON b.id  = sf.batch_id  AND b.flag = 0
            LEFT JOIN tbl_academy_fee_plans fp ON fp.id = sf.fee_plan_id AND fp.flag = 0
            WHERE 1=1
        `;
        const params = [];

        if (user_role === 'admin' && tenant_id) {
            query += ' AND sf.tenant_id = ?';
            params.push(tenant_id);
        }
        if (status) {
            query += ' AND sf.status = ?';
            params.push(status);
        }
        if (batch_id) {
            query += ' AND sf.batch_id = ?';
            params.push(batch_id);
        }
        if (student_id) {
            query += ' AND sf.student_id = ?';
            params.push(student_id);
        }

        query += ' ORDER BY sf.due_date ASC';
        const [rows] = await db.promise().query(query, params);
        return rows;
    } catch (err) { throw err; }
};

const getStudentFeeById = async (id) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT sf.*, s.name AS student_name, s.parent_phone, s.parent_name,
                    b.batch_name, fp.plan_name, fp.frequency
             FROM tbl_academy_student_fees sf
             JOIN tbl_academy_students s ON s.id = sf.student_id
             LEFT JOIN tbl_academy_batches b    ON b.id  = sf.batch_id
             LEFT JOIN tbl_academy_fee_plans fp ON fp.id = sf.fee_plan_id
             WHERE sf.id = ?`,
            [id]
        );
        if (rows.length === 0) {
            const err = new Error('Fee record not found');
            err.statusCode = 404;
            throw err;
        }
        return rows[0];
    } catch (err) { throw err; }
};

const assignFee = async (data, tenant_id) => {
    try {
        const { student_id, batch_id, fee_plan_id, due_date, amount, note } = data;
        const [result] = await db.promise().query(
            `INSERT INTO tbl_academy_student_fees
                (tenant_id, student_id, batch_id, fee_plan_id, due_date, amount, balance, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenant_id,
                parseInt(student_id),
                batch_id    ? parseInt(batch_id)   : null,
                fee_plan_id ? parseInt(fee_plan_id) : null,
                due_date,
                parseFloat(amount) || 0,
                parseFloat(amount) || 0,
                note ? note.trim() : null
            ]
        );
        return result.insertId;
    } catch (err) { throw err; }
};

// ── Cancel / delete an assigned fee ──────────────────────────
const cancelFee = async (id, tenant_id, user_role) => {
    try {
        const fee = await getStudentFeeById(id);

        if (fee.status === 'paid') {
            const err = new Error('Cannot cancel a fully paid fee');
            err.statusCode = 400;
            throw err;
        }

        await db.promise().query(
            `UPDATE tbl_academy_student_fees SET status = 'cancelled' WHERE id = ?`,
            [id]
        );
    } catch (err) { throw err; }
};

// ── Mark overdue (run this check on load) ────────────────────
const markOverdue = async (tenant_id) => {
    try {
        await db.promise().query(
            `UPDATE tbl_academy_student_fees
             SET status = 'overdue'
             WHERE status IN ('due','partial')
               AND due_date < CURDATE()
               AND tenant_id = ?`,
            [tenant_id]
        );
    } catch (err) {
        // Log but don't crash
        console.error('markOverdue failed:', err.message);
    }
};

// ════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════

const getPaymentsForFee = async (student_fee_id) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT * FROM tbl_academy_fee_payments
             WHERE student_fee_id = ?
             ORDER BY payment_date DESC`,
            [student_fee_id]
        );
        return rows;
    } catch (err) { throw err; }
};

const recordPayment = async (student_fee_id, data, created_by) => {
    try {
        const { amount, payment_mode, payment_date, note } = data;
        const payAmount = parseFloat(amount) || 0;

        if (payAmount <= 0) {
            const err = new Error('Payment amount must be greater than 0');
            err.statusCode = 400;
            throw err;
        }

        const fee = await getStudentFeeById(student_fee_id);

        if (fee.status === 'paid') {
            const err = new Error('This fee is already fully paid');
            err.statusCode = 400;
            throw err;
        }

        if (fee.status === 'cancelled') {
            const err = new Error('Cannot record payment for a cancelled fee');
            err.statusCode = 400;
            throw err;
        }

        // Insert payment
        await db.promise().query(
            `INSERT INTO tbl_academy_fee_payments
                (student_fee_id, amount, payment_mode, payment_date, note, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                student_fee_id,
                payAmount,
                payment_mode || 'cash',
                payment_date || new Date().toISOString().slice(0, 10),
                note ? note.trim() : null,
                created_by || null
            ]
        );

        // Update paid_amount, balance, status
        const newPaid    = parseFloat(fee.paid_amount) + payAmount;
        const newBalance = Math.max(0, parseFloat(fee.amount) - newPaid);
        const newStatus  = newBalance <= 0 ? 'paid' : 'partial';

        await db.promise().query(
            `UPDATE tbl_academy_student_fees
             SET paid_amount = ?, balance = ?, status = ?, updated_at = NOW()
             WHERE id = ?`,
            [newPaid, newBalance, newStatus, student_fee_id]
        );

        return { fee, payAmount, newPaid, newBalance, newStatus };
    } catch (err) { throw err; }
};

// ── Dashboard summary ─────────────────────────────────────────
const getFeeSummary = async (tenant_id) => {
    try {
        const [[row]] = await db.promise().query(
            `SELECT
                COUNT(*)                                           AS total,
                SUM(amount)                                        AS total_amount,
                SUM(paid_amount)                                   AS total_paid,
                SUM(balance)                                       AS total_balance,
                SUM(status = 'paid')                               AS total_paid_count,
                SUM(status IN ('due','partial','overdue'))         AS total_pending_count,
                SUM(status = 'overdue')                            AS total_overdue_count
             FROM tbl_academy_student_fees
             WHERE tenant_id = ? AND status != 'cancelled'`,
            [tenant_id]
        );
        return row;
    } catch (err) { throw err; }
};

module.exports = {
    getAllPlans,
    getPlanById,
    createPlan,
    updatePlan,
    deletePlan,
    getAllStudentFees,
    getStudentFeeById,
    assignFee,
    cancelFee,
    markOverdue,
    getPaymentsForFee,
    recordPayment,
    getFeeSummary,
};