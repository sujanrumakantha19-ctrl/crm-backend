const mongoose = require('mongoose');
const Notification = require('../../models/Notification');

describe('Notification Model', () => {
  describe('Schema Validation', () => {
    it('should create a notification with valid data', async () => {
      const notification = await Notification.create({
        type: 'new_lead',
        message: 'New lead assigned',
        userId: new mongoose.Types.ObjectId(),
      });
      expect(notification.type).toBe('new_lead');
      expect(notification.message).toBe('New lead assigned');
      expect(notification.isRead).toBe(false);
    });

    it('should fail without type', async () => {
      await expect(Notification.create({ message: 'Test' })).rejects.toThrow();
    });

    it('should fail without message', async () => {
      await expect(Notification.create({ type: 'new_lead' })).rejects.toThrow();
    });

    it('should accept valid type enum', async () => {
      const notification = await Notification.create({
        type: 'birthday',
        message: 'Test',
        userId: new mongoose.Types.ObjectId(),
      });
      expect(notification.type).toBe('birthday');
    });

    it('should reject invalid type', async () => {
      await expect(Notification.create({
        type: 'invalid',
        message: 'Test',
      })).rejects.toThrow();
    });

    it('should default isRead to false', async () => {
      const notification = await Notification.create({
        type: 'new_lead',
        message: 'Test',
        userId: new mongoose.Types.ObjectId(),
      });
      expect(notification.isRead).toBe(false);
    });
  });
});
