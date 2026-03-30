const express    = require('express');
const router     = express.Router();
const controller = require('./tenant.signup.controller');
const { signupValidator } = require('./tenant.signup.validator');

// GET  /tenant/signup  — show signup page with plans
router.get('/signup', controller.signupPage);

// POST /tenant/signup  — handle form submit
router.post('/signup', signupValidator, controller.signup);

module.exports = router;