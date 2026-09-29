const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getSummary,
  getProjectsReport,
  getStaffReport,
  getAttendanceReport,
  getLeadsTrendReport,
  getLeadContributionReport,
  getChannelPartnerPerformanceReport,
  getOperationsMetrics,
  getDashboardLeadCharts,
} = require('../controllers/reportController');

router.get('/operations-metrics', protect, authorize('admin', 'staff'), getOperationsMetrics);
router.get('/dashboard-charts', protect, authorize('admin'), getDashboardLeadCharts);
router.get('/summary', protect, authorize('admin'), getSummary);
router.get('/projects', protect, authorize('admin'), getProjectsReport);
router.get('/staff', protect, authorize('admin'), getStaffReport);
router.get('/attendance', protect, authorize('admin'), getAttendanceReport);
router.get('/leads-trend', protect, authorize('admin'), getLeadsTrendReport);
router.get('/lead-contribution', protect, authorize('admin'), getLeadContributionReport);
router.get('/channel-partner-performance', protect, authorize('admin'), getChannelPartnerPerformanceReport);

module.exports = router;

