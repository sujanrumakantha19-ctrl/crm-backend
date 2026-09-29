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

exports.createUserValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').optional({ nullable: true }).isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'staff', 'partner']).withMessage('Invalid role'),
  dobMinAge18(),
];

exports.updateUserValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['admin', 'staff', 'partner']).withMessage('Invalid role'),
  dobMinAge18(),
];
