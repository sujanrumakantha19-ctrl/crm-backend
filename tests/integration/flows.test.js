const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser, createPartnerUser } = require('../helpers');
const User = require('../../models/User');
const Lead = require('../../models/Lead');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');
const Task = require('../../models/Task');
const Attendance = require('../../models/Attendance');
const ChannelPartner = require('../../models/ChannelPartner');
const Notification = require('../../models/Notification');
const Group = require('../../models/Group');

const app = buildTestApp();

describe('Integration Tests', () => {
  describe('Auth Flow: Register → Login → GetMe → Update Profile → Change Password', () => {
    it('should complete full auth lifecycle', async () => {
      // 1. Register
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Lifecycle User', initials: 'LU',
          email: `lifecycle${Date.now()}@example.com`,
          phone: '9876543210', password: 'password123',
        });
      expect(regRes.status).toBe(201);
      const token = regRes.body.token;

      // 2. GetMe
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.name).toBe('Lifecycle User');

      // 3. Update Profile
      const updateRes = await request(app)
        .put('/api/v1/auth/update-profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated User' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Updated User');

      // 4. Change Password
      const pwRes = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'password123', newPassword: 'newpass456' });
      expect(pwRes.status).toBe(200);

      // 5. Login with new password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: regRes.body.data.email, password: 'newpass456' });
      expect(loginRes.status).toBe(200);
    });
  });

  describe('Lead Lifecycle: Create → Qualify → Assign → Convert to Customer', () => {
    it('should complete full lead lifecycle', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser();

      // 1. Create lead
      const createRes = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          customerName: 'Lifecycle Lead', phone: '9876543210',
          email: 'lifecycle@lead.com', source: 'Website',
        });
      expect(createRes.status).toBe(201);
      const leadId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('Open');

      // 2. Qualify the lead
      const qualRes = await request(app)
        .put(`/api/v1/leads/${leadId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Qualified' });
      expect(qualRes.status).toBe(200);
      expect(qualRes.body.data.status).toBe('Qualified');

      // 3. Assign to staff
      const assignRes = await request(app)
        .put(`/api/v1/leads/${leadId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ assignedTo: staff.user._id, assignedToName: staff.user.name });
      expect(assignRes.status).toBe(200);

      // 4. Convert to customer
      const customerRes = await request(app)
        .put(`/api/v1/leads/${leadId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Customer', paymentStatus: 'Fully Paid' });
      expect(customerRes.status).toBe(200);
      expect(customerRes.body.data.status).toBe('Customer');
      expect(customerRes.body.data.paymentStatus).toBe('Fully Paid');
    });
  });

  describe('Booking Flow: Create Project → Book Plot → Staff Request → Admin Approve', () => {
    it('should complete full booking approval flow', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser();

      // 1. Create project with plots
      const projRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Booking Project', location: 'Hyderabad', category: 'Open Plots',
          totalLandArea: 100, totalPlots: 5, plotSize: 200,
        });
      expect(projRes.status).toBe(201);
      const projectId = projRes.body.data.id;

      // 2. Get a plot
      const plotsRes = await request(app)
        .get(`/api/v1/plots?projectId=${projectId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(plotsRes.status).toBe(200);
      expect(plotsRes.body.data.length).toBe(5);
      const plotId = plotsRes.body.data[0].id;

      // 3. Staff requests booking (should set to Pending)
      const bookRes = await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          customerName: 'Booking Customer',
          phone: '9876543210',
          paymentStatus: 'Not Paid',
        });
      expect(bookRes.status).toBe(200);
      expect(bookRes.body.data.status).toBe('Pending');
      expect(bookRes.body.data.pendingApproval.customerName).toBe('Booking Customer');

      // 4. Admin checks pending approvals
      const pendingRes = await request(app)
        .get('/api/v1/plots/pending-approvals')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(pendingRes.status).toBe(200);
      expect(pendingRes.body.data.length).toBe(1);

      // 5. Admin approves
      const approveRes = await request(app)
        .put(`/api/v1/plots/${plotId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('Booked');
      expect(approveRes.body.data.bookedBy.name).toBe('Booking Customer');
    });

    it('should handle booking rejection flow', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser();

      const projRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Reject Project', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });

      const plotsRes = await request(app)
        .get(`/api/v1/plots?projectId=${projRes.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      const plotId = plotsRes.body.data[0].id;

      // Staff books
      await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ customerName: 'Rejected Customer', phone: '111' });

      // Admin rejects
      const rejectRes = await request(app)
        .put(`/api/v1/plots/${plotId}/reject`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('Available');
    });
  });

  describe('Task Flow: Create → Assign → Update Status → Add Comment', () => {
    it('should complete full task lifecycle', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser();

      // 1. Create task
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Site Visit', description: 'Visit the project site', priority: 'High' });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.data.id;

      // 2. Assign to staff
      const assignRes = await request(app)
        .put(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ assignee: staff.user._id, assigneeInitials: staff.user.initials });
      expect(assignRes.status).toBe(200);

      // 3. Staff updates status
      const updateRes = await request(app)
        .put(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ status: 'In Progress' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('In Progress');

      // 4. Add comment
      const commentRes = await request(app)
        .put(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          comments: [{
            id: '1', author: staff.user.name, authorInitials: 'TU',
            text: 'Started site visit', timestamp: new Date().toISOString(),
          }],
        });
      expect(commentRes.status).toBe(200);
      expect(commentRes.body.data.comments.length).toBe(1);

      // 5. Mark as done
      const doneRes = await request(app)
        .put(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ status: 'Done' });
      expect(doneRes.status).toBe(200);
      expect(doneRes.body.data.status).toBe('Done');
    });
  });

  describe('Attendance Flow: Check In → Check Out', () => {
    it('should record check-in and check-out', async () => {
      const staff = await createTestUser();

      // Check in
      const inRes = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          staffId: staff.user._id,
          staffName: staff.user.name,
          date: '2024-01-15',
          checkIn: '09:00',
          status: 'Present',
          role: 'staff',
          activityType: 'Office',
        });
      expect(inRes.status).toBe(201);

      // Update with check out
      const outRes = await request(app)
        .put(`/api/v1/attendance/${inRes.body.data.id}`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ checkOut: '18:00', duration: '9h' });
      expect(outRes.status).toBe(200);
      expect(outRes.body.data.checkOut).toBe('18:00');
    });
  });

  describe('Group Management Flow: Create → Add Members → Remove → Delete', () => {
    it('should complete full group lifecycle', async () => {
      const admin = await createAdminUser();
      const staff1 = await createTestUser({ email: `s1${Date.now()}@x.com` });
      const staff2 = await createTestUser({ email: `s2${Date.now()}@x.com` });

      // 1. Create group
      const createRes = await request(app)
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Field Team', description: 'Field staff' });
      expect(createRes.status).toBe(201);
      const groupId = createRes.body.data.id;

      // 2. Add members
      await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: staff1.user._id });
      await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: staff2.user._id });

      const getRes = await request(app)
        .get(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(getRes.body.data.members.length).toBe(2);

      // 3. Remove a member
      await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${staff2.user._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const afterRemove = await request(app)
        .get(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(afterRemove.body.data.members.length).toBe(1);

      // 4. Delete group
      const delRes = await request(app)
        .delete(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(delRes.status).toBe(200);
      expect(await Group.findById(groupId)).toBeNull();
    });
  });

  describe('Notification Flow: Create → Read → Mark All Read', () => {
    it('should manage notifications through full lifecycle', async () => {
      const admin = await createAdminUser();

      // Create notifications
      await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ type: 'new_lead', message: 'Lead 1' });
      await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ type: 'task_assigned', message: 'Task 1' });

      // Check unread
      const unreadRes = await request(app)
        .get('/api/v1/notifications/unread')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(unreadRes.body.data.length).toBeGreaterThanOrEqual(2);

      // Mark one as read
      if (unreadRes.body.data.length > 0) {
        const notifId = unreadRes.body.data[0].id;
        const markRes = await request(app)
          .put(`/api/v1/notifications/${notifId}/read`)
          .set('Authorization', `Bearer ${admin.token}`);
        expect(markRes.status).toBe(200);
        expect(markRes.body.data.isRead).toBe(true);
      }

      // Mark all as read
      await request(app)
        .put('/api/v1/notifications/read/all')
        .set('Authorization', `Bearer ${admin.token}`);

      const afterAllRead = await request(app)
        .get('/api/v1/notifications/unread')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(afterAllRead.body.data.length).toBe(0);
    });
  });

  describe('Channel Partner Flow: Create → Update → Filter by City', () => {
    it('should manage channel partners through full lifecycle', async () => {
      const admin = await createAdminUser();

      // Create
      const createRes = await request(app)
        .post('/api/v1/channel-partners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'City Partner', phone: '9876543210',
          email: `cp${Date.now()}@example.com`, city: 'Hyderabad',
        });
      expect(createRes.status).toBe(201);
      const partnerId = createRes.body.data.id;

      // Update
      const updateRes = await request(app)
        .put(`/api/v1/channel-partners/${partnerId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reraId: 'RERA123', totalLeads: 5 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.reraId).toBe('RERA123');

      // Filter by city
      const cityRes = await request(app)
        .get('/api/v1/channel-partners/city/Hyderabad')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(cityRes.status).toBe(200);
      expect(cityRes.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
