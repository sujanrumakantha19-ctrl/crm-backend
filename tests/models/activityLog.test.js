const mongoose = require('mongoose');
const ActivityLog = require('../../models/ActivityLog');

describe('ActivityLog Model', () => {
  describe('Schema Validation', () => {
    it('should create an activity log with valid data', async () => {
      const log = await ActivityLog.create({
        actorId: new mongoose.Types.ObjectId(),
        actorName: 'John Doe',
        actorRole: 'admin',
        action: 'Created project',
        actionType: 'Created',
        entityType: 'Project',
        entityId: new mongoose.Types.ObjectId(),
        entityName: 'Test Project',
        timestamp: new Date().toISOString(),
      });
      expect(log.action).toBe('Created project');
      expect(log.actionType).toBe('Created');
    });

    it('should fail without required fields', async () => {
      await expect(ActivityLog.create({})).rejects.toThrow();
    });

    it('should accept valid actionType enum', async () => {
      const log = await ActivityLog.create({
        actorId: new mongoose.Types.ObjectId(),
        actorName: 'John',
        actorRole: 'admin',
        action: 'Updated',
        actionType: 'Updated',
        entityType: 'Lead',
        entityId: new mongoose.Types.ObjectId(),
        entityName: 'Test Lead',
        timestamp: new Date().toISOString(),
      });
      expect(log.actionType).toBe('Updated');
    });

    it('should reject invalid actionType', async () => {
      await expect(ActivityLog.create({
        actorId: new mongoose.Types.ObjectId(),
        actorName: 'John',
        actorRole: 'admin',
        action: 'Test',
        actionType: 'Invalid',
        entityType: 'Lead',
        entityId: new mongoose.Types.ObjectId(),
        entityName: 'Test',
        timestamp: new Date().toISOString(),
      })).rejects.toThrow();
    });
  });
});
