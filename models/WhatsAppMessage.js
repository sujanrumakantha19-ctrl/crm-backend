const mongoose = require('mongoose');

const WhatsAppMessageSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, 'Please add a recipient phone number'],
      index: true,
    },
    message: {
      type: String,
      required: [true, 'Please add the message content'],
    },
    type: {
      type: String,
      enum: ['text', 'template'],
      default: 'text',
    },
    templateName: {
      type: String,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      default: 'outbound',
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WhatsAppMessage', WhatsAppMessageSchema);
