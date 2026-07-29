const express = require('express');
const router = express.Router();

const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} = require('../controllers/userController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const User = require('../models/User');
const validate = require('../validators/validate');
const { createUserValidator, updateUserValidator } = require('../validators/userValidators');

router.use(protect);

router
  .route('/')
  .get(authorize('admin', 'staff', 'partner'), advancedResults(User, null, ['name', 'employeeId', 'displayId']), getUsers)
  .post(authorize('admin'), createUserValidator, validate, createUser);

router
  .route('/:id')
  .get(authorize('admin', 'staff', 'partner'), getUser)
  .put(authorize('admin'), updateUserValidator, validate, updateUser)
  .delete(authorize('admin'), deleteUser);

module.exports = router;
