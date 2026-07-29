const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, 'config', 'config.env') });

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

const KEEP_EMAILS = ['admin@gmail.com', 'staff@gmail.com', 'cp@gmail.com'];
const execute = process.argv.includes('--execute');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const allUsers = await User.find().select('_id email groupId role');
  const keepUsers = allUsers.filter(user => KEEP_EMAILS.includes(user.email));
  const keepIds = keepUsers.map(user => user._id);

  if (keepUsers.length !== KEEP_EMAILS.length) {
    throw new Error(`Expected to find exactly ${KEEP_EMAILS.length} users, found ${keepUsers.length}. Aborting.`);
  }

  const countsBefore = {
    users: await User.countDocuments(),
    leads: await Lead.countDocuments(),
    tasks: await Task.countDocuments(),
    activityLogs: await ActivityLog.countDocuments(),
    attendance: await Attendance.countDocuments(),
    notifications: await Notification.countDocuments(),
    groups: await Group.countDocuments(),
    channelPartners: await ChannelPartner.countDocuments(),
    projects: await Project.countDocuments(),
    plots: await Plot.countDocuments(),
  };

  console.log('Keeping users:');
  console.log(JSON.stringify(keepUsers.map(u => ({ id: String(u._id), email: u.email, role: u.role })), null, 2));
  console.log('Counts before:');
  console.log(JSON.stringify(countsBefore, null, 2));

  if (!execute) {
    console.log('Dry run only. Re-run with --execute to apply the full sweep.');
    await mongoose.disconnect();
    return;
  }

  await Promise.all([
    User.deleteMany({ _id: { $nin: keepIds } }),
    Lead.deleteMany({}),
    Task.deleteMany({}),
    ActivityLog.deleteMany({}),
    Attendance.deleteMany({}),
    Notification.deleteMany({}),
    Group.deleteMany({}),
    ChannelPartner.deleteMany({}),
    Project.deleteMany({}),
    Plot.deleteMany({}),
  ]);

  await Promise.all(
    keepIds.map(userId =>
      User.updateOne({ _id: userId }, { $set: { groupId: null } })
    )
  );

  const countsAfter = {
    users: await User.countDocuments(),
    leads: await Lead.countDocuments(),
    tasks: await Task.countDocuments(),
    activityLogs: await ActivityLog.countDocuments(),
    attendance: await Attendance.countDocuments(),
    notifications: await Notification.countDocuments(),
    groups: await Group.countDocuments(),
    channelPartners: await ChannelPartner.countDocuments(),
    projects: await Project.countDocuments(),
    plots: await Plot.countDocuments(),
  };

  console.log('Counts after:');
  console.log(JSON.stringify(countsAfter, null, 2));
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
