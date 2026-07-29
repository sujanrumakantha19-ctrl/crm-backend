const { body } = require('express-validator');

exports.createChannelPartnerValidator = [
  body('name').trim().notEmpty().withMessage('Partner name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
];
