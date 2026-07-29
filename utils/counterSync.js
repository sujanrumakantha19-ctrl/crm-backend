const mongoose = require('mongoose');

/**
 * Utility function to ensure all models (Project, Lead, ChannelPartner, User)
 * have unique displayIds and that Counter sequences are higher than all existing IDs.
 */
async function syncAllCounters() {
  try {
    const Counter = mongoose.model('Counter');

    // 1. Sync Projects
    const Project = mongoose.model('Project');
    const projects = await Project.find({ displayId: { $regex: /^PROJ-\d+$/ } });
    let maxProj = 0;
    for (const p of projects) {
      if (p.displayId) {
        const num = parseInt(p.displayId.replace('PROJ-', ''), 10);
        if (!isNaN(num) && num > maxProj) maxProj = num;
      }
    }

    const missingProj = await Project.find({
      $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }]
    });
    for (const p of missingProj) {
      maxProj++;
      p.displayId = `PROJ-${maxProj}`;
      await p.save();
    }

    if (maxProj > 0) {
      await Counter.findOneAndUpdate(
        { name: 'displayId_PROJ' },
        { $max: { seq: maxProj } },
        { upsert: true }
      );
    }

    // 2. Sync Leads
    const Lead = mongoose.model('Lead');
    const leads = await Lead.find({ displayId: { $regex: /^L-\d+$/ } });
    let maxLead = 0;
    for (const l of leads) {
      if (l.displayId) {
        const num = parseInt(l.displayId.replace('L-', ''), 10);
        if (!isNaN(num) && num > maxLead) maxLead = num;
      }
    }

    const missingLeads = await Lead.find({
      $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }]
    });
    for (const l of missingLeads) {
      maxLead++;
      l.displayId = `L-${maxLead}`;
      await l.save();
    }

    if (maxLead > 0) {
      await Counter.findOneAndUpdate(
        { name: 'displayId_L' },
        { $max: { seq: maxLead } },
        { upsert: true }
      );
    }

    // 3. Sync ChannelPartners
    const ChannelPartner = mongoose.model('ChannelPartner');
    const partners = await ChannelPartner.find({ displayId: { $regex: /^CP-\d+$/ } });
    let maxCp = 0;
    for (const cp of partners) {
      if (cp.displayId) {
        const num = parseInt(cp.displayId.replace('CP-', ''), 10);
        if (!isNaN(num) && num > maxCp) maxCp = num;
      }
    }

    const missingCp = await ChannelPartner.find({
      $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }]
    });
    for (const cp of missingCp) {
      maxCp++;
      cp.displayId = `CP-${maxCp}`;
      await cp.save();
    }

    if (maxCp > 0) {
      await Counter.findOneAndUpdate(
        { name: 'displayId_CP' },
        { $max: { seq: maxCp } },
        { upsert: true }
      );
    }

    // 4. Sync Users (Admin & Staff)
    const User = mongoose.model('User');
    
    // Admin users
    const adminUsers = await User.find({ displayId: { $regex: /^AD-\d+$/ } });
    let maxAdmin = 0;
    for (const u of adminUsers) {
      if (u.displayId) {
        const num = parseInt(u.displayId.replace('AD-', ''), 10);
        if (!isNaN(num) && num > maxAdmin) maxAdmin = num;
      }
    }
    const missingAdmin = await User.find({
      role: 'admin',
      $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }]
    });
    for (const u of missingAdmin) {
      maxAdmin++;
      u.displayId = `AD-${maxAdmin}`;
      await u.save();
    }
    if (maxAdmin > 0) {
      await Counter.findOneAndUpdate(
        { name: 'displayId_AD' },
        { $max: { seq: maxAdmin } },
        { upsert: true }
      );
    }

    // Staff users
    const staffUsers = await User.find({ displayId: { $regex: /^STAFF-\d+$/ } });
    let maxStaff = 0;
    for (const u of staffUsers) {
      if (u.displayId) {
        const num = parseInt(u.displayId.replace('STAFF-', ''), 10);
        if (!isNaN(num) && num > maxStaff) maxStaff = num;
      }
    }
    const missingStaff = await User.find({
      role: 'staff',
      $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }]
    });
    for (const u of missingStaff) {
      maxStaff++;
      u.displayId = `STAFF-${maxStaff}`;
      await u.save();
    }
    if (maxStaff > 0) {
      await Counter.findOneAndUpdate(
        { name: 'displayId_STAFF' },
        { $max: { seq: maxStaff } },
        { upsert: true }
      );
    }

  } catch (err) {
    const logger = require('./logger');
    logger.error('Error syncing counters:', err);
  }
}

module.exports = { syncAllCounters };
