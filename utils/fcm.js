const admin = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const logger = require('./logger');

let messagingInstance = null;

try {
  let serviceAccount = null;

  // 1. Check local JSON config files
  const configPath = path.join(__dirname, '..', 'config', 'firebase-service-account.json');
  const rootDir = path.join(__dirname, '..', '..');
  let rootAdminSdkPath = null;
  try {
    if (fs.existsSync(rootDir)) {
      const files = fs.readdirSync(rootDir);
      const sdkFile = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
      if (sdkFile) rootAdminSdkPath = path.join(rootDir, sdkFile);
    }
  } catch (e) {}

  if (fs.existsSync(configPath)) {
    serviceAccount = require(configPath);
    logger.info('FCM: Initializing using local firebase-service-account.json');
  } else if (rootAdminSdkPath && fs.existsSync(rootAdminSdkPath)) {
    serviceAccount = require(rootAdminSdkPath);
    logger.info(`FCM: Initializing using root credentials: ${path.basename(rootAdminSdkPath)}`);
  }
  // 2. Check environment variable containing JSON content
  else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      logger.info('FCM: Initializing using FIREBASE_SERVICE_ACCOUNT environment variable');
    } catch (e) {
      logger.error('FCM: Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable JSON');
    }
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.cert(serviceAccount)
    });
    messagingInstance = getMessaging();
    logger.info('FCM: Firebase Admin initialized successfully.');
  } else {
    logger.warn('FCM: No Firebase credentials found. Push notifications will run in MOCK mode.');
  }
} catch (err) {
  logger.error(`FCM: Initialization error: ${err.message}`);
}

/**
 * Send push notification to a user's registered devices
 * @param {string} userId - Target user ID
 * @param {object} payload - { title, body, data }
 */
exports.sendPushToUser = async (userId, { title, body, data }) => {
  try {
    if (!userId) return;
    const user = await User.findById(userId);
    if (!user || !user.pushTokens || user.pushTokens.length === 0) {
      return;
    }

    const tokens = user.pushTokens.map(t => t.token);
    
    // Fallback to mock mode if not initialized
    if (!messagingInstance) {
      logger.info(`FCM [MOCK] Sending push to User: ${user.name} (${user.email})`);
      logger.info(`FCM [MOCK] Payload: Title="${title}", Body="${body}"`);
      return;
    }

    // Prepare push payload (FCM data payload keys/values must be strings)
    const stringifiedData = {};
    if (data) {
      Object.keys(data).forEach(key => {
        stringifiedData[key] = String(data[key]);
      });
    }

    const message = {
      notification: { title, body },
      data: stringifiedData,
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          sound: 'default',
          channelId: 'default',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
      tokens: tokens
    };

    logger.info(`FCM: Sending push notification to ${tokens.length} devices for user ${user.name}`);
    const response = await messagingInstance.sendEachForMulticast(message);
    
    // Check responses and clean up failed tokens
    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-argument' ||
            errorCode === 'messaging/invalid-registration-token'
          ) {
            tokensToRemove.push(tokens[idx]);
          }
          logger.warn(`FCM: Push failed for token index ${idx}: ${resp.error?.message} (Code: ${errorCode})`);
        }
      });

      if (tokensToRemove.length > 0) {
        logger.info(`FCM: Removing ${tokensToRemove.length} inactive/invalid tokens for user ${user.name}`);
        user.pushTokens = user.pushTokens.filter(t => !tokensToRemove.includes(t.token));
        await user.save();
      }
    }
  } catch (err) {
    logger.error(`FCM: Error in sendPushToUser: ${err.message}`);
  }
};
