const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { protect, authorize } = require('../../middleware/auth');

// Mock Express req/res/next
const mockReq = (headers = {}) => ({
  headers,
  user: null,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auth Middleware', () => {
  describe('protect', () => {
    it('should set req.user for valid token', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@test.com',
        phone: '123',
        password: 'password123',
      });
      const token = user.getSignedJwtToken();
      const req = mockReq({ authorization: `Bearer ${token}` });
      const res = mockRes();

      await protect(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(user._id.toString());
    });

    it('should return 401 without token', async () => {
      const req = mockReq({});
      const res = mockRes();

      await protect(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
      }));
    });

    it('should return 401 with invalid token', async () => {
      const req = mockReq({ authorization: 'Bearer invalidtoken' });
      const res = mockRes();

      await protect(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
      }));
    });

    it('should return 401 with expired token', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@test.com',
        phone: '123',
        password: 'password123',
      });
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '0s' });
      const req = mockReq({ authorization: `Bearer ${token}` });
      const res = mockRes();

      // Wait a moment for token to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      await protect(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
      }));
    });

    it('should return 401 for inactive user', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@test.com',
        phone: '123',
        password: 'password123',
        isActive: false,
      });
      const token = user.getSignedJwtToken();
      const req = mockReq({ authorization: `Bearer ${token}` });
      const res = mockRes();

      await protect(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
      }));
    });
  });

  describe('authorize', () => {
    it('should allow access for correct role', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'admin',
        email: 'john@test.com',
        phone: '123',
        password: 'password123',
      });
      const req = mockReq({});
      req.user = user;
      const res = mockRes();
      const middleware = authorize('admin');

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for wrong role', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@test.com',
        phone: '123',
        password: 'password123',
      });
      const req = mockReq({});
      req.user = user;
      const res = mockRes();
      const middleware = authorize('admin');

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 403,
      }));
    });

    it('should allow access for multiple roles', async () => {
      const user = await User.create({
        name: 'John',
        initials: 'JD',
        role: 'staff',
        email: 'john@test.com',
        phone: '123',
        password: 'password123',
      });
      const req = mockReq({});
      req.user = user;
      const res = mockRes();
      const middleware = authorize('admin', 'staff');

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
