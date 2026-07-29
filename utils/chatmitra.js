const dotenv = require('dotenv');
dotenv.config();

const CHATMITRA_API_URL = process.env.CHATMITRA_API_URL || 'https://app.chatmitra.com/api/v1/send';
const CHATMITRA_API_KEY = process.env.CHATMITRA_API_KEY;

/**
 * Sends a WhatsApp message using Chatmitra API (or mocks it if API key is missing)
 * @param {string} phone Recipient phone number (e.g. "919876543210")
 * @param {object} payload Message payload
 * @returns {Promise<object>} Response data
 */
async function sendWhatsAppMessage(phone, payload) {
  // Clean phone number (remove +, spaces, dashes, ensure country code)
  let cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '');
  
  // If number doesn't start with country code, default to 91 (India) as it's the primary region
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  // Ensure payload has the correct format
  const requestBody = {
    to: cleanPhone,
    ...payload
  };

  // Mock response if API key is missing
  if (!CHATMITRA_API_KEY || CHATMITRA_API_KEY === 'mock' || CHATMITRA_API_KEY.trim() === '') {
    console.log('--- [CHATMITRA MOCK SEND] ---');
    console.log(`To: ${cleanPhone}`);
    console.log('Payload:', JSON.stringify(requestBody, null, 2));
    console.log('-----------------------------');
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      mock: true,
      messageId: `mock-msg-${Date.now()}`,
      status: 'sent'
    };
  }

  try {
    const response = await fetch(CHATMITRA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHATMITRA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `Chatmitra API responded with status ${response.status}`);
    }

    return {
      success: true,
      messageId: data.messageId || data.id,
      data
    };
  } catch (error) {
    console.error('Chatmitra API Error:', error.message);
    throw error;
  }
}

module.exports = {
  sendWhatsAppMessage
};
