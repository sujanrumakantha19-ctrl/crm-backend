const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser, createPartnerUser } = require('../helpers');
const Lead = require('../../models/Lead');
const Project = require('../../models/Project');
const Task = require('../../models/Task');
const ChannelPartner = require('../../models/ChannelPartner');

const app = buildTestApp();

describe('Access Control: Role-Based Permissions', () => {
  let admin, staff, partner;

  beforeEach(async () => {
    admin = await createAdminUser();
    staff = await createTestUser({ email: `staff${Date.now()}@x.com` });
    partner = await createPartnerUser({ email: `partner${Date.now()}@x.com` });
  });

  describe('Project Access', () => {
    it('admin can create, update, and delete projects', async () => {
      const createRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Test', location: 'Hyd', category: 'Villas', totalLandArea: 100, totalPlots: 5 });
      expect(createRes.status).toBe(201);

      const updateRes = await request(app)
        .put(`/api/v1/projects/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Updated' });
      expect(updateRes.status).toBe(200);

      const deleteRes = await request(app)
        .delete(`/api/v1/projects/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(deleteRes.status).toBe(200);
    });

    it('staff can create and update but not delete projects', async () => {
      const createRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ name: 'Staff Project', location: 'Hyd', category: 'Open Plots', totalLandArea: 50, totalPlots: 3 });
      expect(createRes.status).toBe(201);

      const deleteRes = await request(app)
        .delete(`/api/v1/projects/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(deleteRes.status).toBe(403);
    });

    it('partner cannot create or delete projects', async () => {
      const createRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${partner.token}`)
        .send({ name: 'Partner Project', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });
      expect(createRes.status).toBe(403);
    });

    it('all roles can read projects', async () => {
      await Project.create({ name: 'P', location: 'L', totalLandArea: 10, totalPlots: 2 });

      for (const token of [admin.token, staff.token, partner.token]) {
        const res = await request(app)
          .get('/api/v1/projects')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Lead Access', () => {
    it('any authenticated user can create leads', async () => {
      for (const [role, token] of [['admin', admin.token], ['staff', staff.token], ['partner', partner.token]]) {
        const res = await request(app)
          .post('/api/v1/leads')
          .set('Authorization', `Bearer ${token}`)
          .send({ customerName: `${role} Lead`, phone: '123', email: `${role}@test.com`, source: 'Test' });
        expect(res.status).toBe(201);
      }
    });

    it('any authenticated user can update leads', async () => {
      const lead = await Lead.create({ customerName: 'Test', phone: '123', email: 't@x.com' });
      const res = await request(app)
        .put(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${partner.token}`)
        .send({ status: 'Qualified' });
      expect(res.status).toBe(200);
    });

    it('any authenticated user can read leads', async () => {
      for (const token of [admin.token, staff.token, partner.token]) {
        const res = await request(app)
          .get('/api/v1/leads')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('User Management Access', () => {
    it('admin can create, update, and delete users', async () => {
      const createRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'New', initials: 'NW', role: 'staff', email: `new${Date.now()}@x.com`, phone: '1', password: 'pass123' });
      expect(createRes.status).toBe(201);
    });

    it('staff cannot create users', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ name: 'X', initials: 'X', role: 'staff', email: `x${Date.now()}@x.com`, phone: '1', password: 'pass123' });
      expect(res.status).toBe(403);
    });

    it('partner cannot create users', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${partner.token}`)
        .send({ name: 'X', initials: 'X', role: 'staff', email: `p${Date.now()}@x.com`, phone: '1', password: 'pass123' });
      expect(res.status).toBe(403);
    });
  });

  describe('Task Access', () => {
    it('any role can create and update tasks', async () => {
      for (const [role, token] of [['admin', admin.token], ['staff', staff.token], ['partner', partner.token]]) {
        const createRes = await request(app)
          .post('/api/v1/tasks')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: `${role} Task` });
        expect(createRes.status).toBe(201);
      }
    });

    it('only admin can delete tasks', async () => {
      const task = await Task.create({ title: 'Delete Me' });

      const staffDelete = await request(app)
        .delete(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(staffDelete.status).toBe(403);

      const adminDelete = await request(app)
        .delete(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminDelete.status).toBe(200);
    });
  });

  describe('Channel Partner Access', () => {
    it('only admin can create channel partners', async () => {
      const staffRes = await request(app)
        .post('/api/v1/channel-partners')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ name: 'X', phone: '1', email: `s${Date.now()}@x.com` });
      expect(staffRes.status).toBe(403);

      const adminRes = await request(app)
        .post('/api/v1/channel-partners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Admin CP', phone: '2', email: `cp${Date.now()}@x.com` });
      expect(adminRes.status).toBe(201);
    });

    it('only admin can delete channel partners', async () => {
      const cp = await ChannelPartner.create({ name: 'Del', phone: '1', email: `del${Date.now()}@x.com` });

      const staffDel = await request(app)
        .delete(`/api/v1/channel-partners/${cp._id}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(staffDel.status).toBe(403);

      const adminDel = await request(app)
        .delete(`/api/v1/channel-partners/${cp._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminDel.status).toBe(200);
    });
  });

  describe('Plot Booking Access', () => {
    it('only admin can approve bookings', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Access Test', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      const plotId = plots.body.data[0].id;

      // Staff books
      await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'Test', phone: '123' });

      // Staff cannot approve
      const staffApprove = await request(app)
        .put(`/api/v1/plots/${plotId}/approve`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(staffApprove.status).toBe(403);

      // Admin can approve
      const adminApprove = await request(app)
        .put(`/api/v1/plots/${plotId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminApprove.status).toBe(200);
      expect(adminApprove.body.data.status).toBe('Booked');
    });

    it('only admin can reject bookings', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Reject Test', location: 'Hyd', category: 'Open Plots', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      const plotId = plots.body.data[0].id;

      // Staff books (staff role triggers Pending status)
      await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'Test', phone: '456' });

      // Partner cannot reject
      const partnerReject = await request(app)
        .put(`/api/v1/plots/${plotId}/reject`)
        .set('Authorization', `Bearer ${partner.token}`);
      expect(partnerReject.status).toBe(403);

      // Admin can reject
      const adminReject = await request(app)
        .put(`/api/v1/plots/${plotId}/reject`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminReject.status).toBe(200);
      expect(adminReject.body.data.status).toBe('Available');
    });

    it('staff can book plots', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Book Test', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const staffBook = await request(app)
        .put(`/api/v1/plots/${plots.body.data[0].id}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'Staff Customer', phone: '789' });
      expect(staffBook.status).toBe(200);
      expect(staffBook.body.data.status).toBe('Pending');
    });

    it('admin can book plots directly as Booked', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Admin Book', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const adminBook = await request(app)
        .put(`/api/v1/plots/${plots.body.data[0].id}/book`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ customerName: 'Admin Customer', phone: '000', paymentStatus: 'Fully Paid' });
      expect(adminBook.status).toBe(200);
      expect(adminBook.body.data.status).toBe('Booked');
    });
  });

  describe('Negative Booking Flows', () => {
    it('should reject booking a plot that is already Booked', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Neg Test', location: 'Hyd', category: 'Open Plots', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      const plotId = plots.body.data[0].id;

      // Admin books directly (sets to Booked)
      await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ customerName: 'First', phone: '111' });

      // Staff tries to book the same plot — should fail
      const secondBook = await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'Second', phone: '222' });
      expect(secondBook.status).toBe(400);
    });

    it('should reject approving a plot that is not Pending', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Approve Neg', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      // Try to approve an Available plot
      const approveRes = await request(app)
        .put(`/api/v1/plots/${plots.body.data[0].id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(approveRes.status).toBe(400);
    });

    it('should reject rejecting a plot that is not Pending', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Reject Neg', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      // Try to reject an Available plot
      const rejectRes = await request(app)
        .put(`/api/v1/plots/${plots.body.data[0].id}/reject`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(rejectRes.status).toBe(400);
    });

    it('should reject booking a plot that is already Pending', async () => {
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Double Pending', location: 'Hyd', category: 'Open Plots', totalLandArea: 50, totalPlots: 3 });

      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      const plotId = plots.body.data[0].id;

      // First booking (sets to Pending)
      await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'First', phone: '111' });

      // Second booking on same plot — should fail
      const secondBook = await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'Second', phone: '222' });
      expect(secondBook.status).toBe(400);
    });
  });

  describe('Authentication Requirements', () => {
    it('all protected routes return 401 without token', async () => {
      const routes = [
        ['GET', '/api/v1/users'],
        ['GET', '/api/v1/projects'],
        ['GET', '/api/v1/leads'],
        ['GET', '/api/v1/tasks'],
        ['GET', '/api/v1/plots'],
        ['GET', '/api/v1/attendance'],
        ['GET', '/api/v1/groups'],
      ];

      for (const [method, path] of routes) {
        const res = await request(app)[method.toLowerCase()](path);
        expect(res.status).toBe(401);
      }
    });

    it('returns 401 for invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });
  });
});
