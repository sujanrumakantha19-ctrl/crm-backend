const express = require('express');
const router = express.Router({ mergeParams: true });

const {
  getPlots,
  getPlot,
  createPlot,
  updatePlot,
  deletePlot,
  getPlotsByProject,
  getPlotsByStatus,
  getPlotPendingApproval,
  bookPlot,
  approveBooking,
  rejectBooking,
  getPendingApprovals,
  getMyBookings,
  registerPlot,
  cancelBooking,
} = require('../controllers/plotController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Plot = require('../models/Plot');

// Specific routes BEFORE parameterized routes
router.route('/my-bookings').get(protect, authorize('staff'), getMyBookings);
router.route('/pending-approvals').get(protect, authorize('admin'), getPendingApprovals);
router.route('/status/:status').get(protect, getPlotsByStatus);
router.route('/project/:projectId').get(protect, getPlotsByProject);
router.route('/:id/pending-approval').get(protect, getPlotPendingApproval);
router.route('/:id/book').put(protect, bookPlot);
router.route('/:id/cancel').put(protect, authorize('admin'), cancelBooking);
router.route('/:id/approve').put(protect, authorize('admin'), approveBooking);
router.route('/:id/reject').put(protect, authorize('admin'), rejectBooking);
router.route('/:id/register').put(protect, authorize('admin'), registerPlot);

router
  .route('/')
  .get(protect, advancedResults(Plot, { path: 'projectId', select: 'name location status surveyNumber' }, [
    'plotNumber',
    'bookedBy.name',
    'bookedBy.phone',
    'bookedBy.bank',
    'bookedBy.bankFollowerName',
    'bookedBy.bankFollowerPhone',
    'assignedTo',
    'assignedToName',
  ]), getPlots)
  .post(protect, authorize('admin', 'staff'), createPlot);

router
  .route('/:id')
  .get(protect, getPlot)
  .put(protect, authorize('admin'), updatePlot)
  .delete(protect, authorize('admin'), deletePlot);

module.exports = router;
