const express               = require('express');
const router                = express.Router();
const attendanceController  = require('./attendance.controller');
const { csrfProtect }       = require('../../../middlewares/csrf.middleware');

router.get('/',        attendanceController.getAttendancePage);
router.get('/mark',    attendanceController.getMarkPage);
router.post('/save',   csrfProtect, attendanceController.saveAttendance);

module.exports = router;