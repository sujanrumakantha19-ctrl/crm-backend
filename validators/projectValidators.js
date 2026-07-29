const { body } = require('express-validator');

exports.createProjectValidator = [
  body('name').trim().notEmpty().withMessage('Project name is required'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
];

exports.updateProjectValidator = [
  body('name').optional().trim().notEmpty().withMessage('Project name cannot be empty'),
  body('location').optional().trim().notEmpty().withMessage('Location cannot be empty'),
];
