const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Project = require('../models/Project');

const { syncAllCounters } = require('../utils/counterSync');

// @desc    Get all projects
// @route   GET /api/v1/projects
// @access  Public
exports.getProjects = asyncHandler(async (req, res, next) => {
  // Ensure all existing projects & records in DB have unique displayIds assigned
  await syncAllCounters();

  res.status(200).json(res.advancedResults);
});

// @desc    Get single project
// @route   GET /api/v1/projects/:id
// @access  Public
exports.getProject = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id)
    .populate('availablePlots');

  if (!project) {
    return next(new ErrorResponse(`Project not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: project,
  });
});

// @desc    Create project
// @route   POST /api/v1/projects
// @access  Private/Admin
exports.createProject = asyncHandler(async (req, res, next) => {
  const allowedFields = {
    name: req.body.name,
    location: req.body.location,
    description: req.body.description,
    status: req.body.status,
    totalLandArea: req.body.totalLandArea,
    landAreaUnit: req.body.landAreaUnit,
    surveyNumber: req.body.surveyNumber,
    village: req.body.village,
    mandal: req.body.mandal,
    district: req.body.district,
    landType: req.body.landType,
    totalPlots: req.body.totalPlots,
    plotSize: req.body.plotSize,
    plotSizeUnit: req.body.plotSizeUnit,
    roadFacingPlots: req.body.roadFacingPlots,
    cornerPlots: req.body.cornerPlots,
    pricePerSqUnit: req.body.pricePerSqUnit,
    images: req.body.images,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    category: req.body.category,
    isEnabled: req.body.isEnabled,
    plotImages: req.body.plotImages,
    owner: req.body.owner,
    sellers: req.body.sellers,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  const project = await Project.create(allowedFields);

  if (project.totalPlots > 0) {
    const Plot = require('../models/Plot');
    const plotsToCreate = [];
    for (let i = 1; i <= project.totalPlots; i++) {
      plotsToCreate.push({
        projectId: project._id,
        plotNumber: String(i),
        status: 'Available',
        size: project.plotSize || 200,
        sizeUnit: project.plotSizeUnit || 'Sq Yards',
      });
    }
    await Plot.insertMany(plotsToCreate);
  }

  res.status(201).json({
    success: true,
    data: project,
  });
});

// @desc    Update project
// @route   PUT /api/v1/projects/:id
// @access  Private/Admin
exports.updateProject = asyncHandler(async (req, res, next) => {
  let project = await Project.findById(req.params.id);

  if (!project) {
    return next(new ErrorResponse(`Project not found with id of ${req.params.id}`, 404));
  }

  const allowedFields = {
    name: req.body.name,
    location: req.body.location,
    description: req.body.description,
    status: req.body.status,
    totalLandArea: req.body.totalLandArea,
    landAreaUnit: req.body.landAreaUnit,
    surveyNumber: req.body.surveyNumber,
    village: req.body.village,
    mandal: req.body.mandal,
    district: req.body.district,
    landType: req.body.landType,
    totalPlots: req.body.totalPlots,
    plotSize: req.body.plotSize,
    plotSizeUnit: req.body.plotSizeUnit,
    roadFacingPlots: req.body.roadFacingPlots,
    cornerPlots: req.body.cornerPlots,
    pricePerSqUnit: req.body.pricePerSqUnit,
    images: req.body.images,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    category: req.body.category,
    isEnabled: req.body.isEnabled,
    plotImages: req.body.plotImages,
    owner: req.body.owner,
    sellers: req.body.sellers,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  project = await Project.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: project,
  });
});

// @desc    Delete project
// @route   DELETE /api/v1/projects/:id
// @access  Private/Admin
exports.deleteProject = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return next(new ErrorResponse(`Project not found with id of ${req.params.id}`, 404));
  }

  // Cascade cleanup: delete associated plots
  const Plot = require('../models/Plot');
  await Plot.deleteMany({ projectId: project._id });

  await project.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get all unique project locations
// @route   GET /api/v1/projects/locations
// @access  Public
exports.getProjectLocations = asyncHandler(async (req, res, next) => {
  const locations = await Project.distinct('location');

  res.status(200).json({
    success: true,
    data: locations.filter(loc => loc != null && loc.trim() !== ''),
  });
});

// @desc    Sync missing plots for all projects
// @route   POST /api/v1/projects/sync-plots
// @access  Private/Admin
exports.syncProjectPlots = asyncHandler(async (req, res, next) => {
  const Plot = require('../models/Plot');
  const projects = await Project.find();
  
  let totalPlotsCreated = 0;
  const syncedProjects = [];

  for (const project of projects) {
    if (project.totalPlots > 0) {
      const existingPlotsCount = await Plot.countDocuments({ projectId: project._id });
      
      if (existingPlotsCount < project.totalPlots) {
        const plotsToCreate = [];
        for (let i = existingPlotsCount + 1; i <= project.totalPlots; i++) {
          plotsToCreate.push({
            projectId: project._id,
            plotNumber: String(i),
            status: 'Available',
            size: project.plotSize || 200,
            sizeUnit: project.plotSizeUnit || 'Sq Yards',
          });
        }
        
        if (plotsToCreate.length > 0) {
          await Plot.insertMany(plotsToCreate);
          totalPlotsCreated += plotsToCreate.length;
          syncedProjects.push({
            projectId: project._id,
            projectName: project.name,
            plotsAdded: plotsToCreate.length
          });
        }
      }
    }
  }

  res.status(200).json({
    success: true,
    message: `Successfully synced ${totalPlotsCreated} missing plots.`,
    data: syncedProjects
  });
});