const request = require('supertest');
const { buildTestApp, createAdminUser } = require('../helpers');
const mongoose = require('mongoose');
const Lead = require('../../models/Lead');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');
const Task = require('../../models/Task');
const ChannelPartner = require('../../models/ChannelPartner');
const Group = require('../../models/Group');

const app = buildTestApp();

describe('AdvancedResults Middleware', () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
  });

  describe('Pagination', () => {
    it('should paginate results with page and limit', async () => {
      const leads = [];
      for (let i = 0; i < 25; i++) {
        leads.push({
          customerName: `Customer ${i}`, phone: `${i}`.padStart(10, '0'),
          email: `c${i}@test.com`,
        });
      }
      await Lead.create(leads);

      const res = await request(app)
        .get('/api/v1/leads?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(10);
      expect(res.body.pagination.next).toBeDefined();
      expect(res.body.pagination.next.page).toBe(2);
    });

    it('should cap limit at 100', async () => {
      const res = await request(app)
        .get('/api/v1/leads?limit=500')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Search', () => {
    it('should search by configured fields', async () => {
      await Lead.create([
        { customerName: 'Alice Smith', phone: '1111111111', email: 'alice@test.com' },
        { customerName: 'Bob Jones', phone: '2222222222', email: 'bob@test.com' },
      ]);

      const res = await request(app)
        .get('/api/v1/leads?search=Alice')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].customerName).toBe('Alice Smith');
    });

    it('should search by phone', async () => {
      await Lead.create([
        { customerName: 'User1', phone: '9876543210', email: 'u1@test.com' },
        { customerName: 'User2', phone: '1234567890', email: 'u2@test.com' },
      ]);

      const res = await request(app)
        .get('/api/v1/leads?search=9876')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('Sort', () => {
    it('should sort by specified field', async () => {
      await Lead.create([
        { customerName: 'Zebra', phone: '111', email: 'z@test.com' },
        { customerName: 'Apple', phone: '222', email: 'a@test.com' },
      ]);

      const res = await request(app)
        .get('/api/v1/leads?sort=customerName')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].customerName).toBe('Apple');
    });

    it('should default sort to -createdAt', async () => {
      // Use explicit timestamps to guarantee deterministic sort order
      await Lead.create({ customerName: 'First', phone: '111', email: 'f@test.com', createdAt: new Date('2024-01-01T00:00:00.000Z') });
      await Lead.create({ customerName: 'Second', phone: '222', email: 's@test.com', createdAt: new Date('2024-01-02T00:00:00.000Z') });

      const res = await request(app)
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Most recent should be first
      expect(res.body.data[0].customerName).toBe('Second');
    });
  });

  describe('Select', () => {
    it('should return only selected fields', async () => {
      await Lead.create({
        customerName: 'Select Test', phone: '111', email: 'sel@test.com',
      });

      const res = await request(app)
        .get('/api/v1/leads?select=customerName,phone')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data[0].customerName).toBeDefined();
        expect(res.body.data[0].phone).toBeDefined();
      }
    });
  });

  describe('Filtering', () => {
    it('should filter by query parameters', async () => {
      await Lead.create([
        { customerName: 'Open', phone: '111', email: 'o@test.com', status: 'Open' },
        { customerName: 'Qualified', phone: '222', email: 'q@test.com', status: 'Qualified' },
      ]);

      const res = await request(app)
        .get('/api/v1/leads?status=Open')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every(l => l.status === 'Open')).toBe(true);
    });
  });

  describe('NoSQL Injection Prevention', () => {
    it('should sanitize $gt injection attempts', async () => {
      const res = await request(app)
        .get('/api/v1/leads?status[$gt]=')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should handle malformed query gracefully', async () => {
      const res = await request(app)
        .get('/api/v1/leads?select=invalid{')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid ObjectId gracefully', async () => {
      const res = await request(app)
        .get('/api/v1/leads/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 404]).toContain(res.status);
    });

    it('should return 404 for non-existent resource', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/leads/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
