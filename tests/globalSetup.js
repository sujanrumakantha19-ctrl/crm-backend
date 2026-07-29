const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  const mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
  process.env.JWT_EXPIRES_IN = '1h';
  // Store the server instance for teardown
  global.__MONGO_SERVER__ = mongoServer;
};
