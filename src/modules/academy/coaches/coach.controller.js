const fs           = require('fs');
const coachService = require('./coach.service');

// ── GET /academy/coaches ──────────────────────────────────────
const getCoachesPage = async (req, res, next) => {
    try {
        const coaches = await coachService.getAllCoaches(
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/coaches/index', {
            title:      'Manage Coaches',
            activePage: 'academy-coaches',
            coaches,
            success:    req.query.success || null,
            error:      req.query.error   || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /academy/coaches/new ──────────────────────────────────
const getAddCoachPage = async (req, res, next) => {
    try {
        return res.render('academy/coaches/form', {
            title:      'Add Coach',
            activePage: 'academy-coaches',
            coach:      null,
            error:      req.query.error || null,
            success:    null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /academy/coaches/:id ──────────────────────────────────
const getCoachDetailPage = async (req, res, next) => {
    try {
        const coach = await coachService.getCoachWithBatches(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/coaches/detail', {
            title:      `${coach.name} — Profile`,
            activePage: 'academy-coaches',
            coach,
            success:    req.query.success || null,
            error:      req.query.error   || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /academy/coaches/create ──────────────────────────────
const createCoach = async (req, res, next) => {
    try {
        const { name, phone } = req.body;

        const missing = [];
        if (!name  || !name.trim())  missing.push('Name');
        if (!phone || !phone.trim()) missing.push('Phone');
        if (phone  && !/^[0-9]{10}$/.test(phone.trim())) missing.push('Phone (must be 10 digits)');

        if (missing.length > 0) {
            if (req.file) _cleanFile(req.file.path);
            return res.render('academy/coaches/form', {
                title:      'Add Coach',
                activePage: 'academy-coaches',
                coach:      req.body,
                error:      `Please fill in required fields: ${missing.join(', ')}`,
                success:    null,
                tenant:     req.tenant,
            });
        }

        const tenantId = req.tenant ? req.tenant.id : null;
        const photo    = req.file ? req.file.filename : null;

        await coachService.createCoach(req.body, tenantId, photo);

        return res.redirect('/academy/coaches?success=Coach added successfully');
    } catch (err) {
        if (req.file) _cleanFile(req.file.path);
        return res.render('academy/coaches/form', {
            title:      'Add Coach',
            activePage: 'academy-coaches',
            coach:      req.body,
            error:      err.message || 'Something went wrong',
            success:    null,
            tenant:     req.tenant,
        });
    }
};

// ── GET /academy/coaches/:id/edit ─────────────────────────────
const getEditCoachPage = async (req, res, next) => {
    try {
        const coach = await coachService.getCoachById(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        return res.render('academy/coaches/form', {
            title:      'Edit Coach',
            activePage: 'academy-coaches',
            coach,
            error:      req.query.error   || null,
            success:    req.query.success || null,
            tenant:     req.tenant,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /academy/coaches/:id/update ─────────────────────────
const updateCoach = async (req, res, next) => {
    try {
        const { name, phone } = req.body;

        const missing = [];
        if (!name  || !name.trim())  missing.push('Name');
        if (!phone || !phone.trim()) missing.push('Phone');
        if (phone  && !/^[0-9]{10}$/.test(phone.trim())) missing.push('Phone (must be 10 digits)');

        if (missing.length > 0) {
            if (req.file) _cleanFile(req.file.path);
            return res.render('academy/coaches/form', {
                title:      'Edit Coach',
                activePage: 'academy-coaches',
                coach:      { ...req.body, id: req.params.id },
                error:      `Please fill in required fields: ${missing.join(', ')}`,
                success:    null,
                tenant:     req.tenant,
            });
        }

        const newPhoto = req.file ? req.file.filename : null;

        await coachService.updateCoach(
            req.params.id,
            req.body,
            req.tenant ? req.tenant.id : null,
            req.user.role,
            newPhoto
        );

        return res.redirect(`/academy/coaches/${req.params.id}/edit?success=Coach updated successfully`);
    } catch (err) {
        if (req.file) _cleanFile(req.file.path);
        return res.render('academy/coaches/form', {
            title:      'Edit Coach',
            activePage: 'academy-coaches',
            coach:      { ...req.body, id: req.params.id },
            error:      err.message || 'Something went wrong',
            success:    null,
            tenant:     req.tenant,
        });
    }
};

// ── POST /academy/coaches/:id/toggle ─────────────────────────
const toggleStatus = async (req, res, next) => {
    try {
        await coachService.toggleStatus(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect('/academy/coaches?success=Coach status updated');
    } catch (err) {
        return res.redirect(`/academy/coaches?error=${encodeURIComponent(err.message)}`);
    }
};

// ── POST /academy/coaches/:id/delete ─────────────────────────
const deleteCoach = async (req, res, next) => {
    try {
        await coachService.deleteCoach(
            req.params.id,
            req.tenant ? req.tenant.id : null,
            req.user.role
        );
        return res.redirect('/academy/coaches?success=Coach deleted');
    } catch (err) {
        return res.redirect(`/academy/coaches?error=${encodeURIComponent(err.message)}`);
    }
};

function _cleanFile(filePath) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
}

module.exports = {
    getCoachesPage,
    getAddCoachPage,
    getCoachDetailPage,
    createCoach,
    getEditCoachPage,
    updateCoach,
    toggleStatus,
    deleteCoach,
};