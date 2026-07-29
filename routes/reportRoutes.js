const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getSummary,
  getProjectsReport,
  getStaffReport,
  getAttendanceReport,
  getLeadsTrendReport,
  getLeadContributionReport,
  getChannelPartnerPerformanceReport,
} = require('../controllers/reportController');

router.get('/summary', protect, getSummary);
router.get('/projects', protect, getProjectsReport);
router.get('/staff', protect, getStaffReport);
router.get('/attendance', protect, getAttendanceReport);
router.get('/leads-trend', protect, getLeadsTrendReport);
router.get('/lead-contribution', protect, getLeadContributionReport);
router.get('/channel-partner-performance', protect, getChannelPartnerPerformanceReport);

module.exports = router;

