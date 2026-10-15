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
  getTodayPresence,
  getDailyAttendance,
  setAttendanceOverride,
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

// Protect all attendance routes: only admin and staff (reject partner with 403)
router.use(protect, authorize('admin', 'staff'));

// Specific routes BEFORE parameterized routes
router.route('/presence/today').get(authorize('admin'), getTodayPresence);
router.route('/daily').get(getDailyAttendance);
router.route('/override').post(authorize('admin'), setAttendanceOverride);
router.route('/today').get(getTodayAttendance);
router.route('/staff/:staffId').get(getAttendanceByStaff);
router.route('/date/:date').get(getAttendanceByDate);

router
  .route('/')
  .get(scopeStaffAttendance, advancedResults(Attendance, { path: 'staffId', select: 'name initials role' }), getAttendances)
  .post(createAttendance);

router
  .route('/:id')
  .get(getAttendance)
  .put(updateAttendance)
  .delete(deleteAttendance);

module.exports = router;
