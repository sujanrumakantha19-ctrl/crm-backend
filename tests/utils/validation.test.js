const { isValidEmail, isValidPhone, validatePassword, isValidURL } = require('../../utils/validation');

describe('Validation Utils', () => {
  describe('isValidEmail', () => {
    it('should return true for valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should return true for valid phone numbers', () => {
      expect(isValidPhone('9876543210')).toBe(true);
      expect(isValidPhone('+919876543210')).toBe(true);
      expect(isValidPhone('987-654-3210')).toBe(true);
    });

    it('should return false for invalid phone numbers', () => {
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone('abc')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should return valid for strong password', () => {
      const result = validatePassword('Password1');
      expect(result.isValid).toBe(true);
    });

    it('should return invalid for short password', () => {
      const result = validatePassword('Pass1');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('6 characters');
    });

    it('should return invalid for missing uppercase', () => {
      const result = validatePassword('password1');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('uppercase');
    });

    it('should return invalid for missing lowercase', () => {
      const result = validatePassword('PASSWORD1');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('lowercase');
    });

    it('should return invalid for missing digit', () => {
      const result = validatePassword('Password');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('digit');
    });
  });

  describe('isValidURL', () => {
    it('should return true for valid URLs', () => {
      expect(isValidURL('https://example.com')).toBe(true);
      expect(isValidURL('http://localhost:3000')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidURL('not-a-url')).toBe(false);
      expect(isValidURL('')).toBe(false);
    });
  });
});
