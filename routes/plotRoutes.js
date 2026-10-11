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
  getCustomerBookings,
  registerPlot,
  cancelBooking,
} = require('../controllers/plotController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const expandPlotLeadSearch = require('../middleware/expandPlotLeadSearch');
const Plot = require('../models/Plot');

// Specific routes BEFORE parameterized routes
router.route('/my-bookings').get(protect, authorize('staff'), expandPlotLeadSearch, getMyBookings);
router.route('/customer-bookings').get(protect, expandPlotLeadSearch, getCustomerBookings);
router.route('/pending-approvals').get(protect, authorize('admin'), getPendingApprovals);
router.route('/status/:status').get(protect, getPlotsByStatus);
router.route('/project/:projectId').get(protect, getPlotsByProject);
router.route('/:id/pending-approval').get(protect, getPlotPendingApproval);
router.route('/:id/book').put(protect, authorize('admin', 'staff'), bookPlot);
router.route('/:id/cancel').put(protect, authorize('admin', 'staff'), cancelBooking);
router.route('/:id/approve').put(protect, authorize('admin'), approveBooking);
router.route('/:id/reject').put(protect, authorize('admin'), rejectBooking);
router.route('/:id/register').put(protect, authorize('admin', 'staff'), registerPlot);

router
  .route('/')
  .get(protect, expandPlotLeadSearch, advancedResults(Plot, { path: 'projectId', select: 'name location status surveyNumber displayId' }, [
    'plotNumber',
    'bookedBy.name',
    'bookedBy.phone',
    'bookedBy.bank',
    'bookedBy.bankFollowerName',
    'bookedBy.bankFollowerPhone',
    'bookedBy.staffDisplayId',
    'assignedToName',
  ]), getPlots)
  .post(protect, authorize('admin', 'staff'), createPlot);

router
  .route('/:id')
  .get(protect, getPlot)
  .put(protect, authorize('admin', 'staff'), updatePlot)
  .delete(protect, authorize('admin'), deletePlot);

module.exports = router;
