const express = require('express');
const router = express.Router();

const {
  getAttendances,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceByStaff,
  getAttendanceByDate,
  getTodayAttendance,
} = require('../controllers/attendanceController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Attendance = require('../models/Attendance');

// Specific routes BEFORE parameterized routes
router.route('/today').get(protect, getTodayAttendance);
router.route('/staff/:staffId').get(protect, getAttendanceByStaff);
router.route('/date/:date').get(protect, getAttendanceByDate);

router
  .route('/')
  .get(protect, advancedResults(Attendance, { path: 'staffId', select: 'name initials role' }), getAttendances)
  .post(protect, createAttendance);

router
  .route('/:id')
  .get(protect, getAttendance)
  .put(protect, updateAttendance)
  .delete(protect, deleteAttendance);

module.exports = router;
