const { body } = require('express-validator');

function dobMinAge18() {
  return body('dob')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage('Date of Birth must be a valid date')
    .custom((val) => {
      if (!val) return true;
      const dob = new Date(val);
      const minAgeDate = new Date();
      minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
      minAgeDate.setHours(23, 59, 59, 999);
      if (dob > minAgeDate) {
        throw new Error('Must be at least 18 years of age');
      }
      return true;
    });
}

exports.createLeadValidator = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('source').trim().notEmpty().withMessage('Source is required'),
  dobMinAge18(),
];

exports.updateLeadValidator = [
  body('customerName').optional().trim().notEmpty().withMessage('Customer name cannot be empty'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('status').optional().isIn(['Open', 'Qualified', 'Unqualified', 'Customer']).withMessage('Invalid status'),
  body('source').optional().trim().notEmpty().withMessage('Source cannot be empty'),
  body('assignedTo').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid assignedTo ID'),
  dobMinAge18(),
];
