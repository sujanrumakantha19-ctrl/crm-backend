const express = require('express');
const router = express.Router();

const {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getTasksByProject,
  getTasksByAssignee,
  getTasksByStatus,
  getTasksByPriority,
} = require('../controllers/taskController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Task = require('../models/Task');

router.use(protect);

// Specific routes BEFORE parameterized routes
router.route('/status/:status').get(getTasksByStatus);
router.route('/priority/:priority').get(getTasksByPriority);
router.route('/assignee/:assigneeId').get(getTasksByAssignee);
router.route('/project/:projectId').get(getTasksByProject);

router
  .route('/')
  .get(advancedResults(Task, [
    { path: 'assignee', select: 'name initials role' },
  ]), getTasks)
  .post(createTask);

router
  .route('/:id')
  .get(getTask)
  .put(updateTask)
  .delete(authorize('admin'), deleteTask);

module.exports = router;
