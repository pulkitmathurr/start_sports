const express            = require('express');
const router             = express.Router();
const studentController  = require('./student.controller');
const { csrfProtect }    = require('../../../middlewares/csrf.middleware');
const multer             = require('multer');
const path               = require('path');
const fs                 = require('fs');

// ── Photo upload dir ──────────────────────────────────────────
const studentDir = path.join(__dirname, '../../../public/uploads/students');
if (!fs.existsSync(studentDir)) fs.mkdirSync(studentDir, { recursive: true });

const studentPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, studentDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `student_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`);
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

const uploadStudentPhoto = multer({
    storage:    studentPhotoStorage,
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
            const referer = req.headers.referer || '/academy/students';
            const sep = referer.includes('?') ? '&' : '?';
            return res.redirect(`${referer}${sep}error=${encodeURIComponent(message)}`);
        });
    };
}

// ── GET routes ────────────────────────────────────────────────
router.get('/',              studentController.getStudentsPage);
router.get('/new',           studentController.getAddStudentPage);
router.get('/:id/edit',      studentController.getEditStudentPage);
router.get('/:id/profile',   studentController.getStudentProfile);

// ── POST routes — multer first, then csrfProtect, then controller
router.post('/create',
    handleMulterError(uploadStudentPhoto.single('photo')),
    csrfProtect,
    studentController.createStudent
);

router.post('/:id/update',
    handleMulterError(uploadStudentPhoto.single('photo')),
    csrfProtect,
    studentController.updateStudent
);

router.post('/:id/toggle', csrfProtect, studentController.toggleStatus);
router.post('/:id/delete', csrfProtect, studentController.deleteStudent);

module.exports = router;