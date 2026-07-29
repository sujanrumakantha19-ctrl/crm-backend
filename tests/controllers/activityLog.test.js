const request = require('supertest');
const { buildTestApp, createAdminUser } = require('../helpers');
const ActivityLog = require('../../models/ActivityLog');

const app = buildTestApp();

describe('Activity Log Controller', () => {
  let adminToken, adminUser;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    adminUser = admin.user;
  });

  describe('POST /api/v1/activity-logs', () => {
    it('should create an activity log', async () => {
      const res = await request(app)
        .post('/api/v1/activity-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          actorId: adminUser._id,
          actorName: adminUser.name,
          actorRole: 'admin',
          action: 'Created project',
          actionType: 'Created',
          entityType: 'Project',
          entityId: adminUser._id, // reuse ID for test
          entityName: 'Test Project',
          timestamp: new Date().toISOString(),
        });
      expect(res.status).toBe(201);
      expect(res.body.data.action).toBe('Created project');
    });
  });

  describe('GET /api/v1/activity-logs', () => {
    it('should return paginated logs', async () => {
      await ActivityLog.create([
        {
          actorId: adminUser._id, actorName: 'A', actorRole: 'admin',
          action: 'Created', actionType: 'Created', entityType: 'Lead',
          entityId: adminUser._id, entityName: 'L1', timestamp: new Date().toISOString(),
        },
        {
          actorId: adminUser._id, actorName: 'A', actorRole: 'admin',
          action: 'Updated', actionType: 'Updated', entityType: 'Lead',
          entityId: adminUser._id, entityName: 'L2', timestamp: new Date().toISOString(),
        },
      ]);
      const res = await request(app)
        .get('/api/v1/activity-logs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/activity-logs/recent', () => {
    it('should return recent logs sorted by timestamp', async () => {
      await ActivityLog.create({
        actorId: adminUser._id, actorName: 'A', actorRole: 'admin',
        action: 'Recent', actionType: 'Created', entityType: 'Project',
        entityId: adminUser._id, entityName: 'P1', timestamp: new Date().toISOString(),
      });
      const res = await request(app)
        .get('/api/v1/activity-logs/recent')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/activity-logs/entity/:entityType', () => {
    it('should filter by entity type', async () => {
      await ActivityLog.create([
        {
          actorId: adminUser._id, actorName: 'A', actorRole: 'admin',
          action: 'Created', actionType: 'Created', entityType: 'Lead',
          entityId: adminUser._id, entityName: 'L1', timestamp: new Date().toISOString(),
        },
        {
          actorId: adminUser._id, actorName: 'A', actorRole: 'admin',
          action: 'Created', actionType: 'Created', entityType: 'Project',
          entityId: adminUser._id, entityName: 'P1', timestamp: new Date().toISOString(),
        },
      ]);
      const res = await request(app)
        .get('/api/v1/activity-logs/entity/Lead')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(l => l.entityType === 'Lead')).toBe(true);
    });
  });

  describe('DELETE /api/v1/activity-logs/:id', () => {
    it('should delete a log as admin', async () => {
      const log = await ActivityLog.create({
        actorId: adminUser._id, actorName: 'A', actorRole: 'admin',
        action: 'Delete', actionType: 'Deleted', entityType: 'Task',
        entityId: adminUser._id, entityName: 'T1', timestamp: new Date().toISOString(),
      });
      const res = await request(app)
        .delete(`/api/v1/activity-logs/${log._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await ActivityLog.findById(log._id)).toBeNull();
    });
  });
});
