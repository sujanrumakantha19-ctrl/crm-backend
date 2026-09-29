const nodemailer = require('nodemailer');
const logger = require('./logger');

const isTestEnv = () =>
  process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

const sendEmail = async (options) => {
  // Never send real emails during automated tests.
  if (isTestEnv()) {
    logger.info('[TEST] Email send skipped (test environment).');
    return;
  }

  // Create a transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  // Define email options
  const message = {
    from: `${process.env.FROM_NAME || 'CRM-RE'} <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.message, // Send HTML email
  };

  // Send the email
  const info = await transporter.sendMail(message);

  logger.info('Message sent: %s', info.messageId);
};

module.exports = sendEmail;
