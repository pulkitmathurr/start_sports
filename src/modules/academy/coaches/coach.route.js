const express          = require('express');
const router           = express.Router();
const coachController  = require('./coach.controller');
const { csrfProtect }  = require('../../../middlewares/csrf.middleware');
const multer           = require('multer');
const path             = require('path');
const fs               = require('fs');

// ── Photo upload dir ──────────────────────────────────────────
const coachDir = path.join(__dirname, '../../../public/uploads/coaches');
if (!fs.existsSync(coachDir)) fs.mkdirSync(coachDir, { recursive: true });

const coachPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, coachDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `coach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedExts  = ['.jpg', '.jpeg', '.png', '.webp'];
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG, PNG and WEBP images are allowed'), false);
    }
};

const uploadCoachPhoto = multer({
    storage:    coachPhotoStorage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // 2 MB
});

// ── Multer error wrapper ──────────────────────────────────────
function handleMulterError(uploadMiddleware) {
    return (req, res, next) => {
        uploadMiddleware(req, res, (err) => {
            if (!err) return next();
            let message = 'Photo upload failed. Please try again.';
            if (err.code === 'LIMIT_FILE_SIZE') message = 'Photo too large. Max 2MB allowed.';
            else if (err.message) message = err.message;
            const referer = req.headers.referer || '/academy/coaches';
            const sep = referer.includes('?') ? '&' : '?';
            return res.redirect(`${referer}${sep}error=${encodeURIComponent(message)}`);
        });
    };
}

// ── GET routes ────────────────────────────────────────────────
router.get('/',           coachController.getCoachesPage);
router.get('/new',        coachController.getAddCoachPage);
router.get('/:id',        coachController.getCoachDetailPage);
router.get('/:id/edit',   coachController.getEditCoachPage);

// ── POST routes ───────────────────────────────────────────────
router.post('/create',
    handleMulterError(uploadCoachPhoto.single('photo')),
    csrfProtect,
    coachController.createCoach
);

router.post('/:id/update',
    handleMulterError(uploadCoachPhoto.single('photo')),
    csrfProtect,
    coachController.updateCoach
);

router.post('/:id/toggle', csrfProtect, coachController.toggleStatus);
router.post('/:id/delete', csrfProtect, coachController.deleteCoach);

module.exports = router;