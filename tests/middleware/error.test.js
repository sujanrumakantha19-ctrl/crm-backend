const errorHandler = require('../../middleware/error');
const ErrorResponse = require('../../utils/errorResponse');

// Mock Express req/res/next
const mockReq = () => ({});
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

describe('Error Handler Middleware', () => {
  it('should handle CastError (invalid ObjectId) with 404', () => {
    const err = new Error('CastError');
    err.name = 'CastError';
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Resource not found',
    });
  });

  it('should handle duplicate key error (11000) with 400', () => {
    const err = new Error('Duplicate key');
    err.code = 11000;
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Duplicate field value entered',
    });
  });

  it('should handle ValidationError with 400', () => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.errors = {
      name: { message: 'Name is required' },
      email: { message: 'Invalid email' },
    };
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Name is required'),
    });
  });

  it('should handle JsonWebTokenError with 401', () => {
    const err = new Error('jwt malformed');
    err.name = 'JsonWebTokenError';
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid token',
    });
  });

  it('should handle TokenExpiredError with 401', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token expired',
    });
  });

  it('should handle MulterError with 400', () => {
    const err = new Error('File too large');
    err.name = 'MulterError';
    err.code = 'LIMIT_FILE_SIZE';
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'File too large',
    });
  });

  it('should handle generic error with 500', () => {
    const err = new Error('Something went wrong');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Something went wrong',
    });
  });

  it('should handle ErrorResponse with custom status code', () => {
    const err = new ErrorResponse('Not found', 404);
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Not found',
    });
  });
});
