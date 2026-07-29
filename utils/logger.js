const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

// Custom format
const customFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

// Create logger
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    label({ label: 'right-meow!' }),
    timestamp(),
    customFormat
  ),
  transports: [
    // Console transport
    new transports.Console(),
    // File transport
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});



module.exports = logger;