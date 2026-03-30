const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const validationRule = require('./auth.validator.js');
const authMiddleware = require('../../middlewares/auth.middleware');

// ─── Page Routes ──────────────────────────────────
router.get('/login', authController.loginPage);

router.get('/register-page', (req, res) => {
    res.render('auth/register', { title: 'Register', error: null });
});

// ─── API Routes ───────────────────────────────────
router.post('/register',      [validationRule.validate('register')], authController.register);
router.post('/login',         [validationRule.validate('login')],    authController.login);
router.post('/refresh-token', [validationRule.validate('refresh')],  authController.refreshToken);

// ─── Protected API Routes ─────────────────────────
router.post('/logout',       authMiddleware, authController.logout);
router.post('/force-logout', authMiddleware, authController.forceLogout);
router.get('/sessions',      authMiddleware, authController.getSessions);

module.exports = router;