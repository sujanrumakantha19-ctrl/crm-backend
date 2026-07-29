const asyncHandler = require('./async');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function loadUser(decoded) {
  if (!decoded || !decoded.id) return null;
  return User.findOne({ _id: decoded.id, isActive: true });
}

// Protect routes
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  req.user = await loadUser(decoded);
  if (!req.user) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  next();
});

// Protect export routes — accepts JWT from Authorization header OR ?token= query param
exports.exportProtect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  req.user = await loadUser(decoded);
  if (!req.user) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  next();
});

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};