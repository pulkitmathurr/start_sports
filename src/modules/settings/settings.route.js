const express            = require('express');
const router             = express.Router();
const settingsController = require('./settings.controller');
const authMiddleware     = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

router.get('/',        settingsController.getSettingsPage);
router.post('/update', settingsController.updateSettings);

// Single endpoint returns ALL grounds with pending suggestions
router.get('/peak-suggestion/pending',             settingsController.getPendingSuggestion);
router.post('/:ground_id/peak-suggestion/accept',  settingsController.acceptSuggestion);
router.post('/:ground_id/peak-suggestion/dismiss', settingsController.dismissSuggestion);

module.exports = router;