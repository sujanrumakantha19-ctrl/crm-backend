const request = require('supertest');
const { buildTestApp, createAdminUser } = require('../helpers');
const ActivityLog = require('../../models/ActivityLog');

const app = buildTestApp();

describe('Activity Log Controller Coverage', () => {
  describe('GET /api/v1/activity-logs/:id', () => {
    it('should get a single activity log', async () => {
      const admin = await createAdminUser();
      const log = await ActivityLog.create({
        actorId: admin.user._id, actorName: 'Admin', actorRole: 'admin',
        action: 'Created', actionType: 'Created', entityType: 'Lead',
        entityId: admin.user._id.toString(), entityName: 'L1',
        timestamp: new Date().toISOString(),
      });
      const res = await request(app)
        .get(`/api/v1/activity-logs/${log._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.action).toBe('Created');
    });

    it('should return 404 for non-existent log', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/activity-logs/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/activity-logs/:id', () => {
    it('should delete a log', async () => {
      const admin = await createAdminUser();
      const log = await ActivityLog.create({
        actorId: admin.user._id, actorName: 'Admin', actorRole: 'admin',
        action: 'Delete', actionType: 'Deleted', entityType: 'Task',
        entityId: admin.user._id.toString(), entityName: 'T1',
        timestamp: new Date().toISOString(),
      });
      const res = await request(app)
        .delete(`/api/v1/activity-logs/${log._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(await ActivityLog.findById(log._id)).toBeNull();
    });

    it('should return 404 for non-existent log', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/v1/activity-logs/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/activity-logs/action/:actionType', () => {
    it('should filter by action type', async () => {
      const admin = await createAdminUser();
      await ActivityLog.create([
        { actorId: admin.user._id, actorName: 'A', actorRole: 'admin', action: 'C', actionType: 'Created', entityType: 'Lead', entityId: admin.user._id.toString(), entityName: 'L1', timestamp: new Date().toISOString() },
        { actorId: admin.user._id, actorName: 'A', actorRole: 'admin', action: 'U', actionType: 'Updated', entityType: 'Lead', entityId: admin.user._id.toString(), entityName: 'L2', timestamp: new Date().toISOString() },
      ]);
      const res = await request(app)
        .get('/api/v1/activity-logs/action/Created')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(l => l.actionType === 'Created')).toBe(true);
    });

    it('should support pagination', async () => {
      const admin = await createAdminUser();
      const logs = [];
      for (let i = 0; i < 5; i++) {
        logs.push({
          actorId: admin.user._id, actorName: 'A', actorRole: 'admin',
          action: 'C', actionType: 'Created', entityType: 'Lead',
          entityId: admin.user._id.toString(), entityName: `L${i}`,
          timestamp: new Date().toISOString(),
        });
      }
      await ActivityLog.create(logs);
      const res = await request(app)
        .get('/api/v1/activity-logs/action/Created?page=1&limit=2')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(5);
    });
  });

  describe('GET /api/v1/activity-logs/recent', () => {
    it('should support pagination', async () => {
      const admin = await createAdminUser();
      const logs = [];
      for (let i = 0; i < 5; i++) {
        logs.push({
          actorId: admin.user._id, actorName: 'A', actorRole: 'admin',
          action: 'R', actionType: 'Created', entityType: 'Project',
          entityId: admin.user._id.toString(), entityName: `P${i}`,
          timestamp: new Date().toISOString(),
        });
      }
      await ActivityLog.create(logs);
      const res = await request(app)
        .get('/api/v1/activity-logs/recent?page=1&limit=3')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
    });

    it('should default limit to 20', async () => {
      const admin = await createAdminUser();
      const res = await request(app)
        .get('/api/v1/activity-logs/recent')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
    });
  });
});
