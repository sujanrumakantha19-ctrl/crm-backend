const mongoose = require('mongoose');
const Notification = require('../../models/Notification');
const User = require('../../models/User');

describe('Notification Model Coverage', () => {
  let testUser;

  beforeEach(async () => {
    testUser = await User.create({
      name: 'Test User', initials: 'TU', role: 'staff',
      email: `notif${Date.now()}@test.com`, phone: '123', password: 'pass123',
    });
  });

  describe('getTitleForType helper (exported)', () => {
    it('should return correct title for birthday', () => {
      expect(Notification.getTitleForType('birthday')).toBe('🎂 Birthday Alert!');
    });

    it('should return correct title for lead_status', () => {
      expect(Notification.getTitleForType('lead_status')).toBe('📋 Lead Status Updated');
    });

    it('should return correct title for new_lead', () => {
      expect(Notification.getTitleForType('new_lead')).toBe('🆕 New Lead Assigned');
    });

    it('should return correct title for task_assigned', () => {
      expect(Notification.getTitleForType('task_assigned')).toBe('📝 New Task Assigned');
    });

    it('should return correct title for attendance', () => {
      expect(Notification.getTitleForType('attendance')).toBe('⏰ Attendance Update');
    });

    it('should return correct title for booking', () => {
      expect(Notification.getTitleForType('booking')).toBe('🏡 Plot Booking Request');
    });

    it('should return default title for unknown type', () => {
      expect(Notification.getTitleForType('unknown')).toBe('🔔 New Notification');
    });

    it('should return default title for empty string', () => {
      expect(Notification.getTitleForType('')).toBe('🔔 New Notification');
    });
  });

  describe('Schema defaults', () => {
    it('should default isRead to false', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Test', userId: testUser._id,
      });
      expect(notif.isRead).toBe(false);
    });

    it('should default isToday to false', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Test', userId: testUser._id,
      });
      expect(notif.isToday).toBe(false);
    });

    it('should allow setting isRead and isToday', async () => {
      const notif = await Notification.create({
        type: 'booking', message: 'Test', userId: testUser._id,
        isRead: true, isToday: true,
      });
      expect(notif.isRead).toBe(true);
      expect(notif.isToday).toBe(true);
    });

    it('should have timestamps', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Timestamps', userId: testUser._id,
      });
      expect(notif.createdAt).toBeInstanceOf(Date);
      expect(notif.updatedAt).toBeInstanceOf(Date);
    });

    it('should store optional fields', async () => {
      const notif = await Notification.create({
        type: 'task_assigned', message: 'Task', userId: testUser._id,
        actorName: 'Admin', entityId: '123', entityType: 'Task', timeAgo: '1m',
      });
      expect(notif.actorName).toBe('Admin');
      expect(notif.entityId).toBe('123');
      expect(notif.entityType).toBe('Task');
      expect(notif.timeAgo).toBe('1m');
    });

    it('should allow null userId', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Null', userId: null,
      });
      expect(notif.userId).toBeNull();
    });
  });

  describe('Required field validation', () => {
    it('should fail without type', async () => {
      await expect(
        Notification.create({ message: 'No type', userId: testUser._id })
      ).rejects.toThrow();
    });

    it('should fail without message', async () => {
      await expect(
        Notification.create({ type: 'new_lead', userId: testUser._id })
      ).rejects.toThrow();
    });

    it('should fail with invalid type', async () => {
      await expect(
        Notification.create({ type: 'invalid', message: 'Bad', userId: testUser._id })
      ).rejects.toThrow();
    });

    it('should accept all valid types', async () => {
      const types = ['birthday', 'lead_status', 'new_lead', 'task_assigned', 'attendance', 'booking'];
      for (const type of types) {
        const notif = await Notification.create({
          type, message: `Test ${type}`, userId: testUser._id,
        });
        expect(notif.type).toBe(type);
      }
    });
  });

  describe('Post-save hook behavior', () => {
    it('should create notification successfully (post-save hook would fire)', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Hook test', userId: testUser._id,
      });
      expect(notif._id).toBeDefined();
      expect(notif.type).toBe('new_lead');
      expect(notif.message).toBe('Hook test');
    });

    it('should mark notification as read without errors', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Update test', userId: testUser._id,
      });
      notif.isRead = true;
      await notif.save();
      const updated = await Notification.findById(notif._id);
      expect(updated.isRead).toBe(true);
    });
  });

  describe('Update operations', () => {
    it('should allow updating isRead', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Update', userId: testUser._id,
      });
      notif.isRead = true;
      await notif.save();
      const updated = await Notification.findById(notif._id);
      expect(updated.isRead).toBe(true);
    });

    it('should update updatedAt on save', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Time', userId: testUser._id,
      });
      const originalUpdatedAt = notif.updatedAt;
      await new Promise(r => setTimeout(r, 50));
      notif.isRead = true;
      await notif.save();
      expect(notif.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Delete operations', () => {
    it('should delete a notification', async () => {
      const notif = await Notification.create({
        type: 'new_lead', message: 'Delete', userId: testUser._id,
      });
      await notif.deleteOne();
      expect(await Notification.findById(notif._id)).toBeNull();
    });

    it('should deleteMany notifications', async () => {
      await Notification.create([
        { type: 'new_lead', message: 'D1', userId: testUser._id },
        { type: 'new_lead', message: 'D2', userId: testUser._id },
      ]);
      await Notification.deleteMany({ userId: testUser._id });
      expect(await Notification.countDocuments({ userId: testUser._id })).toBe(0);
    });
  });

  describe('Query operations', () => {
    it('should find by type', async () => {
      await Notification.create([
        { type: 'new_lead', message: 'NL', userId: testUser._id },
        { type: 'booking', message: 'BK', userId: testUser._id },
      ]);
      const leads = await Notification.find({ type: 'new_lead' });
      expect(leads.length).toBe(1);
    });

    it('should find by isRead status', async () => {
      await Notification.create([
        { type: 'new_lead', message: 'Unread', userId: testUser._id, isRead: false },
        { type: 'new_lead', message: 'Read', userId: testUser._id, isRead: true },
      ]);
      const unread = await Notification.find({ isRead: false });
      expect(unread.length).toBe(1);
    });

    it('should sort by createdAt descending', async () => {
      await Notification.create({ type: 'new_lead', message: 'First', userId: testUser._id });
      await new Promise(r => setTimeout(r, 10));
      await Notification.create({ type: 'new_lead', message: 'Second', userId: testUser._id });
      const sorted = await Notification.find({ userId: testUser._id }).sort('-createdAt');
      expect(sorted[0].message).toBe('Second');
    });

    it('should support pagination', async () => {
      const notifs = [];
      for (let i = 0; i < 10; i++) {
        notifs.push({ type: 'new_lead', message: `N${i}`, userId: testUser._id });
      }
      await Notification.create(notifs);
      const page = await Notification.find({ userId: testUser._id }).skip(0).limit(5);
      expect(page.length).toBe(5);
    });
  });

  describe('Schema indexes', () => {
    it('should have userId and isRead index', async () => {
      const indexes = await Notification.collection.getIndexes();
      const indexNames = Object.keys(indexes);
      expect(indexNames.some(n => n.includes('userId') && n.includes('isRead'))).toBe(true);
    });

    it('should have type index', async () => {
      const indexes = await Notification.collection.getIndexes();
      const indexNames = Object.keys(indexes);
      expect(indexNames.some(n => n.includes('type'))).toBe(true);
    });
  });
});
