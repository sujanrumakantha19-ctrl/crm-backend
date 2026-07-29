const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const errorHandler = require('../middleware/error');

// Build a minimal Express app that mirrors the real routing
function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Mount all routes
  app.use('/api/v1/auth', require('../routes/authRoutes'));
  app.use('/api/v1/users', require('../routes/userRoutes'));
  app.use('/api/v1/projects', require('../routes/projectRoutes'));
  app.use('/api/v1/plots', require('../routes/plotRoutes'));
  app.use('/api/v1/leads', require('../routes/leadRoutes'));
  app.use('/api/v1/tasks', require('../routes/taskRoutes'));
  app.use('/api/v1/attendance', require('../routes/attendanceRoutes'));
  app.use('/api/v1/channel-partners', require('../routes/channelPartnerRoutes'));
  app.use('/api/v1/notifications', require('../routes/notificationRoutes'));
  app.use('/api/v1/groups', require('../routes/groupRoutes'));
  app.use('/api/v1/activity-logs', require('../routes/activityLogRoutes'));

  app.use(errorHandler);
  return app;
}

// Generate a valid JWT token for a user
function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// Create a test user and return user + token
async function createTestUser(overrides = {}) {
  const userData = {
    name: 'Test User',
    initials: 'TU',
    role: 'staff',
    email: `test${Date.now()}@example.com`,
    phone: '9876543210',
    password: 'password123',
    ...overrides,
  };
  const user = await User.create(userData);
  const token = generateToken(user._id);
  return { user, token };
}

// Create an admin test user
async function createAdminUser(overrides = {}) {
  return createTestUser({ role: 'admin', name: 'Admin User', initials: 'AU', ...overrides });
}

// Create a partner test user
async function createPartnerUser(overrides = {}) {
  return createTestUser({ role: 'partner', name: 'Partner User', initials: 'PU', ...overrides });
}

module.exports = {
  buildTestApp,
  generateToken,
  createTestUser,
  createAdminUser,
  createPartnerUser,
};
