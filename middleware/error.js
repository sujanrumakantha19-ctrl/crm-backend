const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message, name: err.name, code: err.code, statusCode: err.statusCode };

  // Log to console for dev
  if (err.stack) logger.error(err.stack);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found`;
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message).join(', ');
    error = new ErrorResponse(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new ErrorResponse('Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    error = new ErrorResponse('Token expired', 401);
  }

  // Multer errors
  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message;
    error = new ErrorResponse(message, 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
  });
};

module.exports = errorHandler;