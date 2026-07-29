const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Task = require('../../models/Task');
const User = require('../../models/User');

const app = buildTestApp();

describe('Task Controller', () => {
  let adminToken, staffToken, staffUser;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
    staffUser = staff.user;
  });

  describe('POST /api/v1/tasks', () => {
    it('should create a task', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Test Task', description: 'Description', priority: 'High' });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Test Task');
      expect(res.body.data.status).toBe('To Do');
      expect(res.body.data.priority).toBe('High');
    });

    it('should fail without title', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/tasks', () => {
    it('should return paginated tasks', async () => {
      await Task.create([{ title: 'T1' }, { title: 'T2' }]);
      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    it('should return a single task', async () => {
      const task = await Task.create({ title: 'Single' });
      const res = await request(app)
        .get(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Single');
    });
  });

  describe('PUT /api/v1/tasks/:id', () => {
    it('should update a task', async () => {
      const task = await Task.create({ title: 'Old' });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New', status: 'In Progress' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('New');
      expect(res.body.data.status).toBe('In Progress');
    });

    it('should update comments array', async () => {
      const task = await Task.create({ title: 'With Comments' });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          comments: [{
            id: '1', author: 'Admin', authorInitials: 'AU',
            text: 'Great work', timestamp: new Date().toISOString(),
          }],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.comments).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    it('should delete a task as admin', async () => {
      const task = await Task.create({ title: 'Delete Me' });
      const res = await request(app)
        .delete(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await Task.findById(task._id)).toBeNull();
    });

    it('should return 403 for staff deleting task', async () => {
      const task = await Task.create({ title: 'Staff Cant Delete' });
      const res = await request(app)
        .delete(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/tasks/assignee/:assigneeId', () => {
    it('should filter tasks by assignee', async () => {
      await Task.create({ title: 'My Task', assignee: staffUser._id });
      await Task.create({ title: 'Other Task' });
      const res = await request(app)
        .get(`/api/v1/tasks/assignee/${staffUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/tasks/status/:status', () => {
    it('should filter tasks by status', async () => {
      await Task.create([{ title: 'Todo', status: 'To Do' }, { title: 'Done', status: 'Done' }]);
      const res = await request(app)
        .get('/api/v1/tasks/status/Done')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(t => t.status === 'Done')).toBe(true);
    });
  });
});
