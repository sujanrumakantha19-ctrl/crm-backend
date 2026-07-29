const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Lead = require('../../models/Lead');
const Project = require('../../models/Project');

const app = buildTestApp();

describe('Lead Controller', () => {
  let adminToken, staffToken, projectId;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
    const project = await Project.create({
      name: 'Test Project', location: 'Hyderabad', totalLandArea: 100, totalPlots: 50,
    });
    projectId = project._id;
  });

  describe('POST /api/v1/leads', () => {
    it('should create a lead', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Test Customer',
          phone: '9876543210',
          email: 'customer@example.com',
          source: 'Website',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customerName).toBe('Test Customer');
      expect(res.body.data.status).toBe('Open');
    });

    it('should create a lead with optional budget and category', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Budget Customer',
          phone: '9876500000',
          email: 'budget@example.com',
          source: 'Direct',
          budget: '5000000',
          category: 'Villas',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.budget).toBe('5000000');
      expect(res.body.data.category).toBe('Villas');
    });

    it('should fail without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ customerName: 'Test' });

      expect(res.status).toBe(400);
    });

    it('should not allow injecting unauthorized fields', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Test',
          phone: '123',
          email: 'a@b.com',
          source: 'Website',
          createdAt: '2000-01-01',
          __v: 99,
        });

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/v1/leads', () => {
    it('should return paginated leads', async () => {
      await Lead.create([
        { customerName: 'Lead 1', phone: '111', email: 'l1@x.com' },
        { customerName: 'Lead 2', phone: '222', email: 'l2@x.com' },
      ]);

      const res = await request(app)
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();
    });

    it('should support search', async () => {
      await Lead.create({ customerName: 'John Smith', phone: '111', email: 'js@x.com' });
      await Lead.create({ customerName: 'Jane Doe', phone: '222', email: 'jd@x.com' });

      const res = await request(app)
        .get('/api/v1/leads?search=John')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/leads/:id', () => {
    it('should return a single lead', async () => {
      const lead = await Lead.create({
        customerName: 'Test', phone: '123', email: 'a@b.com',
      });
      const res = await request(app)
        .get(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.customerName).toBe('Test');
    });

    it('should return 404 for non-existent lead', async () => {
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/leads/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/leads/:id', () => {
    it('should update a lead', async () => {
      const lead = await Lead.create({
        customerName: 'Old Name', phone: '123', email: 'a@b.com',
      });
      const res = await request(app)
        .put(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ customerName: 'New Name', status: 'Qualified' });

      expect(res.status).toBe(200);
      expect(res.body.data.customerName).toBe('New Name');
      expect(res.body.data.status).toBe('Qualified');
    });
  });

  describe('DELETE /api/v1/leads/:id', () => {
    it('should delete a lead', async () => {
      const lead = await Lead.create({
        customerName: 'To Delete', phone: '123', email: 'a@b.com',
      });
      const res = await request(app)
        .delete(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const check = await Lead.findById(lead._id);
      expect(check).toBeNull();
    });
  });

  describe('GET /api/v1/leads/status/:status', () => {
    it('should filter leads by status', async () => {
      await Lead.create({ customerName: 'Open', phone: '1', email: 'o@x.com', status: 'Open' });
      await Lead.create({ customerName: 'Qualified', phone: '2', email: 'q@x.com', status: 'Qualified' });

      const res = await request(app)
        .get('/api/v1/leads/status/Open')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every(l => l.status === 'Open')).toBe(true);
    });
  });
});
