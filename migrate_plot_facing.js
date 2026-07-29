const path = require('path');
const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config({ path: path.join(__dirname, 'config', 'config.env') });

dns.setServers(['8.8.8.8', '1.1.1.1']);

const Plot = require('./models/Plot');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await Plot.updateMany(
    { $or: [{ facing: { $exists: false } }, { facing: null }, { facing: '' }] },
    { $set: { facing: 'East' } }
  );

  console.log(`Migration complete: ${result.modifiedCount} plots updated with facing = 'East'`);
  await mongoose.disconnect();
};

run().catch(err => { console.error(err); process.exit(1); });
