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

// Specific routes BEFORE parameterized routes
router.route('/status/:status').get(protect, getTasksByStatus);
router.route('/priority/:priority').get(protect, getTasksByPriority);
router.route('/assignee/:assigneeId').get(protect, getTasksByAssignee);
router.route('/project/:projectId').get(protect, getTasksByProject);

router
  .route('/')
  .get(protect, advancedResults(Task, [
    { path: 'assignee', select: 'name initials role' },
  ]), getTasks)
  .post(protect, createTask);

router
  .route('/:id')
  .get(protect, getTask)
  .put(protect, updateTask)
  .delete(protect, authorize('admin'), deleteTask);

module.exports = router;
