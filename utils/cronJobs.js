const cron = require('node-cron');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Notification = require('../models/Notification');
const logger = require('./logger');

/**
 * Format Date as YYYY-MM-DD
 */
function formatDateYYYYMMDD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format Date as MM-DD for birthday comparisons
 */
function formatDateMMDD(d) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/**
 * Extract MM-DD from date value (handles Date object, YYYY-MM-DD, MM-DD, ISO strings, or Timestamps)
 */
function extractMMDD(dateVal) {
  if (!dateVal) return '';

  // If it's a Date object
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  }

  // If it's a string
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return '';

    // Clean ISO time component if present
    const cleanStr = trimmed.split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      return `${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts.length === 2) {
      return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  // Fallback: parse with Date constructor
  try {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${month}-${day}`;
    }
  } catch {
    return '';
  }

  return '';
}

/**
 * Check and send daily follow-up reminders scheduled for today
 */
async function checkDailyFollowUps() {
  const todayStr = formatDateYYYYMMDD(new Date());
  logger.info(`[CRON] Running daily follow-up checks for ${todayStr}...`);

  try {
    // Query leads where nextFollowUpDate is today OR latest follow-up nextFollowUpDate is today
    const leads = await Lead.find({
      $or: [
        { nextFollowUpDate: todayStr },
        { 'followUps.nextFollowUpDate': todayStr },
      ],
    });

    let count = 0;
    for (const lead of leads) {
      if (lead.assignedTo) {
        // Prevent duplicate notification on the same day
        const existing = await Notification.findOne({
          userId: lead.assignedTo,
          type: { $in: ['lead_status', 'Lead', 'followup', 'lead'] },
          message: { $regex: lead.customerName },
          createdAt: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        });

        if (!existing) {
          await Notification.create({
            userId: lead.assignedTo,
            title: 'Scheduled Follow-up Today 📅',
            message: `Reminder: You have a scheduled follow-up today with ${lead.customerName} (${lead.phone}).`,
            type: 'lead_status',
            link: `/staff/leads/${lead._id}`,
            isRead: false,
          });
          count++;
        }
      }
    }

    logger.info(`[CRON] Sent ${count} follow-up notifications for today.`);
  } catch (err) {
    logger.error(`[CRON] Follow-up check failed: ${err.message}`);
  }
}

/**
 * Check 1-Day Prior Birthday Alerts (Runs @ 5:00 PM Daily)
 * Notifies Admin of tomorrow's Staff & Qualified/Customer Lead birthdays
 */
async function checkTomorrowBirthdays() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowMMDD = formatDateMMDD(tomorrow);
  const tomorrowFormatted = tomorrow.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  logger.info(`[CRON] Running 1-day prior birthday checks for ${tomorrowMMDD}...`);

  try {
    const admins = await User.find({ role: 'admin', isActive: true });
    if (!admins.length) return;

    // 1. Staff Birthdays Tomorrow
    const allStaff = await User.find({ role: 'staff', isActive: true });
    const tomorrowStaff = allStaff.filter(s => extractMMDD(s.dob) === tomorrowMMDD);

    for (const staff of tomorrowStaff) {
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          title: 'Upcoming Staff Birthday Tomorrow 🎂',
          message: `Tomorrow (${tomorrowFormatted}) is Staff member ${staff.name}'s birthday!`,
          type: 'birthday',
          isRead: false,
        });
      }
    }

    // 2. Qualified / Customer Lead Birthdays Tomorrow
    const qualifiedLeads = await Lead.find({ status: { $in: ['Qualified', 'Customer'] } });
    const tomorrowLeads = qualifiedLeads.filter(l => extractMMDD(l.dob) === tomorrowMMDD);

    for (const lead of tomorrowLeads) {
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          title: 'Upcoming Customer Birthday Tomorrow 🎁',
          message: `Tomorrow (${tomorrowFormatted}) is customer/lead ${lead.customerName}'s birthday (Assigned to: ${lead.assignedToName || 'Staff'}).`,
          type: 'birthday',
          link: `/admin/leads/${lead._id}`,
          isRead: false,
        });
      }
    }

    logger.info(`[CRON] Sent 1-day prior birthday alerts for ${tomorrowStaff.length} staff and ${tomorrowLeads.length} leads.`);
  } catch (err) {
    logger.error(`[CRON] Prior birthday check failed: ${err.message}`);
  }
}

/**
 * Check Today's Birthday Alerts (Runs @ 7:00 AM Daily)
 * Notifies Admin & Staff on the actual birthday
 */
async function checkTodayBirthdays() {
  const todayMMDD = formatDateMMDD(new Date());
  logger.info(`[CRON] Running today's birthday checks for ${todayMMDD}...`);

  try {
    const admins = await User.find({ role: 'admin', isActive: true });

    // 1. Staff Birthdays Today -> Notify Admin & Active Staff
    const allStaff = await User.find({ role: 'staff', isActive: true });
    const todayStaff = allStaff.filter(s => extractMMDD(s.dob) === todayMMDD);

    for (const staff of todayStaff) {
      // Notify Admin
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          title: `Happy Birthday ${staff.name}! 🎉`,
          message: `Today is Staff member ${staff.name}'s birthday! Wish them a wonderful day.`,
          type: 'birthday',
          isRead: false,
        });
      }
      // Notify staff member themselves
      await Notification.create({
        userId: staff._id,
        title: `Happy Birthday ${staff.name}! 🎂🎉`,
        message: `Wishing you a very Happy Birthday from Samy & Co Land Promoters!`,
        type: 'birthday',
        isRead: false,
      });
    }

    // 2. Qualified / Customer Lead Birthdays Today -> Notify assigned staff & Admin
    const qualifiedLeads = await Lead.find({ status: { $in: ['Qualified', 'Customer'] } });
    const todayLeads = qualifiedLeads.filter(l => extractMMDD(l.dob) === todayMMDD);

    for (const lead of todayLeads) {
      // Notify assigned staff
      if (lead.assignedTo) {
        await Notification.create({
          userId: lead.assignedTo,
          title: `Customer Birthday Today! 🎂`,
          message: `Today is ${lead.customerName}'s birthday! Remember to wish your customer a happy birthday.`,
          type: 'birthday',
          link: `/staff/leads/${lead._id}`,
          isRead: false,
        });
      }
      // Notify Admin
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          title: `Customer Birthday Today! 🎈`,
          message: `Today is customer ${lead.customerName}'s birthday (Assigned to: ${lead.assignedToName || 'Staff'}).`,
          type: 'birthday',
          link: `/admin/leads/${lead._id}`,
          isRead: false,
        });
      }
    }

    logger.info(`[CRON] Today birthday checks complete: ${todayStaff.length} staff, ${todayLeads.length} leads.`);
  } catch (err) {
    logger.error(`[CRON] Today birthday check failed: ${err.message}`);
  }
}

/**
 * Initialize all Cron Jobs
 */
function startCronJobs() {
  logger.info('[CRON] Initializing scheduled cron jobs...');

  // 1. Daily 7:00 AM Cron -> Follow-up Reminders & Today Birthday Alerts
  cron.schedule('0 7 * * *', async () => {
    logger.info('[CRON 7:00 AM] Triggering daily morning tasks...');
    await checkDailyFollowUps();
    await checkTodayBirthdays();
  });

  // 2. Daily 5:00 PM Cron -> 1-Day Prior Birthday Alerts
  cron.schedule('0 17 * * *', async () => {
    logger.info('[CRON 5:00 PM] Triggering 1-day prior birthday alerts...');
    await checkTomorrowBirthdays();
  });

  // Run initial checks on startup
  setTimeout(() => {
    checkDailyFollowUps();
    checkTodayBirthdays();
    checkTomorrowBirthdays();
  }, 10000);
}

module.exports = {
  startCronJobs,
  checkDailyFollowUps,
  checkTomorrowBirthdays,
  checkTodayBirthdays,
};
