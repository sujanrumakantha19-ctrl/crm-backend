const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const logger = require('../utils/logger');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Magic byte signatures for file validation
const MAGIC_BYTES = [
  { sig: [0xFF, 0xD8, 0xFF], name: 'JPEG' },
  { sig: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], name: 'PNG' },
  { sig: [0x47, 0x49, 0x46, 0x38], name: 'GIF' },
  { sig: [0x25, 0x50, 0x44, 0x46], name: 'PDF' },
];

// WebP signature: RIFF at 0-3, WEBP at 8-11
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50];

function isValidFileType(source) {
  let buffer;

  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else if (typeof source === 'string') {
    // If it's a file path, read synchronously
    try {
      const fd = fsSync.openSync(source, 'r');
      buffer = Buffer.alloc(12);
      fsSync.readSync(fd, buffer, 0, 12, 0);
      fsSync.closeSync(fd);
    } catch (err) {
      return false;
    }
  } else {
    return false;
  }

  if (!buffer || buffer.length < 12) return false;

  // Check standard signatures
  for (const { sig } of MAGIC_BYTES) {
    if (buffer.slice(0, sig.length).equals(Buffer.from(sig))) return true;
  }

  // Check WebP (RIFF + WEBP)
  if (
    buffer.slice(0, 4).equals(Buffer.from(WEBP_RIFF)) &&
    buffer.slice(8, 12).equals(Buffer.from(WEBP_WEBP))
  ) return true;

  return false;
}

const isS3Configured = () => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET_NAME
  );
};

let s3Client = null;
const getS3Client = () => {
  if (!s3Client && isS3Configured()) {
    s3Client = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      region: process.env.AWS_REGION || 'ap-south-1',
    });
  }
  return s3Client;
};

// @desc    Upload files
// @route   POST /api/v1/uploads/:category
// @access  Private
exports.uploadFiles = asyncHandler(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('Please upload at least one file', 400));
  }

  const { category } = req.params;
  const validCategories = ['projects', 'plots', 'kyc', 'general', 'profiles'];

  if (!validCategories.includes(category)) {
    return next(new ErrorResponse(`Invalid category. Must be one of: ${validCategories.join(', ')}`, 400));
  }

  const client = getS3Client();
  const useS3 = isS3Configured() && client;
  const files = [];

  for (const file of req.files) {
    // Determine validation source (buffer for memory storage, path for disk storage)
    const source = file.buffer ? file.buffer : path.join(__dirname, '..', 'uploads', category, file.filename);
    
    if (!isValidFileType(source)) {
      // Clean up local file if using disk storage
      if (!file.buffer) {
        try { await fs.unlink(source); } catch {}
      }
      return next(new ErrorResponse(`Invalid file content: ${file.originalname} does not match declared type`, 400));
    }

    if (useS3) {
      // S3 upload flow
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      const filename = `${uniqueSuffix}${ext}`;
      const key = `${category}/${filename}`;

      try {
        await client.send(new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }));

        // KYC goes through proxy router redirect; public S3 objects go direct
        let filePath = '';
        if (category === 'kyc') {
          filePath = `/api/v1/uploads/kyc/${filename}`;
        } else {
          filePath = `/api/v1/uploads/file/${category}/${filename}`;
        }

        files.push({
          id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
          filename: filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          category,
          path: filePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.user.id,
        });
      } catch (err) {
        logger.error(`S3 Upload failed for ${file.originalname}: ${err.message}`);
        return next(new ErrorResponse(`S3 Upload failed: ${err.message}`, 500));
      }
    } else {
      // Local disk storage flow
      files.push({
        id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        category,
        path: `/uploads/${category}/${file.filename}`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user.id,
      });
    }
  }

  res.status(201).json({
    success: true,
    count: files.length,
    data: files,
  });
});

// @desc    Get all uploaded files for a category
// @route   GET /api/v1/uploads/:category
// @access  Private
exports.getFiles = asyncHandler(async (req, res, next) => {
  const { category } = req.params;
  const client = getS3Client();
  const useS3 = isS3Configured() && client;

  if (useS3) {
    try {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Prefix: `${category}/`
      }));

      const files = (response.Contents || [])
        .filter(obj => obj.Key !== `${category}/`) // exclude folder itself
        .map(obj => {
          const filename = obj.Key.replace(`${category}/`, '');
          let filePath = '';
          if (category === 'kyc') {
            filePath = `/api/v1/uploads/kyc/${filename}`;
          } else {
            filePath = `/api/v1/uploads/file/${category}/${filename}`;
          }
          return {
            filename,
            size: obj.Size,
            uploadedAt: obj.LastModified.toISOString(),
            path: filePath,
          };
        });

      return res.status(200).json({
        success: true,
        count: files.length,
        data: files,
      });
    } catch (err) {
      logger.error(`S3 List failed: ${err.message}`);
      return next(new ErrorResponse(`S3 List failed: ${err.message}`, 500));
    }
  }

  // Local filesystem fallback
  const uploadDir = path.join(__dirname, '..', 'uploads', category);

  try {
    await fs.access(uploadDir);
  } catch {
    return res.status(200).json({
      success: true,
      count: 0,
      data: [],
    });
  }

  const entries = await fs.readdir(uploadDir);
  const files = entries.filter((f) => f !== '.gitkeep');

  const fileList = await Promise.all(
    files.map(async (filename) => {
      const filePath = path.join(uploadDir, filename);
      const stats = await fs.stat(filePath);
      return {
        filename,
        size: stats.size,
        uploadedAt: stats.birthtime.toISOString(),
        path: `/uploads/${category}/${filename}`,
      };
    })
  );

  res.status(200).json({
    success: true,
    count: fileList.length,
    data: fileList,
  });
});

// @desc    Delete an uploaded file
// @route   DELETE /api/v1/uploads/:category/:filename
// @access  Private
exports.deleteFile = asyncHandler(async (req, res, next) => {
  const { category } = req.params;
  const filename = path.basename((req.params.filename || '').split('?')[0]);
  const client = getS3Client();
  const useS3 = isS3Configured() && client;

  if (useS3) {
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: `${category}/${filename}`
      }));

      return res.status(200).json({
        success: true,
        data: {},
      });
    } catch (err) {
      logger.error(`S3 Delete failed for ${filename}: ${err.message}`);
      return next(new ErrorResponse(`S3 Delete failed: ${err.message}`, 500));
    }
  }

  // Local filesystem fallback
  const filePath = path.join(__dirname, '..', 'uploads', category, filename);

  try {
    await fs.access(filePath);
  } catch {
    return next(new ErrorResponse('File not found', 404));
  }

  await fs.unlink(filePath);

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Redirect to S3 presigned URL for secure KYC document
// @route   GET /api/v1/uploads/kyc/:filename
// @access  Private
exports.getKycPresignedUrl = asyncHandler(async (req, res, next) => {
  const { filename } = req.params;

  const client = getS3Client();
  if (!isS3Configured() || !client) {
    // If S3 is not configured, fallback to serving the file locally
    const filePath = path.join(__dirname, '..', 'uploads', 'kyc', filename);
    try {
      await fs.access(filePath);
      return res.sendFile(filePath);
    } catch {
      return next(new ErrorResponse('File not found', 404));
    }
  }

  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `kyc/${filename}`,
    });

    // Generate link valid for 15 minutes (900 seconds)
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 900 });
    
    // Redirect user to the secure expiring link
    res.redirect(signedUrl);
  } catch (err) {
    logger.error(`Presigned URL generation failed for ${filename}: ${err.message}`);
    return next(new ErrorResponse(`Failed to generate secure link: ${err.message}`, 500));
  }
});

// @desc    Serve / stream uploaded file from S3 or local storage
// @route   GET /api/v1/uploads/file/:category/:filename
// @access  Public (for img tags)
exports.serveFile = asyncHandler(async (req, res, next) => {
  const { category, filename } = req.params;
  const client = getS3Client();
  const useS3 = isS3Configured() && client;

  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Frame-Options');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (useS3) {
    try {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: `${category}/${filename}`,
      });
      const s3Response = await client.send(command);

      let contentType = s3Response.ContentType;
      if (!contentType || contentType === 'binary/octet-stream' || contentType === 'application/octet-stream') {
        if (filename.toLowerCase().endsWith('.pdf')) {
          contentType = 'application/pdf';
        } else if (filename.toLowerCase().endsWith('.png')) {
          contentType = 'image/png';
        } else if (filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) {
          contentType = 'image/jpeg';
        }
      }

      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      if (s3Response.ContentLength) {
        res.setHeader('Content-Length', s3Response.ContentLength);
      }
      // Force inline rendering (prevents download dialog for PDFs/images)
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      s3Response.Body.pipe(res);
      return;
    } catch (err) {
      logger.error(`S3 serve file failed for ${category}/${filename}: ${err.message}`);
      return next(new ErrorResponse('File not found', 404));
    }
  }

  // Local filesystem fallback
  const filePath = path.join(__dirname, '..', 'uploads', category, filename);
  try {
    await fs.access(filePath);
    return res.sendFile(filePath);
  } catch {
    return next(new ErrorResponse('File not found', 404));
  }
});
