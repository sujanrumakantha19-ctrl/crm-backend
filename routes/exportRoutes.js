const express = require('express');
const router = express.Router();
const { exportProtect, authorize } = require('../middleware/auth');
const {
  exportLeads,
  exportFollowUps,
  exportAttendance,
  exportTasks,
  exportProjects,
  exportProjectDetail,
  exportCustomers,
  exportLoans,
  exportUsers,
  exportChannelPartners,
  exportReports,
} = require('../controllers/exportController');

router.use(exportProtect);

router.get('/leads', exportLeads);
router.get('/follow-ups', exportFollowUps);
router.get('/attendance', authorize('admin', 'staff'), exportAttendance);
router.get('/tasks', exportTasks);
router.get('/projects', exportProjects);
router.get('/project-detail', exportProjectDetail);
router.get('/customers', exportCustomers);
router.get('/loans', exportLoans);
router.get('/users', exportUsers);
router.get('/channel-partners', exportChannelPartners);
router.get('/reports', authorize('admin'), exportReports);

module.exports = router;
