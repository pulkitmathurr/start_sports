const express           = require('express');
const router            = express.Router();
const profileController = require('./profile.controller');
const profileValidator  = require('./profile.validator');
const authMiddleware    = require('../../middlewares/auth.middleware');
const { upload } = require('../../middlewares/upload.middleware');
// All routes protected
router.use(authMiddleware);

router.get('/',                 profileController.getProfilePage);
router.post('/update',          profileValidator.validate('updateProfile'),  profileController.updateProfile);
router.post('/upload-image',    upload.single('profile_image'),              profileController.uploadImage);
router.post('/change-password', profileValidator.validate('changePassword'), profileController.changePassword);

module.exports = router;