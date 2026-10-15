const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Task = require('../../models/Task');
const User = require('../../models/User');
const Notification = require('../../models/Notification');

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

  describe('Staff ownership guard (issue 30)', () => {
    it('should allow staff to update only tasks assigned to them', async () => {
      const task = await Task.create({ title: 'Mine', assignee: staffUser._id });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'In Progress' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('In Progress');
    });

    it('should return 403 when staff tries to update another staff member task', async () => {
      const other = await User.create({
        name: 'Other Staff', initials: 'OS', role: 'staff', email: `os${Date.now()}@x.com`, phone: '333', password: 'password123',
      });
      const task = await Task.create({ title: 'Not Mine', assignee: other._id });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'In Progress' });
      expect(res.status).toBe(403);
    });

    it('should block staff from reassigning or changing project/priority of own task', async () => {
      const other = await User.create({
        name: 'Target', initials: 'TG', role: 'staff', email: `tg${Date.now()}@x.com`, phone: '444', password: 'password123',
      });
      const task = await Task.create({ title: 'Own', assignee: staffUser._id, priority: 'Medium' });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ priority: 'High', assignee: other._id });
      expect(res.status).toBe(200);
      const updated = await Task.findById(task._id);
      expect(String(updated.assignee)).toBe(String(staffUser._id));
      expect(updated.priority).toBe('Medium');
    });
  });

  describe('Task comment notification type (issue 31)', () => {
    it('should create a task_comment notification (not task_assigned) when a comment is added', async () => {
      const task = await Task.create({ title: 'Comment Target', assignee: staffUser._id });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ comments: [{ id: 'c1', author: 'Admin', authorInitials: 'AU', text: 'Nice', timestamp: new Date().toISOString() }] });
      expect(res.status).toBe(200);

      const notif = await Notification.findOne({ entityId: task._id.toString(), entityType: 'Task', userId: staffUser._id });
      expect(notif).not.toBeNull();
      expect(notif.type).toBe('task_comment');
    });
  });

  describe('createTask allow-list (issue 33)', () => {
    it('should ignore injected createdAt / unexpected fields', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Clean Task', createdAt: '2020-01-01', evilField: 'x' });
      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Clean Task');
      expect(res.body.data.evilField).toBeUndefined();
    });
  });

  describe('Task Status Role Restrictions & Deadline Validation', () => {
    it('should reject past deadline on task creation with 400', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Past Deadline Task', dueDate: '2020-01-01' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Task deadline cannot be in the past/i);
    });

    it('should allow current or future deadline on task creation', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dueDateStr = futureDate.toISOString().split('T')[0];

      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Future Deadline Task', dueDate: dueDateStr });
      expect(res.status).toBe(201);
      expect(res.body.data.dueDate).toContain(dueDateStr);
    });

    it('should prevent staff from marking task Done with 403', async () => {
      const task = await Task.create({ title: 'Staff Task', assignee: staffUser._id, status: 'In Progress' });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'Done' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only administrators can mark tasks as Done/i);
    });

    it('should prevent staff from modifying an already Done task with 403', async () => {
      const task = await Task.create({ title: 'Completed Task', assignee: staffUser._id, status: 'Done' });
      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'In Progress' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Completed tasks cannot be modified by staff/i);
    });

    it('should allow admin to mark task as Done and reopen Done task', async () => {
      const task = await Task.create({ title: 'Admin Controlled Task', assignee: staffUser._id, status: 'In Review' });
      const res1 = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Done' });
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('Done');

      const res2 = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'In Progress' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('In Progress');
    });
  });
});

