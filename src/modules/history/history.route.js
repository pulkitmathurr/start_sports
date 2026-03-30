const express           = require('express');
const router            = express.Router();
const historyController = require('./history.controller');
const authMiddleware    = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

router.get('/',                          historyController.getHistoryPage);
router.get('/:groundId',                 historyController.getGroundHistoryPage);
router.post('/booking/:id/delete',       historyController.softDeleteBooking);

module.exports = router;