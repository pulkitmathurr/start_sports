const express          = require('express');
const router           = express.Router();
const reportController = require('./report.controller');
const authMiddleware   = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

router.get('/', reportController.getReportPage);

module.exports = router;