const express = require('express');
const router = express.Router();

const {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  getLeadsByProject,
  getLeadsByStatus,
  getLeadsByUser,
  checkPhoneExists,
  getFollowUps,
  getLeadCounts,
} = require('../controllers/leadController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Lead = require('../models/Lead');
const validate = require('../validators/validate');
const { createLeadValidator } = require('../validators/leadValidators');

// Specific routes BEFORE parameterized routes
router.route('/counts').get(protect, getLeadCounts);
router.route('/follow-ups').get(protect, getFollowUps);
router.route('/check-phone/:phone').get(protect, checkPhoneExists);
router.route('/status/:status').get(protect, getLeadsByStatus);
router.route('/user/:userId').get(protect, getLeadsByUser);
router.route('/project/:projectId').get(protect, getLeadsByProject);

router
  .route('/')
  .get(protect, advancedResults(Lead, [
    { path: 'assignedTo', select: 'name initials role displayId' },
    { path: 'projectId', select: 'name location surveyNumber' },
    { path: 'plotId', select: 'plotNumber status' },
  ], [
    'customerName',
    'phone',
    'assignedToName',
    'assignedToDisplayId',
    'displayId',
    'email',
    'bank',
    'bankFollowerName',
    'bankFollowerPhone',
    'city',
    'source',
    'sourceType',
  ]), getLeads)
  .post(protect, createLeadValidator, validate, createLead);

router
  .route('/:id')
  .get(protect, getLead)
  .put(protect, updateLead)
  .delete(protect, deleteLead);

module.exports = router;
