const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');
const Lead = require('../../models/Lead');

const app = buildTestApp();

function parseCSVLine(line) {
  return line.replace(/^\uFEFF/, '').split('","').map(part => part.replace(/^"|"$/g, ''));
}

describe('Reports & Export endpoints', () => {
  let adminToken, staffToken, staffUser;
  let project, bookedPlot;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
    staffUser = staff.user;

    project = await Project.create({
      name: 'Export Test Project',
      location: 'Hyderabad',
      totalLandArea: 1000,
      landAreaUnit: 'Sq Yards',
      totalPlots: 2,
      status: 'Active',
    });

    const availablePlot = await Plot.create({ projectId: project._id, plotNumber: 'A1', status: 'Available' });
    bookedPlot = await Plot.create({ projectId: project._id, plotNumber: 'A2', status: 'Booked' });

    const lead = await Lead.create({
      customerName: 'Export Customer',
      phone: `98${Date.now()}`,
      status: 'Customer',
      paymentMethod: 'LOAN',
      projectId: project._id,
      plotId: bookedPlot._id,
      sourceType: 'Staff',
      assignedTo: staffUser._id,
    });

    bookedPlot.bookedBy = {
      name: lead.customerName,
      phone: lead.phone,
      paymentMethod: 'LOAN',
      paymentStatus: 'Not Paid',
      leadId: String(lead._id),
      bookedAt: new Date().toISOString().split('T')[0],
    };
    await bookedPlot.save();

    void availablePlot;
  });

  describe('GET /api/v1/reports (auth)', () => {
    it('should return 403 for staff on report routes', async () => {
      const res = await request(app)
        .get('/api/v1/reports/projects')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });

    it('should return paginated projects report for admin', async () => {
      const res = await request(app)
        .get('/api/v1/reports/projects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('should return summary cards for admin', async () => {
      const res = await request(app)
        .get('/api/v1/reports/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalProjects).toBeGreaterThanOrEqual(1);
    });

    it('should return operations metrics for admin', async () => {
      const res = await request(app)
        .get('/api/v1/reports/operations-metrics')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalBookings).toBeGreaterThanOrEqual(1);
      expect(res.body.data.totalLoans).toBeGreaterThanOrEqual(1);
      expect(res.body.data.registrationPending).toBeGreaterThanOrEqual(1);
      expect(res.body.data.todaysRegistrations).toBeDefined();
      expect(res.body.data.pendingPaymentRegistrations).toBeDefined();
      expect(res.body.data.bookingPayments).toBeDefined();
    });

    it('should return dashboard lead charts for admin', async () => {
      const res = await request(app)
        .get('/api/v1/reports/dashboard-charts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.monthlyTrend)).toBe(true);
      expect(Array.isArray(res.body.data.sourceBreakdown)).toBe(true);
      expect(res.body.data.totalLeads).toBeGreaterThanOrEqual(0);
    });

    it('should return 403 for staff on dashboard-charts', async () => {
      const res = await request(app)
        .get('/api/v1/reports/dashboard-charts')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow staff on operations-metrics with scoped counts', async () => {
      const res = await request(app)
        .get('/api/v1/reports/operations-metrics')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalBookings).toBeGreaterThanOrEqual(1);
    });

    it('should still return 403 for staff on legacy admin report routes', async () => {
      const res = await request(app)
        .get('/api/v1/reports/projects')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/export/reports (auth)', () => {
    it('should return 401 without a token', async () => {
      const res = await request(app).get('/api/v1/export/reports?tab=projects');
      expect(res.status).toBe(401);
    });

    it('should accept token via ?token= query param fallback', async () => {
      const res = await request(app)
        .get(`/api/v1/export/reports?tab=projects&token=${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('should return 400 for an invalid tab', async () => {
      const res = await request(app)
        .get('/api/v1/export/reports?tab=nope')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/export/reports?tab=projects', () => {
    it('should export CSV with canonical booked/registered/available counts', async () => {
      const res = await request(app)
        .get('/api/v1/export/reports?tab=projects')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('report-projects');

      const lines = res.text.split('\n').filter(l => l.trim().length > 0);
      const header = parseCSVLine(lines[0]);
      expect(header).toContain('Project');
      expect(header).toContain('Booked');
      expect(header).toContain('Registered');
      expect(header).toContain('Available');
      expect(header).toContain('Loan');
      expect(header).toContain('Cash');

      const row = parseCSVLine(lines[1]);
      expect(row[0]).toBe('Export Test Project');
      // 0 Project,1 Created Date,2 Location,3 Status,4 Total Sq.Ft,5 Total Plots,
      // 6 Booked,7 Registered,8 Available,9 Leads,10 Loan,11 Cash
      expect(row[5]).toBe('2');
      expect(row[6]).toBe('1');
      expect(row[7]).toBe('0');
      expect(row[8]).toBe('1');
      expect(row[9]).toBe('1');
      expect(row[10]).toBe('1');
      expect(row[11]).toBe('0');
    });

    it('should forward month/year/dateFrom/dateTo filters without error', async () => {
      const res = await request(app)
        .get('/api/v1/export/reports?tab=projects&month=8&year=2026&dateFrom=2026-08-01&dateTo=2026-08-31')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Export Test Project');
    });
  });

  describe('GET /api/v1/export/reports (all tabs)', () => {
    const tabs = ['staff', 'attendance', 'leads-trend', 'lead-contribution', 'channel-partner-performance'];

    it.each(tabs)('should stream CSV for tab=%s', async (tab) => {
      const res = await request(app)
        .get(`/api/v1/export/reports?tab=${tab}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/export/* smoke tests', () => {
    it('should export leads CSV', async () => {
      const res = await request(app)
        .get('/api/v1/export/leads')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('should export loans CSV (Customer + LOAN only) via /export/customers', async () => {
      await Lead.create({
        customerName: 'Cash Only Customer',
        phone: `97${Date.now()}`,
        status: 'Customer',
        paymentMethod: 'CASH',
        sourceType: 'Direct',
      });

      const res = await request(app)
        .get('/api/v1/export/customers?status=Customer&paymentMethod=LOAN')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('customers');
      expect(res.text).toContain('Export Customer');
      expect(res.text).not.toContain('Cash Only Customer');
    });

    it('should export projects CSV with unique project rows and plot metrics', async () => {
      const res = await request(app)
        .get('/api/v1/export/projects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('projects');

      const lines = res.text.replace(/^\uFEFF/, '').split('\n').filter(Boolean);
      // Header + exactly 1 row for the 1 created test project
      expect(lines.length).toBe(2);
      const header = parseCSVLine(lines[0]);
      expect(header).toContain('Project Name');
      expect(header).toContain('Status');
      expect(header).toContain('Location');
      expect(header).toContain('Total Plots');
      expect(header).toContain('Available Plots');
      expect(header).toContain('Booked Plots');
      expect(header).toContain('Registered Plots');

      const row = parseCSVLine(lines[1]);
      expect(row[header.indexOf('Project Name')]).toBe('Export Test Project');
      expect(row[header.indexOf('Total Plots')]).toBe('2');
      expect(row[header.indexOf('Available Plots')]).toBe('1');
      expect(row[header.indexOf('Booked Plots')]).toBe('1');
    });

    it('should export single project detail CSV', async () => {
      const res = await request(app)
        .get(`/api/v1/export/project-detail?id=${project._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const header = parseCSVLine(res.text.replace(/^\uFEFF/, '').split('\n')[0]);
      expect(header).toContain('Plot Number');
      expect(header).toContain('Booked Customer');
    });

    it('should honor project export filters', async () => {
      const res = await request(app)
        .get('/api/v1/export/projects?search=Export%20Test')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const lines = res.text.replace(/^\uFEFF/, '').split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const header = parseCSVLine(lines[0]);
      const projectNameIdx = header.indexOf('Project Name');
      for (let i = 1; i < lines.length; i += 1) {
        const row = parseCSVLine(lines[i]);
        expect(row[projectNameIdx]).toBe('Export Test Project');
      }
    });

    it('should export channel-partners CSV', async () => {
      const res = await request(app)
        .get('/api/v1/export/channel-partners')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });
});
