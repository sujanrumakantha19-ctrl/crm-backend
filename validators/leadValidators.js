const { body } = require('express-validator');

exports.createLeadValidator = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('source').trim().notEmpty().withMessage('Source is required'),
];
