const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Lead = require('../../models/Lead');
const Plot = require('../../models/Plot');
const ActivityLog = require('../../models/ActivityLog');
const Project = require('../../models/Project');

const app = buildTestApp();

describe('Lead Controller Coverage', () => {
  describe('GET /api/v1/leads/:id', () => {
    it('should return 404 for non-existent lead', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/leads/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });

    it('should populate assignedTo, projectId, plotId', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `pop${Date.now()}@x.com` });
      const project = await Project.create({ name: 'Pop', location: 'Hyd', totalLandArea: 10, totalPlots: 2 });
      const lead = await Lead.create({
        customerName: 'Pop Lead', phone: '123', email: `pop${Date.now()}@x.com`,
        assignedTo: staff.user._id, projectId: project._id,
      });
      const res = await request(app)
        .get(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.assignedTo).toBeDefined();
      expect(res.body.data.projectId).toBeDefined();
    });
  });

  describe('POST /api/v1/leads', () => {
    it('should strip undefined fields', async () => {
      const staff = await createTestUser({ email: `strip${Date.now()}@x.com` });
      const res = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          customerName: 'Strip', phone: '123', email: `strip2${Date.now()}@x.com`,
          source: 'Web', createdAt: undefined, __v: undefined,
        });
      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/v1/leads/:id', () => {
    it('should return 404 for non-existent lead', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/leads/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Qualified' });
      expect(res.status).toBe(404);
    });

    it('should strip undefined fields on update', async () => {
      const admin = await createAdminUser();
      const lead = await Lead.create({ customerName: 'Upd', phone: '123', email: `upd${Date.now()}@x.com` });
      const res = await request(app)
        .put(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Qualified', createdAt: undefined });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Qualified');
    });
  });

  describe('DELETE /api/v1/leads/:id', () => {
    it('should return 404 for non-existent lead', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/v1/leads/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/leads/project/:projectId', () => {
    it('should return leads filtered by project', async () => {
      const admin = await createAdminUser();
      const project = await Project.create({ name: 'LP', location: 'Hyd', totalLandArea: 10, totalPlots: 2 });
      await Lead.create([
        { customerName: 'L1', phone: '1', email: 'l1@x.com', projectId: project._id },
        { customerName: 'L2', phone: '2', email: 'l2@x.com', projectId: project._id },
        { customerName: 'L3', phone: '3', email: 'l3@x.com' },
      ]);
      const res = await request(app)
        .get(`/api/v1/leads/project/${project._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination).toBeDefined();
    });

    it('should support pagination', async () => {
      const admin = await createAdminUser();
      const project = await Project.create({ name: 'LP2', location: 'Hyd', totalLandArea: 10, totalPlots: 2 });
      const leads = [];
      for (let i = 0; i < 5; i++) {
        leads.push({ customerName: `LP${i}`, phone: `${i}`, email: `lp${i}@x.com`, projectId: project._id });
      }
      await Lead.create(leads);
      const res = await request(app)
        .get(`/api/v1/leads/project/${project._id}?page=1&limit=2`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(5);
    });
  });

  describe('GET /api/v1/leads/user/:userId', () => {
    it('should return leads assigned to a user', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `ul${Date.now()}@x.com` });
      await Lead.create([
        { customerName: 'UL1', phone: '1', email: 'ul1@x.com', assignedTo: staff.user._id },
        { customerName: 'UL2', phone: '2', email: 'ul2@x.com', assignedTo: staff.user._id },
        { customerName: 'UL3', phone: '3', email: 'ul3@x.com' },
      ]);
      const res = await request(app)
        .get(`/api/v1/leads/user/${staff.user._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });
  });

  describe('GET /api/v1/leads/check-phone/:phone', () => {
    it('should not match a phone that merely contains the digits mid-number', async () => {
      const admin = await createAdminUser();
      // '1234567890' appears inside the stored phone but is NOT its suffix,
      // so it must not be reported as a duplicate.
      await Lead.create({ customerName: 'Embedded', phone: '9912345678901', email: `emb${Date.now()}@x.com` });
      const res = await request(app)
        .get(`/api/v1/leads/check-phone/${encodeURIComponent('1234567890')}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
    });

    it('should match a formatted phone whose digits end with the queried number', async () => {
      const admin = await createAdminUser();
      const lead = await Lead.create({ customerName: 'Exact', phone: '+91 9876543210', email: `ex${Date.now()}@x.com` });
      const res = await request(app)
        .get(`/api/v1/leads/check-phone/${encodeURIComponent('9876543210')}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.lead.id).toBe(String(lead._id));
      expect(res.body.lead.displayId).toBe(lead.displayId);
    });
  });

  describe('Lead status change / delete writes Activity Log', () => {
    it('should create an ActivityLog entry on status change', async () => {
      const admin = await createAdminUser();
      const lead = await Lead.create({ customerName: 'Log Lead', phone: '123', email: `lg${Date.now()}@x.com` });
      await request(app)
        .put(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Qualified' });
      const log = await ActivityLog.findOne({ entityType: 'Lead', entityId: String(lead._id) });
      expect(log).not.toBeNull();
      expect(log.actionType).toBe('Status Change');
      expect(log.actorId).toBe(String(admin.user._id));
      expect(log.actorName).toBe(admin.user.name);
      expect(log.actorRole).toBe('admin');
    });

    it('should create an ActivityLog entry on lead deletion', async () => {
      const admin = await createAdminUser();
      const lead = await Lead.create({ customerName: 'Delete Log', phone: '123', email: `dl${Date.now()}@x.com` });
      await request(app)
        .delete(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      const log = await ActivityLog.findOne({ entityType: 'Lead', actionType: 'Deleted' });
      expect(log).not.toBeNull();
      expect(log.entityName).toBe('Delete Log');
    });
  });

  describe('Lead <-> Plot auto-sync on plotId re-assignment', () => {
    it('should book the new plot and free the old plot when a Customer lead is re-assigned', async () => {
      const admin = await createAdminUser();
      const project = await Project.create({ name: 'Sync', location: 'Hyd', totalLandArea: 10, totalPlots: 2 });
      const oldPlot = await Plot.create({ projectId: project._id, plotNumber: 'S1', status: 'Booked' });
      const newPlot = await Plot.create({ projectId: project._id, plotNumber: 'S2', status: 'Available' });
      const lead = await Lead.create({
        customerName: 'Sync Lead', phone: '123', email: `sync${Date.now()}@x.com`,
        status: 'Customer', plotId: oldPlot._id,
      });

      const res = await request(app)
        .put(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ plotId: newPlot._id });
      expect(res.status).toBe(200);

      const refreshedOld = await Plot.findById(oldPlot._id);
      const refreshedNew = await Plot.findById(newPlot._id);
      expect(refreshedOld.status).toBe('Available');
      expect(refreshedNew.status).toBe('Booked');
    });
  });

  describe('Follow-ups outcome classification', () => {
    it('should classify "Wrong project but interested" as positive', async () => {
      const admin = await createAdminUser();
      await Lead.create({
        customerName: 'Ambiguous', phone: '123', email: `am${Date.now()}@x.com`,
        followUps: [{ id: 'fu1', date: '2024-01-01', outcome: 'Wrong project but interested' }],
      });
      const res = await request(app)
        .get('/api/v1/leads/follow-ups?outcome=positive')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.stats.positiveCount).toBe(1);
      expect(res.body.stats.negativeCount).toBe(0);
    });

    it('should classify "Not Interested" as negative', async () => {
      const admin = await createAdminUser();
      await Lead.create({
        customerName: 'Not Interested', phone: '123', email: `ni${Date.now()}@x.com`,
        followUps: [{ id: 'fu2', date: '2024-01-01', outcome: 'Not Interested' }],
      });
      const res = await request(app)
        .get('/api/v1/leads/follow-ups?outcome=negative')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.stats.negativeCount).toBe(1);
    });
  });
});
