const batchService = require('./batch.service');
const coachService = require('../coaches/coach.service');
const studentService = require('../students/student.service');

// ── GET /academy/batches ──────────────────────────────────────
const getBatchesPage = async (req, res, next) => {
    try {
        const batches = await batchService.getAllBatches(
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/batches/index', {
            title:      'Manage Batches',
            activePage: 'academy-batches',
            batches,
            success:    req.query.success || null,
            error:      req.query.error   || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /academy/batches/new ──────────────────────────────────
const getAddBatchPage = async (req, res, next) => {
    try {
        const coaches = await coachService.getAllCoaches(
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/batches/form', {
            title:      'Add Batch',
            activePage: 'academy-batches',
            batch:      null,
            coaches,
            error:      req.query.error || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /academy/batches/create ──────────────────────────────
const createBatch = async (req, res, next) => {
    try {
        const { batch_name } = req.body;

        if (!batch_name || !batch_name.trim()) {
            const coaches = await coachService.getAllCoaches(
                req.tenant ? req.tenant.id : null,
                req.user.role
            );
            return res.render('academy/batches/form', {
                title:      'Add Batch',
                activePage: 'academy-batches',
                batch:      req.body,
                coaches,
                error:      'Batch name is required',
                tenant:     req.tenant,
            });
        }

        const tenantId = req.tenant ? req.tenant.id : null;
        await batchService.createBatch(req.body, tenantId);

        return res.redirect('/academy/batches?success=Batch created successfully');
    } catch (err) {
        const coaches = await coachService.getAllCoaches(
            req.tenant ? req.tenant.id : null,
            req.user.role
        ).catch(() => []);

        return res.render('academy/batches/form', {
            title:      'Add Batch',
            activePage: 'academy-batches',
            batch:      req.body,
            coaches,
            error:      err.message,
            tenant:     req.tenant,
        });
    }
};

// ── GET /academy/batches/:id ──────────────────────────────────
const getBatchDetailPage = async (req, res, next) => {
    try {
        const batch = await batchService.getBatchById(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        const availableStudents = await batchService.getAvailableStudents(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/batches/detail', {
            title:           `${batch.batch_name} — Detail`,
            activePage:      'academy-batches',
            batch,
            availableStudents,
            success:         req.query.success || null,
            error:           req.query.error   || null,
            tenant:          req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /academy/batches/:id/edit ─────────────────────────────
const getEditBatchPage = async (req, res, next) => {
    try {
        const batch = await batchService.getBatchById(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        const coaches = await coachService.getAllCoaches(
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/batches/form', {
            title:      'Edit Batch',
            activePage: 'academy-batches',
            batch,
            coaches,
            error:      req.query.error   || null,
            success:    req.query.success || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /academy/batches/:id/update ─────────────────────────
const updateBatch = async (req, res, next) => {
    try {
        const { batch_name } = req.body;

        if (!batch_name || !batch_name.trim()) {
            const coaches = await coachService.getAllCoaches(
                req.tenant ? req.tenant.id : null,
                req.user.role
            ).catch(() => []);

            return res.render('academy/batches/form', {
                title:      'Edit Batch',
                activePage: 'academy-batches',
                batch:      { ...req.body, id: req.params.id },
                coaches,
                error:      'Batch name is required',
                tenant:     req.tenant,
            });
        }

        await batchService.updateBatch(
            req.params.id,
            req.body,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.redirect(`/academy/batches/${req.params.id}?success=Batch updated successfully`);
    } catch (err) {
        const coaches = await coachService.getAllCoaches(
            req.tenant ? req.tenant.id : null,
            req.user.role
        ).catch(() => []);

        return res.render('academy/batches/form', {
            title:      'Edit Batch',
            activePage: 'academy-batches',
            batch:      { ...req.body, id: req.params.id },
            coaches,
            error:      err.message,
            tenant:     req.tenant,
        });
    }
};

// ── POST /academy/batches/:id/toggle ─────────────────────────
const toggleStatus = async (req, res, next) => {
    try {
        await batchService.toggleStatus(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect(`/academy/batches?success=Batch status updated`);
    } catch (err) {
        return res.redirect(`/academy/batches?error=${encodeURIComponent(err.message)}`);
    }
};

// ── POST /academy/batches/:id/delete ─────────────────────────
const deleteBatch = async (req, res, next) => {
    try {
        await batchService.deleteBatch(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect(`/academy/batches?success=Batch deleted`);
    } catch (err) {
        return res.redirect(`/academy/batches?error=${encodeURIComponent(err.message)}`);
    }
};

// ── POST /academy/batches/:id/enrol ──────────────────────────
const enrolStudent = async (req, res, next) => {
    try {
        const { student_id } = req.body;

        if (!student_id) {
            return res.redirect(`/academy/batches/${req.params.id}?error=Please select a student`);
        }

        await batchService.enrolStudent(
            req.params.id,
            student_id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.redirect(`/academy/batches/${req.params.id}?success=Student enrolled successfully`);
    } catch (err) {
        return res.redirect(`/academy/batches/${req.params.id}?error=${encodeURIComponent(err.message)}`);
    }
};

// ── POST /academy/batches/:id/remove/:studentId ───────────────
const removeStudent = async (req, res, next) => {
    try {
        await batchService.removeStudent(
            req.params.id,
            req.params.studentId,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.redirect(`/academy/batches/${req.params.id}?success=Student removed from batch`);
    } catch (err) {
        return res.redirect(`/academy/batches/${req.params.id}?error=${encodeURIComponent(err.message)}`);
    }
};

module.exports = {
    getBatchesPage,
    getAddBatchPage,
    createBatch,
    getBatchDetailPage,
    getEditBatchPage,
    updateBatch,
    toggleStatus,
    deleteBatch,
    enrolStudent,
    removeStudent,
};