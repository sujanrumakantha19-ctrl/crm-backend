const { body } = require('express-validator');

exports.createUserValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'staff', 'partner']).withMessage('Invalid role'),
];

exports.updateUserValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['admin', 'staff', 'partner']).withMessage('Invalid role'),
];
