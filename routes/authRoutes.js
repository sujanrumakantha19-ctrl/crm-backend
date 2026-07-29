const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  addPushToken,
  removePushToken,
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');
const validate = require('../validators/validate');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  updatePasswordValidator,
} = require('../validators/authValidators');

// Rate limiter for forgot-password endpoint
// Allow 5 requests per 15 minutes per IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5,
  message: {
    success: false,
    message: 'Too many password reset requests from this IP, please try again after 15 minutes',
  },
});

// Rate limiter for login endpoint
// Allow 10 requests per 15 minutes per IP to prevent brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
  },
});

router.route('/register').post(registerValidator, validate, register);
router.route('/login').post(loginLimiter, loginValidator, validate, login);
router.route('/me').get(protect, getMe);
router.route('/update-profile').put(protect, updateProfile);
router.route('/change-password').put(protect, updatePasswordValidator, validate, changePassword);
router.route('/forgot-password').post(forgotPasswordLimiter, forgotPasswordValidator, validate, forgotPassword);
router.route('/reset-password').post(resetPasswordValidator, validate, resetPassword);

router.route('/push-token')
  .put(protect, addPushToken)
  .delete(protect, removePushToken);

module.exports = router;