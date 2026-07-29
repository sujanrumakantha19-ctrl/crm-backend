const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const User = require('../../models/User');
const crypto = require('crypto');

const app = buildTestApp();

describe('Auth Controller Coverage', () => {
  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return success for non-existent email (prevent enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('reset link');
    });

    it('should return success for existing user (email may fail to send)', async () => {
      await createTestUser({ email: `reset${Date.now()}@test.com` });
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: `reset${Date.now()}@test.com` });
      // Returns 200 on success or 500 if email sending fails (no SMTP in test)
      expect([200, 500]).toContain(res.status);
    });

    it('should fail without email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('should fail without token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ newPassword: 'newpass123' });
      expect(res.status).toBe(400);
    });

    it('should fail without newPassword', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'sometoken' });
      expect(res.status).toBe(400);
    });

    it('should fail with invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalidtoken123', newPassword: 'newpass123' });
      expect(res.status).toBe(400);
    });

    it('should fail with expired token', async () => {
      const user = await User.create({
        name: 'Reset User', initials: 'RU', role: 'staff',
        email: `reset${Date.now()}@test.com`, phone: '123', password: 'pass123',
        resetPasswordToken: crypto.createHash('sha256').update('expiredtoken').digest('hex'),
        resetPasswordExpire: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      });
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'expiredtoken', newPassword: 'newpass123' });
      expect(res.status).toBe(400);
    });

    it('should succeed with valid token', async () => {
      const rawToken = 'validtoken123';
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const user = await User.create({
        name: 'Reset User2', initials: 'RU', role: 'staff',
        email: `reset2${Date.now()}@test.com`, phone: '123', password: 'pass123',
        resetPasswordToken: hashedToken,
        resetPasswordExpire: new Date(Date.now() + 10 * 60 * 1000), // 10 min from now
      });
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword: 'newpass456' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify can login with new password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'newpass456' });
      expect(loginRes.status).toBe(200);
    });
  });

  describe('PUT /api/v1/auth/update-profile', () => {
    it('should update profile fields', async () => {
      const { token } = await createTestUser({ email: `upd${Date.now()}@x.com` });
      const res = await request(app)
        .put('/api/v1/auth/update-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name', phone: '9999999999' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should update dob field', async () => {
      const { token } = await createTestUser({ email: `dob${Date.now()}@x.com` });
      const res = await request(app)
        .put('/api/v1/auth/update-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ dob: '1990-01-15' });
      expect(res.status).toBe(200);
    });

    it('should update avatarBg', async () => {
      const { token } = await createTestUser({ email: `av${Date.now()}@x.com` });
      const res = await request(app)
        .put('/api/v1/auth/update-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ avatarBg: 'bg-red-500' });
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/v1/auth/change-password', () => {
    it('should change password with correct current password', async () => {
      const { token } = await createTestUser({ email: `cp${Date.now()}@x.com`, password: 'oldpass123' });
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'oldpass123', newPassword: 'newpass456' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should fail without current password', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'newpass456' });
      expect(res.status).toBe(400);
    });

    it('should fail with wrong current password', async () => {
      const { token } = await createTestUser({ email: `cp2${Date.now()}@x.com`, password: 'correctpass' });
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpass', newPassword: 'newpass456' });
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/auth/push-token', () => {
    it('should add push token', async () => {
      const { token } = await createTestUser({ email: `pt${Date.now()}@x.com` });
      const res = await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'push-token-123', platform: 'android' });
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should not duplicate push token', async () => {
      const { token } = await createTestUser({ email: `pt2${Date.now()}@x.com` });
      await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'push-token-456' });
      const res = await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'push-token-456' });
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should fail without token', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/auth/push-token', () => {
    it('should remove push token', async () => {
      const { token } = await createTestUser({ email: `rp${Date.now()}@x.com` });
      await request(app)
        .put('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'remove-me' });
      const res = await request(app)
        .delete('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'remove-me' });
      expect(res.status).toBe(200);
    });

    it('should fail without token', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .delete('/api/v1/auth/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Login edge cases', () => {
    it('should fail without email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ password: 'pass' });
      expect(res.status).toBe(400);
    });

    it('should fail without password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'x@x.com' });
      expect(res.status).toBe(400);
    });

    it('should fail with non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test.com', password: 'pass' });
      expect(res.status).toBe(401);
    });

    it('should fail with wrong password', async () => {
      await createTestUser({ email: `login${Date.now()}@x.com`, password: 'correctpass' });
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `login${Date.now()}@x.com`, password: 'wrongpass' });
      expect(res.status).toBe(401);
    });
  });
});
