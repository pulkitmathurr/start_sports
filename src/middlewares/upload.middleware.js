const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Avatar upload dir ─────────────────────────────
const avatarDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

// ── Ground images upload dir ──────────────────────
const groundDir = path.join(__dirname, '../public/uploads/grounds');
if (!fs.existsSync(groundDir)) fs.mkdirSync(groundDir, { recursive: true });

// ── File filter — validate both extension AND mimetype ────────
// Extension-only check can be bypassed by renaming a file (e.g. shell.php → shell.jpg).
// Checking mimetype as well means the browser-reported content type must also match.
// Note: mimetype is still client-supplied, but combining both checks raises the bar.
const fileFilter = (req, file, cb) => {
    const allowedExts  = ['.jpg', '.jpeg', '.png', '.webp'];
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext  = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG, PNG and WEBP images are allowed'), false);
    }
};

// ── Avatar upload (single) ────────────────────────
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `user_${req.user.user_id}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage:    avatarStorage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }  // 2MB
});

// ── Ground images upload (multiple) ──────────────
const groundStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, groundDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `ground_${Date.now()}_${Math.random().toString(36).slice(2,7)}${ext}`);
    }
});

const uploadGroundImages = multer({
    storage:    groundStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,   // 5MB per image
        files:    10                  // max 10 images per ground
    }
});

module.exports = { upload, uploadGroundImages };