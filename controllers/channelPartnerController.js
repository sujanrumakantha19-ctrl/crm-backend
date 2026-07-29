const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const ChannelPartner = require('../models/ChannelPartner');

// @desc    Get all channel partners
// @route   GET /api/v1/channel-partners
// @access  Public
exports.getChannelPartners = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single channel partner
// @route   GET /api/v1/channel-partners/:id
// @access  Public
exports.getChannelPartner = asyncHandler(async (req, res, next) => {
  const channelPartner = await ChannelPartner.findById(req.params.id);

  if (!channelPartner) {
    return next(new ErrorResponse(`Channel partner not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: channelPartner,
  });
});

// @desc    Create channel partner
// @route   POST /api/v1/channel-partners
// @access  Private/Admin
exports.createChannelPartner = asyncHandler(async (req, res, next) => {
  const allowedFields = {
    userId: req.body.userId,
    name: req.body.name,
    companyName: req.body.companyName,
    phone: req.body.phone,
    email: req.body.email,
    city: req.body.city,
    reraId: req.body.reraId,
    isActive: req.body.isActive,
    initials: req.body.initials,
    avatarBg: req.body.avatarBg,
    notes: req.body.notes,
    dob: req.body.dob,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  const channelPartner = await ChannelPartner.create(allowedFields);

  res.status(201).json({
    success: true,
    data: channelPartner,
  });
});

// @desc    Update channel partner
// @route   PUT /api/v1/channel-partners/:id
// @access  Private/Admin
exports.updateChannelPartner = asyncHandler(async (req, res, next) => {
  let channelPartner = await ChannelPartner.findById(req.params.id);

  if (!channelPartner) {
    return next(new ErrorResponse(`Channel partner not found with id of ${req.params.id}`, 404));
  }

  const allowedFields = {
    userId: req.body.userId,
    name: req.body.name,
    companyName: req.body.companyName,
    phone: req.body.phone,
    email: req.body.email,
    city: req.body.city,
    reraId: req.body.reraId,
    totalLeads: req.body.totalLeads,
    isActive: req.body.isActive,
    initials: req.body.initials,
    avatarBg: req.body.avatarBg,
    notes: req.body.notes,
    dob: req.body.dob,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  channelPartner = await ChannelPartner.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: channelPartner,
  });
});

// @desc    Delete channel partner
// @route   DELETE /api/v1/channel-partners/:id
// @access  Private/Admin
exports.deleteChannelPartner = asyncHandler(async (req, res, next) => {
  const channelPartner = await ChannelPartner.findById(req.params.id);

  if (!channelPartner) {
    return next(new ErrorResponse(`Channel partner not found with id of ${req.params.id}`, 404));
  }

  await channelPartner.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get channel partners by city
// @route   GET /api/v1/channel-partners/city/:city
// @access  Public
exports.getChannelPartnersByCity = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { city: req.params.city };
  const total = await ChannelPartner.countDocuments(query);
  const channelPartners = await ChannelPartner.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: channelPartners.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: channelPartners,
  });
});

// @desc    Get active channel partners
// @route   GET /api/v1/channel-partners/active
// @access  Public
exports.getActiveChannelPartners = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { isActive: true };
  const total = await ChannelPartner.countDocuments(query);
  const channelPartners = await ChannelPartner.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: channelPartners.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: channelPartners,
  });
});