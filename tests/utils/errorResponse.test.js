const ErrorResponse = require('../../utils/errorResponse');

describe('ErrorResponse', () => {
  it('should create an error with message and statusCode', () => {
    const error = new ErrorResponse('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
  });

  it('should extend Error', () => {
    const error = new ErrorResponse('Test', 400);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have a stack trace', () => {
    const error = new ErrorResponse('Test', 500);
    expect(error.stack).toBeDefined();
  });
});
