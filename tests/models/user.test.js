const mongoose = require('mongoose');
const User = require('../../models/User');

describe('User Model', () => {
  describe('Schema Validation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        name: 'John Doe',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '9876543210',
        password: 'password123',
      };
      const user = await User.create(userData);
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.role).toBe('staff');
      expect(user.isActive).toBe(true);
    });

    it('should fail without required fields', async () => {
      await expect(User.create({})).rejects.toThrow();
    });

    it('should fail with invalid email', async () => {
      const userData = {
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'invalid-email',
        phone: '123',
        password: 'password123',
      };
      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should fail with invalid role', async () => {
      const userData = {
        name: 'John',
        initials: 'JD',
        role: 'invalid',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      };
      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should fail with short password', async () => {
      const userData = {
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: '123',
      };
      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should fail with initials longer than 2 characters', async () => {
      const userData = {
        name: 'John',
        initials: 'JDO',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      };
      await expect(User.create(userData)).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password on save', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      expect(user.password).not.toBe('password123');
      expect(user.password.length).toBeGreaterThan(0);
    });

    it('should not rehash password if not modified', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      const hashedPassword = user.password;
      user.name = 'Jane';
      await user.save();
      expect(user.password).toBe(hashedPassword);
    });
  });

  describe('JWT Token', () => {
    it('should generate valid JWT token', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      const token = user.getSignedJwtToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('Password Matching', () => {
    it('should return true for correct password', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      const isMatch = await user.matchPassword('password123');
      expect(isMatch).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      const isMatch = await user.matchPassword('wrongpassword');
      expect(isMatch).toBe(false);
    });
  });

  describe('Reset Password Token', () => {
    it('should generate reset password token', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      const resetToken = user.getResetPasswordToken();
      expect(resetToken).toBeDefined();
      expect(typeof resetToken).toBe('string');
      expect(user.resetPasswordToken).toBeDefined();
      expect(user.resetPasswordExpire).toBeDefined();
      expect(user.resetPasswordExpire).toBeInstanceOf(Date);
    });
  });

  describe('Employee ID Generation', () => {
    it('should auto-generate employeeId with EMP prefix for staff', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      expect(user.employeeId).toBeDefined();
      expect(user.employeeId).toMatch(/^EMP\d{3,}$/);
    });

    it('should auto-generate employeeId with CP prefix for partner', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'partner',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      expect(user.employeeId).toBeDefined();
      expect(user.employeeId).toMatch(/^CP\d{3,}$/);
    });

    it('should generate unique employeeIds for multiple users', async () => {
      const user1 = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john1@example.com',
        phone: '123',
        password: 'password123',
      });
      const user2 = await User.create({
        name: 'Jane',
        initials: 'JA',
        role: 'staff',
        email: 'john2@example.com',
        phone: '456',
        password: 'password123',
      });
      expect(user1.employeeId).not.toBe(user2.employeeId);
    });
  });

  describe('JSON Serialization', () => {
    it('should not include password in JSON when fetched via query', async () => {
      await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      // Re-fetch via query to trigger select:false exclusion
      const user = await User.findOne({ email: 'john@example.com' });
      const json = user.toJSON();
      expect(json.password).toBeUndefined();
    });

    it('should include id instead of _id', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@example.com',
        phone: '123',
        password: 'password123',
      });
      const json = user.toJSON();
      expect(json.id).toBeDefined();
      expect(json._id).toBeUndefined();
    });
  });
});
