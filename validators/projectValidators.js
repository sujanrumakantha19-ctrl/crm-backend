const { body } = require('express-validator');

exports.createProjectValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Project name is required')
    .matches(/[a-zA-Z]/)
    .withMessage('Project name must contain alphabetic characters and cannot be numeric only'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('village')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/[a-zA-Z]/)
    .withMessage('Village must contain alphabetic characters and cannot be numeric only'),
  body('mandal')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/[a-zA-Z]/)
    .withMessage('Mandal must contain alphabetic characters and cannot be numeric only'),
  body('district')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/[a-zA-Z]/)
    .withMessage('District must contain alphabetic characters and cannot be numeric only'),
  body('latitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90'),
  body('longitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180'),
  body('totalPlots')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 5000 })
    .withMessage('Total Number of Plots must be a number between 1 and 5,000'),
];

exports.updateProjectValidator = [
  body('totalPlots')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 5000 })
    .withMessage('Total Number of Plots must be a number between 1 and 5,000'),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Project name cannot be empty')
    .matches(/[a-zA-Z]/)
    .withMessage('Project name must contain alphabetic characters and cannot be numeric only'),
  body('location').optional().trim().notEmpty().withMessage('Location cannot be empty'),
  body('latitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90'),
  body('longitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180'),
];
