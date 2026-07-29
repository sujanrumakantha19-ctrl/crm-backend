const path = require('path');
const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config({ path: path.join(__dirname, 'config', 'config.env') });

// Set Google/Cloudflare DNS for Atlas resolution if needed
dns.setServers(['8.8.8.8', '1.1.1.1']);

const User = require('./models/User');
const Lead = require('./models/Lead');
const Task = require('./models/Task');
const ActivityLog = require('./models/ActivityLog');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const Group = require('./models/Group');
const ChannelPartner = require('./models/ChannelPartner');
const Project = require('./models/Project');
const Plot = require('./models/Plot');
const Counter = require('./models/Counter');
const WhatsAppMessage = require('./models/WhatsAppMessage');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Sudexhub:Sudexhub2026@cluster0.ivs0qfk.mongodb.net/CRM';
const KEEP_EMAILS = ['admin@gmail.com', 'staff@gmail.com', 'cp@gmail.com'];
const DEFAULT_PASSWORD = '12345678';

async function runTruncate() {
  console.log(`Connecting to MongoDB at ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}...`);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully!');

  // Step 1: Ensure default 3 users exist
  const defaultUsersData = [
    {
      name: 'Admin User',
      initials: 'AU',
      role: 'admin',
      designation: 'System Administrator',
      email: 'admin@gmail.com',
      phone: '+91 98765 43210',
      avatarBg: 'bg-blue-500',
      isActive: true,
      password: DEFAULT_PASSWORD,
    },
    {
      name: 'Staff User',
      initials: 'SU',
      role: 'staff',
      designation: 'Sales Executive',
      email: 'staff@gmail.com',
      phone: '+91 98765 43211',
      avatarBg: 'bg-emerald-500',
      isActive: true,
      password: DEFAULT_PASSWORD,
    },
    {
      name: 'Channel Partner',
      initials: 'CP',
      role: 'partner',
      designation: 'Channel Partner',
      email: 'cp@gmail.com',
      phone: '+91 98765 43212',
      avatarBg: 'bg-purple-500',
      isActive: true,
      password: DEFAULT_PASSWORD,
    },
  ];

  const keepIds = [];

  for (const uData of defaultUsersData) {
    let user = await User.findOne({ email: uData.email });
    if (!user) {
      console.log(`User ${uData.email} not found. Creating default account...`);
      user = await User.create(uData);
      console.log(`Created ${uData.email} (role: ${uData.role})`);
    } else {
      console.log(`Found existing user: ${user.email} (role: ${user.role}, ID: ${user._id})`);
      user.groupId = null;
      await user.save();
    }
    keepIds.push(user._id);
  }

  // Step 2: Delete all other users
  const deleteUsersResult = await User.deleteMany({ _id: { $nin: keepIds } });
  console.log(`Deleted ${deleteUsersResult.deletedCount} non-default users.`);

  // Step 3: Truncate all business collections
  console.log('Truncating all other data collections...');
  await Promise.all([
    Lead.deleteMany({}),
    Task.deleteMany({}),
    ActivityLog.deleteMany({}),
    Attendance.deleteMany({}),
    Notification.deleteMany({}),
    Group.deleteMany({}),
    ChannelPartner.deleteMany({}),
    Project.deleteMany({}),
    Plot.deleteMany({}),
    Counter.deleteMany({}),
    WhatsAppMessage.deleteMany({}),
  ]);

  // Step 4: Sweep any additional collections in DB
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    if (col.name !== 'users' && !col.name.startsWith('system.')) {
      await db.collection(col.name).deleteMany({});
      console.log(`Cleared collection: ${col.name}`);
    }
  }

  // Step 5: Verify final state
  console.log('\n--- Final Verification Summary ---');
  const remainingUsers = await User.find({}, 'name email role employeeId');
  console.log('Kept Users (Count:', remainingUsers.length, '):');
  remainingUsers.forEach(u => console.log(`  - ${u.email} | Role: ${u.role} | Name: ${u.name}`));

  const allCols = await db.listCollections().toArray();
  for (const col of allCols) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`Collection [${col.name}]: ${count} documents`);
  }

  await mongoose.disconnect();
  console.log('Finished truncation successfully!');
}

runTruncate().catch(async err => {
  console.error('Error during database truncation:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
