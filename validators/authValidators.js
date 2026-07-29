const { body } = require('express-validator');

exports.registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

exports.loginValidator = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

exports.forgotPasswordValidator = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
];

exports.resetPasswordValidator = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

exports.updatePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
];
