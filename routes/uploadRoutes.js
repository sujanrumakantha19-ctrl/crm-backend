const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  uploadFiles,
  getFiles,
  deleteFile,
  getKycPresignedUrl,
  serveFile,
} = require('../controllers/uploadController');
const { protect } = require('../middleware/auth');
const {
  uploadProjectImages,
  uploadPlotImages,
  uploadKycDocuments,
  uploadGeneral,
  uploadProfiles,
} = require('../middleware/upload');

// Public route for rendering image files in <img> tags
router.get('/file/:category/:filename', serveFile);

router.use(protect);

// Multer instances mapped by category
const uploaders = {
  projects: uploadProjectImages.array('files', 10),
  plots: uploadPlotImages.array('files', 10),
  kyc: uploadKycDocuments.array('files', 5),
  general: uploadGeneral.array('files', 10),
  profiles: uploadProfiles.array('files', 5),
};

// Upload files — dynamic multer based on category
router.post('/:category', (req, res, next) => {
  const { category } = req.params;
  const uploader = uploaders[category];

  if (!uploader) {
    return res.status(400).json({
      success: false,
      error: `Invalid category. Must be one of: ${Object.keys(uploaders).join(', ')}`,
    });
  }

  uploader(req, res, (err) => {
    if (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
      });
    }
    next();
  });
}, uploadFiles);

// Secure KYC Redirect route
router.get('/kyc/:filename', getKycPresignedUrl);

// List files by category
router.get('/:category', getFiles);

// Delete a file
router.delete('/:category/:filename', deleteFile);

module.exports = router;
