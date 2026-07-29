const nodemailer = require('nodemailer');
const logger = require('./logger');

const sendEmail = async (options) => {
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
