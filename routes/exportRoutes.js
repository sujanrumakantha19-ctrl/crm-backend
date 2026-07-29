const express = require('express');
const router = express.Router();
const { exportProtect } = require('../middleware/auth');
const {
  exportLeads,
  exportFollowUps,
  exportAttendance,
  exportTasks,
  exportProjects,
  exportCustomers,
  exportUsers,
  exportChannelPartners,
  exportReports,
} = require('../controllers/exportController');

router.use(exportProtect);

router.get('/leads', exportLeads);
router.get('/follow-ups', exportFollowUps);
router.get('/attendance', exportAttendance);
router.get('/tasks', exportTasks);
router.get('/projects', exportProjects);
router.get('/customers', exportCustomers);
router.get('/users', exportUsers);
router.get('/channel-partners', exportChannelPartners);
router.get('/reports', exportReports);

module.exports = router;
