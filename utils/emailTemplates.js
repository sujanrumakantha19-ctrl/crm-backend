/**
 * Email template generator for Samy&Co System Emails
 */

const getPasswordResetTemplate = ({ userName, resetUrl, validMinutes = 10 }) => {
  const brandName = process.env.FROM_NAME || 'Samy&Co';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - ${brandName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #334155;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f1f5f9;
      padding: 40px 0;
    }
    .main-table {
      width: 100%;
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      border: 1px solid #e2e8f0;
    }
    .header {
      background-color: #0f172a;
      background-image: linear-gradient(135deg, #0f172a 0%, #064e3b 100%);
      padding: 36px 32px;
      text-align: center;
    }
    .header-logo {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff !important;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .header-subtitle {
      font-size: 12px;
      color: #34d399 !important;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 6px;
    }
    .content {
      padding: 40px 32px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .text {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .btn {
      display: inline-block;
      padding: 14px 36px;
      background-color: #10b981;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
    }
    .notice-box {
      background-color: #fffbeb;
      border: 1px solid #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 28px;
    }
    .notice-title {
      font-size: 13px;
      font-weight: 700;
      color: #92400e;
      margin: 0 0 4px 0;
    }
    .notice-desc {
      font-size: 13px;
      color: #b45309;
      margin: 0;
      line-height: 1.4;
    }
    .link-fallback {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      line-height: 1.5;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main-table" cellpadding="0" cellspacing="0" role="presentation">
      <!-- Header -->
      <tr>
        <td class="header" style="background-color: #0f172a; padding: 36px 32px; text-align: center;">
          <div class="header-logo" style="font-size: 24px; font-weight: 800; color: #ffffff !important; margin: 0; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">
            🏢 ${brandName}
          </div>
          <div class="header-subtitle" style="font-size: 12px; color: #34d399 !important; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 6px;">
            Real Estate Management System
          </div>
        </td>
      </tr>

      <!-- Body Content -->
      <tr>
        <td class="content" style="padding: 40px 32px;">
          <h2 class="greeting" style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px;">
            Password Reset Request
          </h2>
          
          <p class="text" style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
            Hello ${userName ? `<strong>${userName}</strong>` : 'there'},
          </p>
          
          <p class="text" style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
            We received a request to reset your password for your <strong>${brandName}</strong> account. Click the button below to choose a new password.
          </p>

          <!-- Call to Action Button -->
          <div class="btn-container" style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" target="_blank" class="btn" style="display: inline-block; padding: 14px 36px; background-color: #10b981; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 15px; border-radius: 10px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);">
              Reset Password
            </a>
          </div>

          <!-- Expiry Notice Box -->
          <div class="notice-box" style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 28px;">
            <p class="notice-title" style="font-size: 13px; font-weight: 700; color: #92400e; margin: 0 0 4px 0;">
              ⏳ Important Expiration Notice
            </p>
            <p class="notice-desc" style="font-size: 13px; color: #b45309; margin: 0; line-height: 1.4;">
              This password reset link is valid for <strong>${validMinutes} minutes</strong> only. If you do not reset your password within this timeframe, you will need to request a new link.
            </p>
          </div>

          <p class="text" style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
            If the button above doesn't work, copy and paste this link into your browser:
          </p>
          <div class="link-fallback" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 12px; color: #64748b; word-break: break-all; line-height: 1.5;">
            <a href="${resetUrl}" style="color: #0284c7; text-decoration: underline;">${resetUrl}</a>
          </div>

          <p class="text" style="font-size: 13px; color: #94a3b8; margin-top: 28px; margin-bottom: 0;">
            🔒 If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td class="footer" style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
          <p style="margin: 0 0 6px 0;">© ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
          <p style="margin: 0;">This is an automated message, please do not reply directly to this email.</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;
};

module.exports = {
  getPasswordResetTemplate,
};
