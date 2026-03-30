const groundService = require('./ground.service');

// ── GET /grounds ──────────────────────────────
const getGroundsPage = async (req, res, next) => {
    try {
        const grounds = await groundService.getAllGrounds();
        return res.render('grounds/index', {
            title: 'Manage Grounds', activePage: 'grounds',
            grounds, success: req.query.success || null, error: req.query.error || null
        });
    } catch (error) { next(error); }
};

// ── GET /grounds/new ──────────────────────────
const getAddGroundPage = async (req, res, next) => {
    try {
        return res.render('grounds/form', {
            title: 'Add New Ground', activePage: 'grounds',
            ground: null, error: null
        });
    } catch (error) { next(error); }
};

// ── POST /grounds/create ──────────────────────
const createGround = async (req, res, next) => {
    try {
        const groundId = await groundService.createGround(req.body);

        // Images save karo agar upload ki hain
        if (req.files && req.files.length > 0) {
            const filenames = req.files.map(f => f.filename);
            await groundService.saveGroundImages(groundId, filenames);
        }

        return res.redirect('/grounds?success=Ground added successfully');
    } catch (error) {
        return res.render('grounds/form', {
            title: 'Add New Ground', activePage: 'grounds',
            ground: null, error: error.message
        });
    }
};

// ── GET /grounds/:id/edit ─────────────────────
const getEditGroundPage = async (req, res, next) => {
    try {
        const ground = await groundService.getGroundById(req.params.id);
        return res.render('grounds/form', {
            title: 'Edit Ground', activePage: 'grounds',
            ground, error: null
        });
    } catch (error) { next(error); }
};

// ── POST /grounds/:id/update ──────────────────
const updateGround = async (req, res, next) => {
    try {
        await groundService.updateGround(req.params.id, req.body);

        // Nai images agar upload ki hain
        if (req.files && req.files.length > 0) {
            const filenames = req.files.map(f => f.filename);
            await groundService.saveGroundImages(req.params.id, filenames);
        }

        return res.redirect('/grounds?success=Ground updated successfully');
    } catch (error) {
        const ground = await groundService.getGroundById(req.params.id).catch(() => ({ id: req.params.id, ...req.body, images: [] }));
        return res.render('grounds/form', {
            title: 'Edit Ground', activePage: 'grounds',
            ground, error: error.message
        });
    }
};

// ── POST /grounds/:id/image/:imageId/primary ──
const setPrimaryImage = async (req, res, next) => {
    try {
        await groundService.setPrimaryImage(req.params.id, req.params.imageId);
        return res.redirect(`/grounds/${req.params.id}/edit?success=Primary image updated`);
    } catch (error) { next(error); }
};

// ── POST /grounds/:id/image/:imageId/delete ───
const deleteImage = async (req, res, next) => {
    try {
        await groundService.deleteGroundImage(req.params.id, req.params.imageId);
        return res.redirect(`/grounds/${req.params.id}/edit`);
    } catch (error) { next(error); }
};

// ── POST /grounds/:id/toggle ──────────────────
const toggleStatus = async (req, res, next) => {
    try {
        await groundService.toggleStatus(req.params.id);
        return res.redirect('/grounds?success=Ground status updated');
    } catch (error) { next(error); }
};

// ── POST /grounds/:id/delete ──────────────────
const deleteGround = async (req, res, next) => {
    try {
        await groundService.deleteGround(req.params.id);
        return res.redirect('/grounds?success=Ground deleted successfully');
    } catch (error) {
        return res.redirect(`/grounds?error=${error.message}`);
    }
};

module.exports = {
    getGroundsPage, getAddGroundPage, createGround,
    getEditGroundPage, updateGround,
    setPrimaryImage, deleteImage,
    toggleStatus, deleteGround
};