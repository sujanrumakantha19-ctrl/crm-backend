const express = require('express');
const router = express.Router();

const {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectLocations,
  syncProjectPlots,
} = require('../controllers/projectController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Project = require('../models/Project');
const validate = require('../validators/validate');
const {
  createProjectValidator,
  updateProjectValidator,
} = require('../validators/projectValidators');

// Specific routes BEFORE parameterized routes
router.route('/locations').get(protect, getProjectLocations);
router.route('/sync-plots').post(protect, authorize('admin'), syncProjectPlots);

router
  .route('/')
  .get(protect, advancedResults(Project, 'availablePlots', ['name', 'displayId']), getProjects)
  .post(protect, authorize('admin', 'staff'), createProjectValidator, validate, createProject);

router
  .route('/:id')
  .get(protect, getProject)
  .put(protect, authorize('admin', 'staff'), updateProjectValidator, validate, updateProject)
  .delete(protect, authorize('admin'), deleteProject);

module.exports = router;
