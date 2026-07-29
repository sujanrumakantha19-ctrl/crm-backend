// Validation helper functions

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email
 */
const isValidEmail = (email) => {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid phone number
 */
const isValidPhone = (phone) => {
  // Simple phone validation - allows +, digits, spaces, and parentheses
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im;
  return phoneRegex.test(phone);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} - Object with isValid boolean and message
 */
const validatePassword = (password) => {
  if (password.length < 6) {
    return {
      isValid: false,
      message: 'Password must be at least 6 characters long',
    };
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one uppercase letter',
    };
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one lowercase letter',
    };
  }

  // Check for at least one digit
  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one digit',
    };
  }

  return {
    isValid: true,
    message: 'Password is valid',
  };
};

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = {
  isValidEmail,
  isValidPhone,
  validatePassword,
  isValidURL,
};