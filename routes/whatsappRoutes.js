const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { sendWhatsAppMessage } = require('../utils/chatmitra');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Send WhatsApp message (Template or Session Text)
// @route   POST /api/v1/whatsapp/send
// @access  Private
router.post('/send', protect, asyncHandler(async (req, res, next) => {
  const { phone, message, type = 'text', templateName, variables = [] } = req.body;

  if (!phone) {
    return next(new ErrorResponse('Please provide a recipient phone number', 400));
  }

  let payload = {};
  let dbMessageContent = message;

  if (type === 'template') {
    if (!templateName) {
      return next(new ErrorResponse('Please provide templateName for template type', 400));
    }
    // Meta/Chatmitra format for templates
    payload = {
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: 'en'
        },
        components: [
          {
            type: 'body',
            parameters: variables.map(v => ({ type: 'text', text: String(v) }))
          }
        ]
      }
    };
    dbMessageContent = `[Template: ${templateName}] | Variables: ${variables.join(', ')}`;
  } else {
    if (!message) {
      return next(new ErrorResponse('Please provide message content for text type', 400));
    }
    // Meta/Chatmitra format for text
    payload = {
      type: 'text',
      text: {
        body: message
      }
    };
  }

  try {
    const result = await sendWhatsAppMessage(phone, payload);
    
    // Log the message to the local database
    const dbMessage = await WhatsAppMessage.create({
      phone: phone.replace(/[\s\+\-\(\)]/g, ''),
      message: dbMessageContent,
      type,
      templateName,
      direction: 'outbound',
      status: 'sent',
      sentBy: req.user.id
    });

    res.status(200).json({
      success: true,
      data: dbMessage,
      apiResult: result
    });
  } catch (error) {
    // Log failed attempt to database
    await WhatsAppMessage.create({
      phone: phone.replace(/[\s\+\-\(\)]/g, ''),
      message: dbMessageContent,
      type,
      templateName,
      direction: 'outbound',
      status: 'failed',
      sentBy: req.user.id
    }).catch(console.error); // Catch DB error silently so we throw the original API error

    return next(new ErrorResponse(`Failed to send WhatsApp message: ${error.message}`, 500));
  }
}));

// @desc    Get WhatsApp message history for a phone number
// @route   GET /api/v1/whatsapp/history/:phone
// @access  Private
router.get('/history/:phone', protect, asyncHandler(async (req, res, next) => {
  const cleanPhone = req.params.phone.replace(/[\s\+\-\(\)]/g, '');

  const messages = await WhatsAppMessage.find({ phone: cleanPhone })
    .populate('sentBy', 'name email')
    .sort({ createdAt: 1 });

  res.status(200).json({
    success: true,
    count: messages.length,
    data: messages
  });
}));

module.exports = router;
