const attendanceService = require('./attendance.service');
const { sendAttendanceAlert } = require('../../../services/whatsapp.service');

// ── GET /academy/attendance — history page ────────────────────
const getAttendancePage = async (req, res, next) => {
    try {
        const batch_id   = req.query.batch_id   || null;
        const student_id = req.query.student_id || null;
        const date_from  = req.query.date_from  || null;
        const date_to    = req.query.date_to    || null;
        const tenant_id  = req.tenant ? req.tenant.id : null;

        const [batches, students, records] = await Promise.all([
            attendanceService.getBatchesForTenant(tenant_id, req.user.role),
            attendanceService.getStudentsForTenant(tenant_id, req.user.role),
            attendanceService.getAttendanceHistory({ tenant_id, user_role: req.user.role, batch_id, student_id, date_from, date_to })
        ]);

        return res.render('academy/attendance/index', {
            title:      'Attendance History',
            activePage: 'academy-attendance',
            batches, students, records,
            filters:   { batch_id, student_id, date_from, date_to },
            success:   req.query.success || null,
            error:     req.query.error   || null,
            tenant:    req.tenant,
        });
    } catch (err) { next(err); }
};

// ── GET /academy/attendance/mark ─────────────────────────────
const getMarkPage = async (req, res, next) => {
    try {
        const tenant_id = req.tenant ? req.tenant.id : null;
        const batches   = await attendanceService.getBatchesForTenant(tenant_id, req.user.role);
        const batch_id  = req.query.batch_id || null;
        const date      = req.query.date     || new Date().toISOString().slice(0, 10);

        let students = [], existingMap = {}, selectedBatch = null;

        if (batch_id) {
            [students, existingMap] = await Promise.all([
                attendanceService.getBatchStudents(batch_id),
                attendanceService.getAttendanceForDate(batch_id, date)
            ]);
            selectedBatch = batches.find(b => b.id == batch_id) || null;
        }

        return res.render('academy/attendance/mark', {
            title:        'Mark Attendance',
            activePage:   'academy-attendance',
            batches, students, existingMap, selectedBatch,
            batch_id, date,
            csrfToken:    res.locals.csrfToken,
            success:      req.query.success || null,
            error:        req.query.error   || null,
            tenant:       req.tenant,
        });
    } catch (err) { next(err); }
};

// ── POST /academy/attendance/save ────────────────────────────
const saveAttendance = async (req, res, next) => {
    try {
        const { batch_id, date, notify } = req.body;

        if (!batch_id || !date) {
            return res.redirect('/academy/attendance/mark?error=Batch and date are required');
        }

        // ── student_ids[] and statuses[] are parallel arrays from the form
        // This avoids the Object.keys(attendance) numeric-key issue entirely
        const studentIds = [].concat(req.body.student_ids || []);
        const statuses   = [].concat(req.body.statuses   || []);

        if (studentIds.length === 0) {
            return res.redirect(`/academy/attendance/mark?batch_id=${batch_id}&date=${date}&error=No students found`);
        }

        const records = studentIds.map((sid, i) => ({
            student_id: parseInt(sid),
            status:     statuses[i] || 'present',
            note:       null
        }));

        const existingMap = await attendanceService.getAttendanceForDate(batch_id, date);
        const isFirstSave = Object.keys(existingMap).length === 0;

        await attendanceService.saveAttendance(batch_id, date, records, req.user ? req.user.user_id : null);

        // WhatsApp notifications
        const shouldNotify = isFirstSave || notify === '1';
        if (shouldNotify) {
            const batchStudents = await attendanceService.getBatchStudents(batch_id);
            const batches       = await attendanceService.getBatchesForTenant(req.tenant ? req.tenant.id : null, req.user.role);
            const batch         = batches.find(b => b.id == batch_id);
            const batchName     = batch ? batch.batch_name : 'Academy Batch';

            for (const record of records) {
                const student = batchStudents.find(s => s.student_id === record.student_id);
                if (!student || !student.parent_phone) continue;
                try {
                    await sendAttendanceAlert({
                        parent_name:  student.parent_name  || 'Parent',
                        parent_phone: student.parent_phone,
                        student_name: student.student_name,
                        batch_name:   batchName,
                        date,
                        status:       record.status,
                    });
                } catch (waErr) {
                    console.error(`WhatsApp failed for ${student.student_name}:`, waErr.message);
                }
            }
        }

        const notifyMsg = shouldNotify ? ' and parents notified' : '';
        return res.redirect(`/academy/attendance/mark?batch_id=${batch_id}&date=${date}&success=Attendance saved${encodeURIComponent(notifyMsg)}`);
    } catch (err) { next(err); }
};

module.exports = { getAttendancePage, getMarkPage, saveAttendance };