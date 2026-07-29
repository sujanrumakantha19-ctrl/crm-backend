const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const ChannelPartner = require('../../models/ChannelPartner');

const app = buildTestApp();

describe('Channel Partner Controller', () => {
  let adminToken, staffToken;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
  });

  describe('POST /api/v1/channel-partners', () => {
    it('should create a channel partner as admin', async () => {
      const res = await request(app)
        .post('/api/v1/channel-partners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Partner', phone: '9876543210',
          email: `partner${Date.now()}@example.com`, city: 'Hyderabad',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Test Partner');
      expect(res.body.data.isActive).toBe(true);
    });

    it('should return 403 for staff creating partner', async () => {
      const res = await request(app)
        .post('/api/v1/channel-partners')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'X', phone: '1', email: 'x@x.com' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/channel-partners', () => {
    it('should return all partners', async () => {
      await ChannelPartner.create([
        { name: 'P1', phone: '1', email: 'p1@x.com' },
        { name: 'P2', phone: '2', email: 'p2@x.com' },
      ]);
      const res = await request(app)
        .get('/api/v1/channel-partners')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PUT /api/v1/channel-partners/:id', () => {
    it('should update a partner as admin', async () => {
      const partner = await ChannelPartner.create({
        name: 'Old', phone: '1', email: `old${Date.now()}@x.com`,
      });
      const res = await request(app)
        .put(`/api/v1/channel-partners/${partner._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New');
    });
  });

  describe('DELETE /api/v1/channel-partners/:id', () => {
    it('should delete a partner as admin', async () => {
      const partner = await ChannelPartner.create({
        name: 'Del', phone: '1', email: `del${Date.now()}@x.com`,
      });
      const res = await request(app)
        .delete(`/api/v1/channel-partners/${partner._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await ChannelPartner.findById(partner._id)).toBeNull();
    });
  });

  describe('GET /api/v1/channel-partners/active', () => {
    it('should return only active partners', async () => {
      await ChannelPartner.create([
        { name: 'Active', phone: '1', email: `a${Date.now()}@x.com`, isActive: true },
        { name: 'Inactive', phone: '2', email: `i${Date.now()}@x.com`, isActive: false },
      ]);
      const res = await request(app)
        .get('/api/v1/channel-partners/active')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(p => p.isActive === true)).toBe(true);
    });
  });
});
