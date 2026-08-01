const { body } = require('express-validator');

exports.createLeadValidator = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('source').trim().notEmpty().withMessage('Source is required'),
];

exports.updateLeadValidator = [
  body('customerName').optional().trim().notEmpty().withMessage('Customer name cannot be empty'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('status').optional().isIn(['Open', 'Qualified', 'Unqualified', 'Customer']).withMessage('Invalid status'),
  body('source').optional().trim().notEmpty().withMessage('Source cannot be empty'),
  body('assignedTo').optional().trim().notEmpty().withMessage('AssignedTo cannot be empty'),
];
