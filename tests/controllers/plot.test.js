const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Plot = require('../../models/Plot');
const Project = require('../../models/Project');

const app = buildTestApp();

describe('Plot Controller', () => {
  let adminToken, staffToken, projectId;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
    const project = await Project.create({
      name: 'Test Project', location: 'Hyderabad', totalLandArea: 100, totalPlots: 10,
    });
    projectId = project._id;
  });

  describe('GET /api/v1/plots', () => {
    it('should return paginated plots', async () => {
      await Plot.create([
        { projectId, plotNumber: '1' },
        { projectId, plotNumber: '2' },
      ]);
      const res = await request(app)
        .get('/api/v1/plots')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/plots/:id', () => {
    it('should return a single plot with populated project', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '1' });
      const res = await request(app)
        .get(`/api/v1/plots/${plot._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent plot', async () => {
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/plots/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/plots/:id (update)', () => {
    it('should update a plot as admin', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '1' });
      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ facing: 'North', price: 500000 });
      expect(res.status).toBe(200);
      expect(res.body.data.facing).toBe('North');
      expect(res.body.data.price).toBe(500000);
    });
  });

  describe('PUT /api/v1/plots/:id/book (booking flow)', () => {
    it('should set status to Pending when staff books', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '10' });
      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/book`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Customer A',
          phone: '9876543210',
          paymentStatus: 'Not Paid',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Pending');
      expect(res.body.data.pendingApproval.customerName).toBe('Customer A');
    });

    it('should set status to Booked when admin books directly', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '11' });
      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/book`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Customer B',
          phone: '9876543211',
          paymentStatus: 'Fully Paid',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Booked');
      expect(res.body.data.bookedBy.name).toBe('Customer B');
      expect(res.body.data.bookedBy.paymentStatus).toBe('Fully Paid');
    });

    it('should return 400 if plot is not Available', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '12', status: 'Booked' });
      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/book`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ customerName: 'X', phone: '123' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/v1/plots/:id/approve', () => {
    it('should approve a pending booking', async () => {
      const plot = await Plot.create({
        projectId, plotNumber: '20', status: 'Pending',
        pendingApproval: {
          leadId: 'lead123',
          customerName: 'Pending Customer',
          phone: '999',
          requestedBy: 'Staff',
          requestedAt: '2024-01-01',
          paymentStatus: 'Not Paid',
        },
      });

      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Booked');
      expect(res.body.data.bookedBy.name).toBe('Pending Customer');
      expect(res.body.data.pendingApproval).toBeUndefined();
    });

    it('should return 400 if plot is not pending', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '21', status: 'Available' });
      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('should only be accessible by admin', async () => {
      const plot = await Plot.create({
        projectId, plotNumber: '22', status: 'Pending',
        pendingApproval: { leadId: 'l', customerName: 'C', phone: '1', requestedBy: 'S', requestedAt: '2024-01-01' },
      });
      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/approve`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/plots/:id/reject', () => {
    it('should reject a pending booking and restore to Available', async () => {
      const Lead = require('../../models/Lead');
      const lead = await Lead.create({
        customerName: 'Rejected Customer',
        phone: '1234567890',
        email: 'rejected@test.com',
        status: 'Customer',
        plotId: new (require('mongoose').Types.ObjectId)(),
      });
      const plot = await Plot.create({
        projectId, plotNumber: '30', status: 'Pending',
        pendingApproval: { leadId: lead._id.toString(), customerName: 'C', phone: '1', requestedBy: 'S', requestedAt: '2024-01-01' },
      });

      const res = await request(app)
        .put(`/api/v1/plots/${plot._id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Available');
      expect(res.body.data.pendingApproval).toBeUndefined();

      // Verify lead was reverted
      const updatedLead = await Lead.findById(lead._id);
      expect(updatedLead.status).toBe('Qualified');
      expect(updatedLead.plotId).toBeNull();
    });
  });

  describe('GET /api/v1/plots/pending-approvals', () => {
    it('should return all pending plots for admin', async () => {
      await Plot.create([
        { projectId, plotNumber: '40', status: 'Pending', pendingApproval: { leadId: new (require('mongoose').Types.ObjectId)().toString(), customerName: 'C', phone: '1', requestedBy: 'S', requestedAt: '2024-01-01' } },
        { projectId, plotNumber: '41', status: 'Available' },
      ]);

      const res = await request(app)
        .get('/api/v1/plots/pending-approvals')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('DELETE /api/v1/plots/:id', () => {
    it('should delete a plot', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '50' });
      const res = await request(app)
        .delete(`/api/v1/plots/${plot._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await Plot.findById(plot._id)).toBeNull();
    });
  });

  describe('GET /api/v1/plots/status/:status', () => {
    it('should filter plots by status', async () => {
      await Plot.create([
        { projectId, plotNumber: '60', status: 'Available' },
        { projectId, plotNumber: '61', status: 'Booked' },
      ]);
      const res = await request(app)
        .get('/api/v1/plots/status/Available')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(p => p.status === 'Available')).toBe(true);
    });
  });
});
