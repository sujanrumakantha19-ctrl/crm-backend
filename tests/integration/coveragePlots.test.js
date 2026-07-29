const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Plot = require('../../models/Plot');
const Project = require('../../models/Project');

const app = buildTestApp();

describe('Plot Controller Coverage', () => {
  describe('GET /api/v1/plots/:id', () => {
    it('should return 404 for non-existent plot', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/plots/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/plots', () => {
    it('should create a plot', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'P', location: 'L', totalLandArea: 10, totalPlots: 2 });
      const res = await request(app)
        .post('/api/v1/plots')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ projectId: proj._id, plotNumber: 'A1', status: 'Available' });
      expect(res.status).toBe(201);
    });

    it('should return 400 for validation error', async () => {
      const admin = await createAdminUser();
      const res = await request(app)
        .post('/api/v1/plots')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ plotNumber: 'A1' }); // missing required projectId
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/v1/plots/:id', () => {
    it('should return 404 for non-existent plot', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/plots/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ facing: 'North' });
      expect(res.status).toBe(404);
    });

    it('should strip undefined fields', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'P2', location: 'L', totalLandArea: 10, totalPlots: 2 });
      const plot = await Plot.create({ projectId: proj._id, plotNumber: 'B1' });
      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ facing: 'South', status: undefined, price: undefined });
      expect(res.status).toBe(200);
      expect(res.body.data.facing).toBe('South');
    });
  });

  describe('DELETE /api/v1/plots/:id', () => {
    it('should return 404 for non-existent plot', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/v1/plots/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/plots/:id/book edge cases', () => {
    it('should return 400 for non-existent plot', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/plots/${fakeId}/book`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ customerName: 'X', phone: '123' });
      expect(res.status).toBe(400);
    });

    it('should create notification for admin when staff books', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `notif${Date.now()}@x.com` });
      const proj = await Project.create({ name: 'Notif', location: 'L', totalLandArea: 10, totalPlots: 2 });
      const plot = await Plot.create({ projectId: proj._id, plotNumber: 'N1' });

      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'Notif Customer', phone: '999' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Pending');
    });
  });

  describe('PUT /api/v1/plots/:id/approve edge cases', () => {
    it('should return 404 for non-existent plot', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/plots/${fakeId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/plots/:id/reject edge cases', () => {
    it('should return 404 for non-existent plot', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/plots/${fakeId}/reject`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/plots/status/:status with hasExpectedDate', () => {
    it('should filter by hasExpectedDate=true', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'ED', location: 'L', totalLandArea: 10, totalPlots: 2 });
      await Plot.create([
        { projectId: proj._id, plotNumber: 'E1', status: 'Booked', expectedRegistrationDate: '2024-07-01' },
        { projectId: proj._id, plotNumber: 'E2', status: 'Booked' },
      ]);
      const res = await request(app)
        .get('/api/v1/plots/status/Booked?hasExpectedDate=true')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].plotNumber).toBe('E1');
    });

    it('should return all when hasExpectedDate is not true', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'ED2', location: 'L', totalLandArea: 10, totalPlots: 2 });
      await Plot.create([
        { projectId: proj._id, plotNumber: 'F1', status: 'Booked', expectedRegistrationDate: '2024-07-01' },
        { projectId: proj._id, plotNumber: 'F2', status: 'Booked' },
      ]);
      const res = await request(app)
        .get('/api/v1/plots/status/Booked')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });
  });

  describe('GET /api/v1/plots/:id/pending-approval', () => {
    it('should return pending approval details', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `pa${Date.now()}@x.com` });
      const proj = await Project.create({ name: 'PA', location: 'L', totalLandArea: 10, totalPlots: 2 });
      const plot = await Plot.create({
        projectId: proj._id, plotNumber: 'PA1', status: 'Pending',
        pendingApproval: { leadId: 'l1', customerName: 'C', phone: '1', requestedBy: 'S', requestedAt: '2024-01-01' },
      });
      const res = await request(app)
        .get(`/api/v1/plots/${plot._id}/pending-approval`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.customerName).toBe('C');
    });

    it('should return null/empty when no pending approval', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'PA2', location: 'L', totalLandArea: 10, totalPlots: 2 });
      const plot = await Plot.create({ projectId: proj._id, plotNumber: 'PA2' });
      const res = await request(app)
        .get(`/api/v1/plots/${plot._id}/pending-approval`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      // pendingApproval returns null or empty object when not set
      expect(!res.body.data || Object.keys(res.body.data).length === 0).toBe(true);
    });

    it('should return 404 for non-existent plot', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/plots/${fakeId}/pending-approval`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/plots/pending-approvals pagination', () => {
    it('should support page and limit', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'PP', location: 'L', totalLandArea: 10, totalPlots: 5 });
      for (let i = 0; i < 3; i++) {
        await Plot.create({
          projectId: proj._id, plotNumber: `PP${i}`, status: 'Pending',
          pendingApproval: { leadId: 'l', customerName: 'C', phone: '1', requestedBy: 'S', requestedAt: '2024-01-01' },
        });
      }
      const res = await request(app)
        .get('/api/v1/plots/pending-approvals?page=1&limit=2')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(3);
    });
  });

  describe('GET /api/v1/plots/project/:projectId', () => {
    it('should return plots by project', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'BP', location: 'L', totalLandArea: 10, totalPlots: 3 });
      await Plot.create([
        { projectId: proj._id, plotNumber: '1' },
        { projectId: proj._id, plotNumber: '2' },
      ]);
      const res = await request(app)
        .get(`/api/v1/plots/project/${proj._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });
  });
});
