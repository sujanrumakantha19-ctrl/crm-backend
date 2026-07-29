const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsAsync = require('fs').promises;
const ErrorResponse = require('../utils/errorResponse');

// ─── Storage Configuration ──────────────────────────────────────────────
// Currently uses local disk storage.
// To migrate to S3, replace this with multer-s3 and update the
// UPLOAD_STORAGE env var or swap the storage engine.

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024; // 10MB default

// Allowed MIME types
const ALLOWED_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  documents: ['application/pdf'],
};

const ALL_ALLOWED_TYPES = [...ALLOWED_TYPES.images, ...ALLOWED_TYPES.documents];

// Magic byte signatures for MIME validation
const MAGIC_BYTES = {
  '\xFF\xD8\xFF': 'image/jpeg',
  '\x89\x50\x4E\x47\x0D\x0A\x1A\x0A': 'image/png',
  '\x47\x49\x46\x38': 'image/gif',
  '\x52\x49\x46\x46': 'image/webp', // WebP: RIFF....WEBP
  '\x25\x50\x44\x46': 'application/pdf',
};

function validateMagicBytes(buffer, declaredMime) {
  if (buffer.length < 12) return false;
  // Check against known signatures
  for (const [sig, mime] of Object.entries(MAGIC_BYTES)) {
    const sigBytes = Buffer.from(sig, 'latin1');
    if (buffer.slice(0, sigBytes.length).equals(sigBytes)) {
      // WebP-specific check: RIFF header must be followed by WEBP at offset 8
      if (mime === 'image/webp') {
        return buffer.slice(8, 12).toString('ascii') === 'WEBP';
      }
      return true;
    }
  }
  return false;
}

// ─── Storage Engines ────────────────────────────────────────────────────

const createDiskStorage = (subfolder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const dirPath = path.join(UPLOAD_DIR, subfolder);
      fs.mkdirSync(dirPath, { recursive: true });
      cb(null, dirPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    },
  });

const isS3Configured = () => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET_NAME
  );
};

const getStorageForCategory = (subfolder) => {
  if (isS3Configured()) {
    return multer.memoryStorage();
  }
  return createDiskStorage(subfolder);
};

// ─── File Filter ────────────────────────────────────────────────────────

const imageFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.images.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ErrorResponse('Only image files (JPEG, PNG, WebP, GIF) are allowed', 400), false);
  }
};

const documentFilter = (req, file, cb) => {
  if (!ALL_ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new ErrorResponse('Only images (JPEG, PNG, WebP, GIF) and PDFs are allowed', 400), false);
  }
  // Defer magic byte check to the controller after multer processes the file
  // Multer's file filter can't easily read raw buffer; we validate in uploadController
  cb(null, true);
};

// ─── Pre-configured Uploaders ───────────────────────────────────────────

const uploadProjectImages = multer({
  storage: getStorageForCategory('projects'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: documentFilter,
});

const uploadPlotImages = multer({
  storage: getStorageForCategory('plots'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: documentFilter,
});

const uploadKycDocuments = multer({
  storage: getStorageForCategory('kyc'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: documentFilter,
});

const uploadGeneral = multer({
  storage: getStorageForCategory('general'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: documentFilter,
});

const uploadProfiles = multer({
  storage: getStorageForCategory('profiles'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFilter,
});

// ─── Exports ────────────────────────────────────────────────────────────

module.exports = {
  uploadProjectImages,
  uploadPlotImages,
  uploadKycDocuments,
  uploadGeneral,
  uploadProfiles,
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
};
