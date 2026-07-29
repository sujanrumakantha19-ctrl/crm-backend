const express = require('express');
const router = express.Router();

const {
  getActivityLogs,
  getActivityLog,
  createActivityLog,
  deleteActivityLog,
  getActivityLogsByEntity,
  getActivityLogsByAction,
  getRecentActivityLogs,
} = require('../controllers/activityLogController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const ActivityLog = require('../models/ActivityLog');

router.use(protect);

// Specific routes BEFORE parameterized routes
router.route('/recent').get(getRecentActivityLogs);
router.route('/entity/:entityType').get(getActivityLogsByEntity);
router.route('/action/:actionType').get(getActivityLogsByAction);

router
  .route('/')
  .get(advancedResults(ActivityLog), getActivityLogs)
  .post(createActivityLog);

router
  .route('/:id')
  .get(getActivityLog)
  .delete(authorize('admin'), deleteActivityLog);

module.exports = router;
