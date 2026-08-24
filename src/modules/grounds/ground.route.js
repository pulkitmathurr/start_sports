const express        = require('express');
const router         = express.Router();
const groundController   = require('./ground.controller');
const authMiddleware     = require('../../middlewares/auth.middleware');
const { uploadGroundImages } = require('../../middlewares/upload.middleware');
const { csrfProtect }    = require('../../middlewares/csrf.middleware');

// All routes protected
router.use(authMiddleware);

// ── Multer error handler — wraps upload middleware so file type/size errors
//    redirect back to the form with a user-friendly message instead of a black JSON screen
function handleMulterError(uploadMiddleware) {
    return (req, res, next) => {
        uploadMiddleware(req, res, (err) => {
            if (!err) return next();

            const multer = require('multer');
            let message = 'Image upload failed. Please try again.';

            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') message = 'Image too large. Max 5MB per image.';
                else if (err.code === 'LIMIT_FILE_COUNT') message = 'Too many images. Max 10 images allowed.';
                else message = err.message;
            } else if (err && err.message) {
                message = err.message; // e.g. "Only JPG, PNG and WEBP images are allowed"
            }

            // Redirect back to referring page with error in query string
            const referer = req.headers.referer || '/grounds/new';
            const sep     = referer.includes('?') ? '&' : '?';
            return res.redirect(`${referer}${sep}error=${encodeURIComponent(message)}`);
        });
    };
}

// API Routes - MUST be before dynamic routes
router.get('/api/list',  groundController.getGroundsList);
router.get('/api/slots', groundController.getSlotsForDate);
router.get('/:id/slots', groundController.getGroundSlots);
router.post('/:id/slots', groundController.saveGroundSlots);

// List & Add (GET — no CSRF needed)
router.get('/',      groundController.getGroundsPage);
router.get('/new',   groundController.getAddGroundPage);

// Create & Update — multer runs FIRST (parses multipart body incl. _csrf field),
// then csrfProtect reads req.body._csrf, then controller runs.
router.post('/create',
    handleMulterError(uploadGroundImages.array('images', 10)),
    csrfProtect,
    groundController.createGround
);

router.post('/:id/update',
    handleMulterError(uploadGroundImages.array('images', 10)),
    csrfProtect,
    groundController.updateGround
);

// Edit page (GET — no CSRF needed)
router.get('/:id/edit', groundController.getEditGroundPage);

// Image actions — urlencoded body already parsed, csrfProtect reads req.body._csrf
router.post('/:id/image/:imageId/primary', csrfProtect, groundController.setPrimaryImage);
router.post('/:id/image/:imageId/delete',  csrfProtect, groundController.deleteImage);

// Status & Delete — same, urlencoded body
router.post('/:id/toggle', csrfProtect, groundController.toggleStatus);
router.post('/:id/delete', csrfProtect, groundController.deleteGround);

// Ground Blocks
router.get( '/:id/blocks',                   groundController.getBlocks);
router.post('/:id/blocks',                   groundController.createBlock);
router.post('/:id/blocks/:blockId/delete',   groundController.deleteBlock);

module.exports = router;