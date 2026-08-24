const fs             = require('fs');
const studentService = require('./student.service');

// ── GET /academy/students ─────────────────────────────────────
const getStudentsPage = async (req, res, next) => {
    try {
        const search = req.query.search || null;
        const status = req.query.status !== undefined ? req.query.status : null;

        const students = await studentService.getAllStudents({
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role,
            search,
            status
        });

        return res.render('academy/students/index', {
            title:      'Manage Students',
            activePage: 'academy-students',
            students,
            search,
            status,
            success:    req.query.success || null,
            error:      req.query.error   || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /academy/students/new ─────────────────────────────────
const getAddStudentPage = async (req, res, next) => {
    try {
        return res.render('academy/students/form', {
            title:      'Add Student',
            activePage: 'academy-students',
            student:    null,
            error:      req.query.error || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /academy/students/create ────────────────────────────
const createStudent = async (req, res, next) => {
    try {
        const { name, parent_phone } = req.body;

        const missing = [];
        if (!name         || !name.trim())         missing.push('Name');
        if (!parent_phone || !parent_phone.trim())  missing.push('Parent Phone');
        if (parent_phone  && !/^[0-9]{10}$/.test(parent_phone.trim())) missing.push('Parent Phone (must be 10 digits)');

        if (missing.length > 0) {
            if (req.file) _cleanFile(req.file.path);
            return res.render('academy/students/form', {
                title:      'Add Student',
                activePage: 'academy-students',
                student:    req.body,
                error:      `Please fill in required fields: ${missing.join(', ')}`,
                tenant:     req.tenant,
            });
        }

        const tenantId = req.tenant ? req.tenant.id : null;
        const photo    = req.file ? req.file.filename : null;

        const studentId = await studentService.createStudent(req.body, tenantId, photo);

        return res.redirect(`/academy/students?success=Student added successfully`);
    } catch (err) {
        if (req.file) _cleanFile(req.file.path);
        return res.render('academy/students/form', {
            title:      'Add Student',
            activePage: 'academy-students',
            student:    req.body,
            error:      err.message,
            tenant:     req.tenant,
        });
    }
};

// ── GET /academy/students/:id/edit ───────────────────────────
const getEditStudentPage = async (req, res, next) => {
    try {
        const student = await studentService.getStudentById(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/students/form', {
            title:      'Edit Student',
            activePage: 'academy-students',
            student,
            error:      req.query.error   || null,
            success:    req.query.success || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /academy/students/:id/update ────────────────────────
const updateStudent = async (req, res, next) => {
    try {
        const { name, parent_phone } = req.body;

        const missing = [];
        if (!name         || !name.trim())        missing.push('Name');
        if (!parent_phone || !parent_phone.trim()) missing.push('Parent Phone');
        if (parent_phone  && !/^[0-9]{10}$/.test(parent_phone.trim())) missing.push('Parent Phone (must be 10 digits)');

        if (missing.length > 0) {
            if (req.file) _cleanFile(req.file.path);
            return res.render('academy/students/form', {
                title:      'Edit Student',
                activePage: 'academy-students',
                student:    { ...req.body, id: req.params.id },
                error:      `Please fill in required fields: ${missing.join(', ')}`,
                tenant:     req.tenant,
            });
        }

        const newPhoto = req.file ? req.file.filename : null;

        await studentService.updateStudent(
            req.params.id,
            req.body,
            req.tenant ? req.tenant.id : null,
            req.user.role,
            newPhoto
        );

        return res.redirect(`/academy/students/${req.params.id}/edit?success=Student updated successfully`);
    } catch (err) {
        if (req.file) _cleanFile(req.file.path);
        return res.render('academy/students/form', {
            title:      'Edit Student',
            activePage: 'academy-students',
            student:    { ...req.body, id: req.params.id },
            error:      err.message,
            tenant:     req.tenant,
        });
    }
};

// ── GET /academy/students/:id/profile ────────────────────────
const getStudentProfile = async (req, res, next) => {
    try {
        const tenantId = req.tenant ? req.tenant.id : null;
        const userRole = req.user.role;

        const student = await studentService.getStudentById(req.params.id, tenantId, userRole);

        const [attendance, fees] = await Promise.all([
            studentService.getStudentAttendance(req.params.id, tenantId, userRole, 90).catch(() => []),
            studentService.getStudentFees(req.params.id, tenantId, userRole).catch(() => []),
        ]);

        return res.render('academy/students/profile', {
            title:      `${student.name} — Profile`,
            activePage: 'academy-students',
            student,
            attendance,
            fees,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /academy/students/:id/toggle ────────────────────────
const toggleStatus = async (req, res, next) => {
    try {
        await studentService.toggleStatus(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect(`/academy/students?success=Student status updated`);
    } catch (err) {
        return res.redirect(`/academy/students?error=${encodeURIComponent(err.message)}`);
    }
};

// ── POST /academy/students/:id/delete ────────────────────────
const deleteStudent = async (req, res, next) => {
    try {
        await studentService.deleteStudent(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect(`/academy/students?success=Student deleted`);
    } catch (err) {
        return res.redirect(`/academy/students?error=${encodeURIComponent(err.message)}`);
    }
};

function _cleanFile(filePath) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
}

module.exports = {
    getStudentsPage,
    getAddStudentPage,
    createStudent,
    getEditStudentPage,
    updateStudent,
    getStudentProfile,
    toggleStatus,
    deleteStudent,
};