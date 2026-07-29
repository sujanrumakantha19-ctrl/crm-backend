const express = require('express');
const router = express.Router();

const {
  getChannelPartners,
  getChannelPartner,
  createChannelPartner,
  updateChannelPartner,
  deleteChannelPartner,
  getChannelPartnersByCity,
  getActiveChannelPartners,
} = require('../controllers/channelPartnerController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const ChannelPartner = require('../models/ChannelPartner');
const validate = require('../validators/validate');
const { createChannelPartnerValidator } = require('../validators/channelPartnerValidators');

// Specific routes BEFORE parameterized routes
router.route('/active').get(protect, getActiveChannelPartners);
router.route('/city/:city').get(protect, getChannelPartnersByCity);

router
  .route('/')
  .get(protect, advancedResults(ChannelPartner, null, ['name', 'companyName', 'displayId']), getChannelPartners)
  .post(protect, authorize('admin'), createChannelPartnerValidator, validate, createChannelPartner);

router
  .route('/:id')
  .get(protect, getChannelPartner)
  .put(protect, authorize('admin'), updateChannelPartner)
  .delete(protect, authorize('admin'), deleteChannelPartner);

module.exports = router;
