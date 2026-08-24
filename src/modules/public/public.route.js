const express = require('express');
const router  = express.Router();
const ctrl    = require('./public.controller');

router.get('/facilities', ctrl.getFacilities);
router.get('/facilities/:slug', ctrl.getFacilityBySlug);

module.exports = router;