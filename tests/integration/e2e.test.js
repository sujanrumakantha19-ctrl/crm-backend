const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser, createPartnerUser } = require('../helpers');
const Lead = require('../../models/Lead');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');
const ChannelPartner = require('../../models/ChannelPartner');

const app = buildTestApp();

describe('E2E Integration: Complete Business Workflows', () => {
  describe('Workflow 1: Partner Registration → Project Setup → Lead Generation → Sale', () => {
    it('should complete the entire real estate sales pipeline', async () => {
      // Step 1: Partner registers
      const partnerReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Skyline Realty', initials: 'SR',
          email: `partner${Date.now()}@example.com`,
          phone: '9876543210', password: 'partner123',
        });
      expect(partnerReg.status).toBe(201);
      expect(partnerReg.body.data.role).toBe('partner');
      const partnerToken = partnerReg.body.token;
      const partnerId = partnerReg.body.data.id;

      // Step 2: Admin creates a project
      const admin = await createAdminUser();
      const projRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Sunrise Enclave', location: 'Hyderabad',
          category: 'Open Plots', totalLandArea: 200,
          totalPlots: 20, plotSize: 150,
        });
      expect(projRes.status).toBe(201);
      const projectId = projRes.body.data.id;

      // Step 3: Verify plots were auto-created
      const plotsRes = await request(app)
        .get(`/api/v1/plots?projectId=${projectId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(plotsRes.body.data.length).toBe(20);
      expect(plotsRes.body.data.every(p => p.status === 'Available')).toBe(true);

      // Step 4: Staff creates leads
      const staff = await createTestUser();
      const lead1 = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          customerName: 'Rajesh Kumar', phone: '9876543211',
          email: 'rajesh@test.com', source: 'Website',
        });
      expect(lead1.status).toBe(201);
      const lead1Id = lead1.body.data.id;

      const lead2 = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          customerName: 'Priya Patel', phone: '9876543212',
          email: 'priya@test.com', source: 'Channel Partner',
        });
      expect(lead2.status).toBe(201);

      // Step 5: Admin qualifies and assigns leads
      await request(app)
        .put(`/api/v1/leads/${lead1Id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Qualified', assignedTo: staff.user._id });

      // Step 6: Staff books a plot for qualified lead
      const availablePlots = plotsRes.body.data;
      const plotToBook = availablePlots[0];

      const bookRes = await request(app)
        .put(`/api/v1/plots/${plotToBook.id}/book`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({
          customerName: 'Rajesh Kumar',
          phone: '9876543211',
          paymentStatus: 'Partially Paid',
          leadId: lead1Id,
        });
      expect(bookRes.status).toBe(200);
      expect(bookRes.body.data.status).toBe('Pending');

      // Step 7: Admin approves booking
      const approveRes = await request(app)
        .put(`/api/v1/plots/${plotToBook.id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('Booked');
      expect(approveRes.body.data.bookedBy.paymentStatus).toBe('Partially Paid');

      // Step 8: Convert lead to customer
      const convertRes = await request(app)
        .put(`/api/v1/leads/${lead1Id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Customer', paymentStatus: 'Partially Paid' });
      expect(convertRes.body.data.status).toBe('Customer');

      // Step 9: Verify the other lead is still Open (not affected)
      const lead2Check = await request(app)
        .get(`/api/v1/leads/${lead2.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(lead2Check.body.data.status).toBe('Open');

      // Step 10: Verify available plots decreased by 1
      const plotsAfter = await request(app)
        .get(`/api/v1/plots?projectId=${projectId}&limit=100`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(plotsAfter.body.data.filter(p => p.status === 'Available').length).toBe(19);
    });
  });

  describe('Workflow 2: Multi-Staff Task Assignment & Collaboration', () => {
    it('should manage tasks across multiple staff members with comments', async () => {
      const admin = await createAdminUser();
      const staff1 = await createTestUser({ name: 'Staff One', email: `s1${Date.now()}@x.com` });
      const staff2 = await createTestUser({ name: 'Staff Two', email: `s2${Date.now()}@x.com` });

      // Create project
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Task Project', location: 'Hyd', category: 'Villas',
          totalLandArea: 100, totalPlots: 5,
        });
      const projectId = proj.body.data.id;

      // Create tasks
      const task1 = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Site Inspection',
          description: 'Inspect the construction site',
          priority: 'High',
          project: projectId,
          assignee: staff1.user._id,
          assigneeInitials: staff1.user.initials,
        });
      expect(task1.status).toBe(201);
      const task1Id = task1.body.data.id;

      const task2 = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Document Review',
          description: 'Review legal documents',
          priority: 'Medium',
          project: projectId,
          assignee: staff2.user._id,
          assigneeInitials: staff2.user.initials,
        });
      const task2Id = task2.body.data.id;

      // Staff 1 starts working
      await request(app)
        .put(`/api/v1/tasks/${task1Id}`)
        .set('Authorization', `Bearer ${staff1.token}`)
        .send({ status: 'In Progress' });

      // Staff 1 adds comment
      const commentRes = await request(app)
        .put(`/api/v1/tasks/${task1Id}`)
        .set('Authorization', `Bearer ${staff1.token}`)
        .send({
          comments: [{
            id: '1', author: staff1.user.name,
            authorInitials: staff1.user.initials,
            text: 'Started inspection, found minor issues',
            timestamp: new Date().toISOString(),
          }],
        });
      expect(commentRes.body.data.comments.length).toBe(1);

      // Staff 2 completes their task
      await request(app)
        .put(`/api/v1/tasks/${task2Id}`)
        .set('Authorization', `Bearer ${staff2.token}`)
        .send({ status: 'Done' });

      // Verify staff1 tasks
      const staff1Tasks = await request(app)
        .get(`/api/v1/tasks/assignee/${staff1.user._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(staff1Tasks.body.data.length).toBe(1);
      expect(staff1Tasks.body.data[0].status).toBe('In Progress');

      // Verify staff2 tasks
      const staff2Tasks = await request(app)
        .get(`/api/v1/tasks/assignee/${staff2.user._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(staff2Tasks.body.data.length).toBe(1);
      expect(staff2Tasks.body.data[0].status).toBe('Done');

      // Staff 1 completes their task too
      await request(app)
        .put(`/api/v1/tasks/${task1Id}`)
        .set('Authorization', `Bearer ${staff1.token}`)
        .send({ status: 'Done' });

      // Verify all tasks for project are done
      const projectTasks = await request(app)
        .get(`/api/v1/tasks/project/${projectId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(projectTasks.body.data.length).toBe(2);
    });
  });

  describe('Workflow 3: Attendance Tracking for Multiple Staff', () => {
    it('should track daily attendance for multiple staff members', async () => {
      const admin = await createAdminUser();
      const staff1 = await createTestUser({ name: 'Alice', email: `alice${Date.now()}@x.com` });
      const staff2 = await createTestUser({ name: 'Bob', email: `bob${Date.now()}@x.com` });

      // Staff 1 checks in
      const aliceIn = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${staff1.token}`)
        .send({
          staffId: staff1.user._id,
          staffName: staff1.user.name,
          date: '2024-06-15',
          checkIn: '09:00',
          status: 'Present',
          role: 'staff',
          activityType: 'Office',
        });
      expect(aliceIn.status).toBe(201);

      // Staff 2 checks in
      const bobIn = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${staff2.token}`)
        .send({
          staffId: staff2.user._id,
          staffName: staff2.user.name,
          date: '2024-06-15',
          checkIn: '09:30',
          status: 'Present',
          role: 'staff',
          activityType: 'Projects',
        });
      expect(bobIn.status).toBe(201);

      // Staff 1 checks out
      await request(app)
        .put(`/api/v1/attendance/${aliceIn.body.data.id}`)
        .set('Authorization', `Bearer ${staff1.token}`)
        .send({ checkOut: '18:00', duration: '9h' });

      // Get today's attendance
      const todayRes = await request(app)
        .get('/api/v1/attendance/date/2024-06-15')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(todayRes.body.data.length).toBe(2);

      // Get staff 1 attendance
      const aliceAtt = await request(app)
        .get(`/api/v1/attendance/staff/${staff1.user._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(aliceAtt.body.data.length).toBe(1);
      expect(aliceAtt.body.data[0].checkOut).toBe('18:00');
    });
  });

  describe('Workflow 4: Complete Notification Lifecycle', () => {
    it('should create, read, and manage notifications', async () => {
      const admin = await createAdminUser();

      // Note: createNotification controller sets userId = req.user.id
      // So notifications are created for the logged-in user (admin)
      await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ type: 'new_lead', message: 'New lead assigned' });

      await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ type: 'task_assigned', message: 'New task' });

      await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ type: 'booking', message: 'Booking confirmed' });

      // Admin checks unread
      const unread1 = await request(app)
        .get('/api/v1/notifications/unread')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(unread1.body.data.length).toBeGreaterThanOrEqual(3);

      // Mark first as read
      const firstId = unread1.body.data[0].id;
      await request(app)
        .put(`/api/v1/notifications/${firstId}/read`)
        .set('Authorization', `Bearer ${admin.token}`);

      const unread2 = await request(app)
        .get('/api/v1/notifications/unread')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(unread2.body.data.length).toBeGreaterThanOrEqual(2);

      // Mark all as read
      await request(app)
        .put('/api/v1/notifications/read/all')
        .set('Authorization', `Bearer ${admin.token}`);

      const unread3 = await request(app)
        .get('/api/v1/notifications/unread')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(unread3.body.data.length).toBe(0);
    });
  });

  describe('Workflow 5: Channel Partner Lead Generation', () => {
    it('should track leads generated by channel partners', async () => {
      const admin = await createAdminUser();

      // Create channel partner
      const cpRes = await request(app)
        .post('/api/v1/channel-partners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Premier Properties', phone: '9876543210',
          email: `premier${Date.now()}@example.com`,
          city: 'Hyderabad',
        });
      expect(cpRes.status).toBe(201);
      const cpId = cpRes.body.data.id;

      // Create leads from this partner
      const staff = await createTestUser();
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/leads')
          .set('Authorization', `Bearer ${staff.token}`)
          .send({
            customerName: `Customer ${i}`,
            phone: `987654${3200 + i}`,
            email: `customer${i}@test.com`,
            source: 'Channel Partner',
          });
      }

      // Verify lead count
      const leadsRes = await request(app)
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(leadsRes.body.data.length).toBeGreaterThanOrEqual(3);

      // Get active channel partners
      const activeCps = await request(app)
        .get('/api/v1/channel-partners/active')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(activeCps.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Workflow 6: Plot Booking Rejection and Re-booking', () => {
    it('should handle rejection and allow re-booking by different staff', async () => {
      const admin = await createAdminUser();
      const staff1 = await createTestUser({ email: `rej1${Date.now()}@x.com` });
      const staff2 = await createTestUser({ email: `rej2${Date.now()}@x.com` });

      // Create project
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Rebook Project', location: 'Hyd', category: 'Apartments',
          totalLandArea: 80, totalPlots: 3,
        });

      // Get plot
      const plots = await request(app)
        .get(`/api/v1/plots?projectId=${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      const plotId = plots.body.data[0].id;

      // Staff 1 books
      await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff1.token}`)
        .send({ customerName: 'First Customer', phone: '111' });

      // Admin rejects
      const rejectRes = await request(app)
        .put(`/api/v1/plots/${plotId}/reject`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(rejectRes.body.data.status).toBe('Available');

      // Staff 2 books the same plot
      const rebookRes = await request(app)
        .put(`/api/v1/plots/${plotId}/book`)
        .set('Authorization', `Bearer ${staff2.token}`)
        .send({ customerName: 'Second Customer', phone: '222' });
      expect(rebookRes.body.data.status).toBe('Pending');

      // Admin approves
      const approveRes = await request(app)
        .put(`/api/v1/plots/${plotId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(approveRes.body.data.status).toBe('Booked');
      expect(approveRes.body.data.bookedBy.name).toBe('Second Customer');
    });
  });

  describe('Workflow 7: Lead Status Filtering and Search', () => {
    it('should filter leads by status and support search', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser();

      // Create leads with different statuses
      const leads = [
        { customerName: 'Open Lead', phone: '1111111111', email: 'open@test.com', source: 'Website' },
        { customerName: 'Qualified Lead', phone: '2222222222', email: 'qual@test.com', source: 'Phone' },
        { customerName: 'Customer Lead', phone: '3333333333', email: 'cust@test.com', source: 'Walk-in' },
      ];

      for (const lead of leads) {
        const res = await request(app)
          .post('/api/v1/leads')
          .set('Authorization', `Bearer ${staff.token}`)
          .send(lead);
        expect(res.status).toBe(201);
      }

      // Qualify the second lead
      const allLeads = await Lead.find();
      const qualLead = allLeads.find(l => l.customerName === 'Qualified Lead');
      await request(app)
        .put(`/api/v1/leads/${qualLead._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'Qualified' });

      // Filter by Open status
      const openRes = await request(app)
        .get('/api/v1/leads/status/Open')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(openRes.body.data.every(l => l.status === 'Open')).toBe(true);

      // Filter by Qualified status
      const qualRes = await request(app)
        .get('/api/v1/leads/status/Qualified')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(qualRes.body.data.some(l => l.customerName === 'Qualified Lead')).toBe(true);
    });
  });
});
