const mongoose = require('mongoose');

// Load the global Mongoose plugin from db.js (maps _id→id, removes __v)
require('../config/db');

beforeAll(async () => {
  // Connect to the in-memory MongoDB
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not set — globalSetup.js may not have run');
  }
  await mongoose.connect(process.env.MONGODB_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
});

afterEach(async () => {
  // Clean up all collections after each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});
