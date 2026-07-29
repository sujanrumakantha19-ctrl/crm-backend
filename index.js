const express = require('express');
const dotenv = require('dotenv');
const colors = require('colors');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/error');
const swaggerSetup = require('./config/swagger');
const logger = require('./utils/logger');

// Load env vars
dotenv.config({ path: './config/config.env' });

// Validate critical env vars
const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Connect to database
connectDB();

const app = express();

// Trust the first proxy (required for Render / cloud deployments)
// This fixes express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// ─── Security & Performance ───────────────────────────────────────────


// Set security headers (allow cross-origin resource sharing for uploaded images)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    frameguard: false,
  })
);

// Compress responses
app.use(compression());

// CORS configuration
const allowedOrigins = [
  'capacitor://localhost',
  'https://localhost',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS
    ? [...process.env.ALLOWED_ORIGINS.split(','), ...allowedOrigins]
    : process.env.NODE_ENV === 'production'
    ? allowedOrigins
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
};
app.use(cors(corsOptions));

// ─── Rate Limiting (in-memory, per-IP) ────────────────────────────────

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 100;

// Clean up expired entries every 5 minutes
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', RATE_LIMIT_MAX - 1);
    return next();
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('Retry-After', Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000));
    return res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
    });
  }

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', RATE_LIMIT_MAX - entry.count);
  next();
});

// ─── Body Parsing ──────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ───────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Routes ────────────────────────────────────────────────────────────

app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/users', require('./routes/userRoutes'));
app.use('/api/v1/projects', require('./routes/projectRoutes'));
app.use('/api/v1/plots', require('./routes/plotRoutes'));
app.use('/api/v1/leads', require('./routes/leadRoutes'));
app.use('/api/v1/tasks', require('./routes/taskRoutes'));
app.use('/api/v1/attendance', require('./routes/attendanceRoutes'));
app.use('/api/v1/channel-partners', require('./routes/channelPartnerRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));
app.use('/api/v1/groups', require('./routes/groupRoutes'));
app.use('/api/v1/activity-logs', require('./routes/activityLogRoutes'));
app.use('/api/v1/uploads', require('./routes/uploadRoutes'));
app.use('/api/v1/whatsapp', require('./routes/whatsappRoutes'));
app.use('/api/v1/reports', require('./routes/reportRoutes'));
app.use('/api/v1/export', require('./routes/exportRoutes'));

// Serve uploaded files statically (with auth)
const path = require('path');
const { protect } = require('./middleware/auth');
app.use('/uploads', protect);
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { dotfiles: 'deny', index: false }));

// Swagger API documentation
swaggerSetup(app);

// Health check endpoint
app.get('/api/v1/health', async (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  res.status(200).json({
    success: true,
    data: {
      status: dbState === 1 ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbStatus,
    },
  });
});

// Error handling middleware (should be last)
app.use(errorHandler);

// Handle unhandled routes (must be after error handler)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
  });
});

// ─── Server ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  // Start automated cron jobs for follow-up reminders & birthday notifications
  try {
    const { startCronJobs } = require('./utils/cronJobs');
    startCronJobs();
  } catch (err) {
    logger.error(`Failed to start cron jobs: ${err.message}`);
  }
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────

const gracefulShutdown = (signal) => {
  logger.warn(`${signal} received. Shutting down gracefully...`);
  clearInterval(rateLimitCleanup);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });

  // Force close after 10s if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  gracefulShutdown('Unhandled Rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  gracefulShutdown('Uncaught Exception');
});
