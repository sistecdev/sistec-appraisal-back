const express = require('express');
const c = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const signInLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many tries. Wait a few minutes and try again.' });

router.post('/login', signInLimit, c.login);
router.get('/me', protect, c.getMe);
router.post('/change-password', protect, c.changePassword);
router.post('/forgot-password', signInLimit, c.forgotPassword);
router.post('/set-password', signInLimit, c.setPasswordWithLink);
router.get('/setup', c.setupStatus);
router.post('/setup', signInLimit, c.setup);

module.exports = router;
