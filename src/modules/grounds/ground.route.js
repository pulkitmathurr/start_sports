const express        = require('express');
const router         = express.Router();
const groundController   = require('./ground.controller');
const authMiddleware     = require('../../middlewares/auth.middleware');
const { uploadGroundImages } = require('../../middlewares/upload.middleware');

// All routes protected
router.use(authMiddleware);

// List & Add
router.get('/',                                    groundController.getGroundsPage);
router.get('/new',                                 groundController.getAddGroundPage);
router.post('/create',  uploadGroundImages.array('images', 10), groundController.createGround);

// Edit & Update
router.get('/:id/edit',                            groundController.getEditGroundPage);
router.post('/:id/update', uploadGroundImages.array('images', 10), groundController.updateGround);

// Image actions
router.post('/:id/image/:imageId/primary',         groundController.setPrimaryImage);
router.post('/:id/image/:imageId/delete',          groundController.deleteImage);

// Status & Delete
router.post('/:id/toggle',                         groundController.toggleStatus);
router.post('/:id/delete',                         groundController.deleteGround);

module.exports = router;