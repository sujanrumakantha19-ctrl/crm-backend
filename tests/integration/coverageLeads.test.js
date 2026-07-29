const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Lead = require('../../models/Lead');
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
});
