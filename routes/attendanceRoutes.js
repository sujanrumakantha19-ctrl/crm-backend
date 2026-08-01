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

// Restrict staff users to their own attendance records on the collection route
const scopeStaffAttendance = (req, res, next) => {
  if (req.user && req.user.role === 'staff') {
    req.query.staffId = String(req.user.id || req.user._id || '');
  }
  next();
};

// Specific routes BEFORE parameterized routes
router.route('/today').get(protect, getTodayAttendance);
router.route('/staff/:staffId').get(protect, getAttendanceByStaff);
router.route('/date/:date').get(protect, getAttendanceByDate);

router
  .route('/')
  .get(protect, scopeStaffAttendance, advancedResults(Attendance, { path: 'staffId', select: 'name initials role' }), getAttendances)
  .post(protect, createAttendance);

router
  .route('/:id')
  .get(protect, getAttendance)
  .put(protect, updateAttendance)
  .delete(protect, deleteAttendance);

module.exports = router;
