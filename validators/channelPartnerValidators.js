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

exports.createChannelPartnerValidator = [
  body('name').trim().notEmpty().withMessage('Partner name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  dobMinAge18(),
];

exports.updateChannelPartnerValidator = [
  body('name').optional().trim().notEmpty().withMessage('Partner name cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim().notEmpty().withMessage('Phone cannot be empty'),
  dobMinAge18(),
];
