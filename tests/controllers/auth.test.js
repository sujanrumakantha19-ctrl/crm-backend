const request = require('supertest');
const { buildTestApp, createTestUser, createAdminUser } = require('../helpers');
const User = require('../../models/User');

const app = buildTestApp();

describe('Auth Controller', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'New User',
          initials: 'NU',
          email: `new${Date.now()}@example.com`,
          phone: '9876543210',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.data.name).toBe('New User');
      expect(res.body.data.role).toBe('partner');
    });

    it('should fail with duplicate email', async () => {
      const email = `dup${Date.now()}@example.com`;
      await request(app).post('/api/v1/auth/register').send({
        name: 'User 1', initials: 'U1', email, phone: '111', password: 'password123',
      });
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'User 2', initials: 'U2', email, phone: '222', password: 'password123',
      });
      expect(res.status).toBe(400);
    });

    it('should fail without required fields', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({});
      expect(res.status).toBe(400);
    });

    it('should fail with short password', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'User', initials: 'U', email: `short${Date.now()}@example.com`, phone: '123', password: '12',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const email = `login${Date.now()}@example.com`;
      await request(app).post('/api/v1/auth/register').send({
        name: 'Login User', initials: 'LU', email, phone: '123', password: 'password123',
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email, password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.data.email).toBe(email);
    });

    it('should fail with wrong password', async () => {
      const email = `wrong${Date.now()}@example.com`;
      await request(app).post('/api/v1/auth/register').send({
        name: 'User', initials: 'U', email, phone: '123', password: 'password123',
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email, password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
    });

    it('should fail with non-existent email', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@example.com', password: 'password123',
      });
      expect(res.status).toBe(401);
    });

    it('should fail without email or password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user', async () => {
      const { user, token } = await createAdminUser();
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(user.email);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/auth/update-profile', () => {
    it('should update allowed profile fields', async () => {
      const { token } = await createAdminUser();
      const res = await request(app)
        .put('/api/v1/auth/update-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name', phone: '9999999999' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.phone).toBe('9999999999');
    });
  });

  describe('PUT /api/v1/auth/change-password', () => {
    it('should change password with correct current password', async () => {
      const { token } = await createAdminUser();
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should fail with wrong current password', async () => {
      const { token } = await createAdminUser();
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword456' });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT/DELETE /api/v1/auth/push-token', () => {
    it('should add push token', async () => {
      const { token } = await createAdminUser();
      const res = await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'test-push-token-123', platform: 'android' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should not duplicate existing push token', async () => {
      const { token } = await createAdminUser();
      await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'test-push-token-123', platform: 'android' });

      const res = await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'test-push-token-123', platform: 'android' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should remove push token', async () => {
      const { token } = await createAdminUser();
      await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'test-push-token-123', platform: 'android' });

      const res = await request(app)
        .delete('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'test-push-token-123' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
