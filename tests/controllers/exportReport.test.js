const request = require('supertest');
const mongoose = require('mongoose');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const User = require('../../models/User');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');
const Lead = require('../../models/Lead');
const ChannelPartner = require('../../models/ChannelPartner');

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

    it('should stream CSV for tab=operations with Metric and Value columns', async () => {
      const res = await request(app)
        .get('/api/v1/export/reports?tab=operations')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('report-bookings-and-loans');
      const lines = res.text.split('\n').filter(l => l.trim().length > 0);
      const header = parseCSVLine(lines[0]);
      expect(header).toEqual(['Metric', 'Value']);
      expect(res.text).toContain('Total Customers (Unique)');
      expect(res.text).toContain('Total Bookings');
    });
  });

  describe('Admin Reports View & Validation (reportView=admin)', () => {
    it('should reject invalid calendar date Feb 30 with 400', async () => {
      const res = await request(app)
        .get('/api/v1/reports/projects?reportView=admin&dateFrom=2026-02-30&dateTo=2026-03-01')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/calendar/i);
    });

    it('should reject invalid month (13) with 400', async () => {
      const res = await request(app)
        .get('/api/v1/reports/summary?reportView=admin&month=13&year=2026')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject reversed date range with 400', async () => {
      const res = await request(app)
        .get('/api/v1/reports/summary?reportView=admin&dateFrom=2026-10-15&dateTo=2026-10-01')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/before or equal/i);
    });

    it('should reject invalid pagination with 400 in admin view', async () => {
      const res = await request(app)
        .get('/api/v1/reports/projects?reportView=admin&page=-1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should forbid staff from passing reportView=admin on operations-metrics', async () => {
      const res = await request(app)
        .get('/api/v1/reports/operations-metrics?reportView=admin')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });

    it('should combine partner leads by sourceId and source name (2+3=5) and retain zero-activity partner', async () => {
      const cpAlpha = await ChannelPartner.create({
        name: 'Partner Alpha',
        phone: '9876543210',
        email: 'alpha@example.com',
        companyName: 'Alpha Corp',
        isActive: true,
      });

      const cpBeta = await ChannelPartner.create({
        name: 'Partner Beta Zero',
        phone: '9876543211',
        email: 'beta@example.com',
        companyName: 'Beta Corp',
        isActive: true,
      });

      // 1 lead with source name
      await Lead.create({
        customerName: 'Customer One',
        phone: '9988112233',
        status: 'Customer',
        sourceType: 'Channel Partner',
        source: 'Partner Alpha',
        assignedTo: staffUser._id,
      });

      // 1 lead with sourceId
      await Lead.create({
        customerName: 'Customer Two',
        phone: '9988112244',
        status: 'Open',
        sourceType: 'Channel Partner',
        sourceId: cpAlpha._id,
        source: 'Partner Alpha',
        assignedTo: staffUser._id,
      });

      // 1 lead with unregistered partner
      await Lead.create({
        customerName: 'Customer Three',
        phone: '9988112255',
        status: 'Open',
        sourceType: 'Channel Partner',
        source: 'Unregistered Agency',
        assignedTo: staffUser._id,
      });

      const res = await request(app)
        .get('/api/v1/reports/channel-partner-performance?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const alphaRow = res.body.data.find(r => r.name === 'Partner Alpha');
      expect(alphaRow).toBeDefined();
      expect(alphaRow.totalLeads).toBe(2);

      const betaRow = res.body.data.find(r => r.name === 'Partner Beta Zero');
      expect(betaRow).toBeDefined();
      expect(betaRow.totalLeads).toBe(0);

      const unattributedRow = res.body.data.find(r => r._id === 'unattributed');
      expect(unattributedRow).toBeDefined();
      expect(unattributedRow.totalLeads).toBe(1);
    });

    it('should keep unmatched explicit sourceId as unattributed even if name matches another partner', async () => {
      const p1 = await ChannelPartner.create({ name: 'Special Partner', email: 'special@partner.com', phone: '9900112233' });
      const fakeId = new mongoose.Types.ObjectId();

      await Lead.create({
        customerName: 'Lead X',
        phone: '9900112244',
        status: 'Open',
        sourceType: 'Channel Partner',
        sourceId: fakeId,
        source: 'Special Partner',
      });

      const res = await request(app)
        .get('/api/v1/reports/channel-partner-performance?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const p1Row = res.body.data.find(r => String(r._id) === String(p1._id));
      expect(p1Row).toBeDefined();
      expect(p1Row.totalLeads).toBe(0);

      const unattributedRow = res.body.data.find(r => r._id === 'unattributed');
      expect(unattributedRow).toBeDefined();
      expect(unattributedRow.totalLeads).toBeGreaterThanOrEqual(1);
    });

    it('should scope leads correctly to project and staff when date filter is applied ($expr collision regression)', async () => {
      const projA = await Project.create({ name: 'Project Scope A', displayId: 'PROJ-SA', location: 'Loc A', status: 'Active', totalPlots: 50, totalLandArea: 5 });
      const projB = await Project.create({ name: 'Project Scope B', displayId: 'PROJ-SB', location: 'Loc B', status: 'Active', totalPlots: 50, totalLandArea: 5 });

      const staffA = await User.create({ name: 'Staff Scope A', initials: 'SA', email: 'staff.sa@test.com', phone: '9911223344', role: 'staff', password: 'password123' });
      const staffB = await User.create({ name: 'Staff Scope B', initials: 'SB', email: 'staff.sb@test.com', phone: '9911223355', role: 'staff', password: 'password123' });

      const d1 = new Date('2026-10-05T10:00:00+05:30');
      const d2 = new Date('2026-10-06T10:00:00+05:30');

      await Lead.create({
        customerName: 'Lead For A',
        phone: '9111111111',
        status: 'Customer',
        projectId: projA._id,
        assignedTo: staffA._id,
        dateAdded: d1,
      });

      await Lead.create({
        customerName: 'Lead For B',
        phone: '9222222222',
        status: 'Open',
        projectId: projB._id,
        assignedTo: staffB._id,
        dateAdded: d2,
      });

      // Filter for October 2026
      const projRes = await request(app)
        .get(`/api/v1/reports/projects?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(projRes.status).toBe(200);

      const rowA = projRes.body.data.find(r => String(r._id) === String(projA._id));
      const rowB = projRes.body.data.find(r => String(r._id) === String(projB._id));
      expect(rowA).toBeDefined();
      expect(rowB).toBeDefined();
      expect(rowA.leadCount).toBe(1);
      expect(rowB.leadCount).toBe(1);

      const staffRes = await request(app)
        .get(`/api/v1/reports/staff?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(staffRes.status).toBe(200);

      const sRowA = staffRes.body.data.find(r => String(r._id) === String(staffA._id));
      const sRowB = staffRes.body.data.find(r => String(r._id) === String(staffB._id));
      expect(sRowA).toBeDefined();
      expect(sRowB).toBeDefined();
      expect(sRowA.assignedLeads).toBe(1);
      expect(sRowA.converted).toBe(1);
      expect(sRowB.assignedLeads).toBe(1);
      expect(sRowB.converted).toBe(0);
    });

    it('should deduplicate same customer in multiple records in getSummary', async () => {
      const dupPhone = '9876543210';
      await Lead.deleteMany({});

      await Lead.create({
        customerName: 'Same Customer Record 1',
        phone: dupPhone,
        status: 'Customer',
      });
      await Lead.create({
        customerName: 'Same Customer Record 2',
        phone: dupPhone,
        status: 'Customer',
      });
      await Lead.create({
        customerName: 'Different Open Lead',
        phone: '9876543211',
        status: 'Open',
      });

      // Legacy view (no reportView=admin)
      const summaryLegacy = await request(app)
        .get('/api/v1/reports/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(summaryLegacy.status).toBe(200);
      expect(summaryLegacy.body.data.totalLeads).toBe(2);
      expect(summaryLegacy.body.data.totalCustomers).toBe(1);

      // Admin view
      const summaryAdmin = await request(app)
        .get('/api/v1/reports/summary?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(summaryAdmin.status).toBe(200);
      expect(summaryAdmin.body.data.totalLeads).toBe(2);
      expect(summaryAdmin.body.data.totalCustomers).toBe(1);
    });

    it('should accurately count loan bookings from distinct plots in project report', async () => {
      const project = await Project.create({ name: 'Loan Plot Project', displayId: 'PROJ-LPP', location: 'Loc L', status: 'Active', totalPlots: 50, totalLandArea: 5 });

      await Plot.create([
        {
          projectId: project._id,
          plotNumber: 'P-101',
          status: 'Booked',
          bookedBy: { name: 'Dual Buyer', phone: '9876111222', paymentMethod: 'LOAN', bookedAt: '2026-10-01' },
        },
        {
          projectId: project._id,
          plotNumber: 'P-102',
          status: 'Booked',
          bookedBy: { name: 'Dual Buyer', phone: '9876111222', paymentMethod: 'LOAN', bookedAt: '2026-10-01' },
        },
      ]);

      const res = await request(app)
        .get('/api/v1/reports/projects?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const pRow = res.body.data.find(r => String(r._id) === String(project._id));
      expect(pRow).toBeDefined();
      expect(pRow.booked).toBe(2);
      expect(pRow.loanBookings).toBe(2);
    });

    it('should distinguish Oct 1 bookings without shifting to Sep 30 in date filter', async () => {
      const proj = await Project.create({ name: 'Date Proj', displayId: 'PROJ-DP', location: 'DP', status: 'Active', totalPlots: 50, totalLandArea: 5 });

      await Plot.create([
        {
          projectId: proj._id,
          plotNumber: 'OCT-01',
          status: 'Booked',
          bookedBy: { name: 'Oct Buyer', phone: '9876000001', bookedAt: '2026-10-01', paymentStatus: 'Fully Paid' },
        },
        {
          projectId: proj._id,
          plotNumber: 'SEP-30',
          status: 'Booked',
          bookedBy: { name: 'Sep Buyer', phone: '9876000002', bookedAt: '2026-09-30', paymentStatus: 'Fully Paid' },
        },
      ]);

      const res = await request(app)
        .get('/api/v1/reports/operations-metrics?dateFrom=2026-10-01&dateTo=2026-10-01&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalBookings).toBe(1);
      expect(res.body.data.totalCustomers).toBe(1);
      expect(res.body.data.bookingPayments.fullyPaid).toBe(1);
    });

    it('should recognize timeline-only booking and ignore cancellation rejection', async () => {
      await Plot.deleteMany({});
      const proj = await Project.create({ name: 'Timeline Proj', displayId: 'PROJ-TP', location: 'TP', status: 'Active', totalPlots: 50, totalLandArea: 5 });

      await Plot.create({
        projectId: proj._id,
        plotNumber: 'TL-10',
        status: 'Booked',
        bookedBy: { name: 'Timeline Buyer', phone: '9876000010' }, // no bookedAt
        timeline: [
          {
            type: 'booking_confirmed',
            label: 'Plot Booked',
            date: '2026-10-10',
          },
        ],
      });

      await Plot.create({
        projectId: proj._id,
        plotNumber: 'TL-CAN',
        status: 'Available',
        timeline: [
          {
            type: 'booking_confirmed',
            label: 'Cancellation Rejected',
            date: '2026-10-10',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/reports/operations-metrics?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalBookings).toBe(1);
      expect(res.body.data.unknownBookingDateCount).toBe(0);
    });

    it('should reject repeated query parameters with 400', async () => {
      const res = await request(app)
        .get('/api/v1/reports/projects?month=1&month=2&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('November project cohort has 0 Loan/Cash bookings when linked leads were acquired in October', async () => {
      await Plot.deleteMany({});
      await Lead.deleteMany({});
      const proj = await Project.create({ name: 'Cohort Proj', displayId: 'PROJ-CP', location: 'CP', status: 'Active', totalPlots: 10, totalLandArea: 1 });
      const plot = await Plot.create({
        projectId: proj._id,
        plotNumber: 'CP-1',
        status: 'Booked',
        bookedBy: { name: 'Cohort Buyer', phone: '9876543210', paymentMethod: 'LOAN', bookedAt: '2026-10-15' },
      });
      // Lead created in October
      await Lead.create({
        customerName: 'Cohort Buyer',
        phone: '9876543210',
        status: 'Customer',
        paymentMethod: 'LOAN',
        projectId: proj._id,
        plotId: plot._id,
        createdAt: new Date('2026-10-15T10:00:00Z'),
      });

      // Query for November
      const novRes = await request(app)
        .get('/api/v1/reports/projects?dateFrom=2026-11-01&dateTo=2026-11-30&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(novRes.status).toBe(200);
      const novRow = novRes.body.data.find(r => String(r._id) === String(proj._id));
      expect(novRow.leadCount).toBe(0);
      expect(novRow.loanBookings).toBe(0);
      expect(novRow.cashBookings).toBe(0);

      // Query for October
      const octRes = await request(app)
        .get('/api/v1/reports/projects?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(octRes.status).toBe(200);
      const octRow = octRes.body.data.find(r => String(r._id) === String(proj._id));
      expect(octRow.leadCount).toBe(1);
      expect(octRow.loanBookings).toBe(1);
    });

    it('Duplicate Customer records + 1 Open lead produce Total Leads 2 and conversion 50% across trend and staff', async () => {
      await Lead.deleteMany({});
      const proj = await Project.create({ name: 'Dedup Proj', displayId: 'PROJ-DP', location: 'DP', status: 'Active', totalPlots: 10, totalLandArea: 1 });
      
      // Customer record 1
      await Lead.create({
        customerName: 'John Doe',
        phone: '9111111111',
        status: 'Customer',
        projectId: proj._id,
        assignedTo: staffUser._id,
        createdAt: new Date('2026-10-05T10:00:00Z'),
      });
      // Customer record 2 (same identity, same day)
      await Lead.create({
        customerName: 'John Doe',
        phone: '9111111111',
        status: 'Customer',
        projectId: proj._id,
        assignedTo: staffUser._id,
        createdAt: new Date('2026-10-05T14:00:00Z'),
      });
      // Open lead (different identity)
      await Lead.create({
        customerName: 'Jane Smith',
        phone: '9222222222',
        status: 'Open',
        projectId: proj._id,
        assignedTo: staffUser._id,
        createdAt: new Date('2026-10-07T10:00:00Z'),
      });

      // Staff report
      const staffRes = await request(app)
        .get('/api/v1/reports/staff?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(staffRes.status).toBe(200);
      const staffRow = staffRes.body.data.find(r => String(r._id) === String(staffUser._id));
      expect(staffRow.assignedLeads).toBe(2);
      expect(staffRow.converted).toBe(1);

      // Leads trend report
      const trendRes = await request(app)
        .get('/api/v1/reports/leads-trend?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(trendRes.status).toBe(200);
      const totalLeadsTrend = trendRes.body.data.reduce((sum, r) => sum + r.totalLeads, 0);
      const totalCustTrend = trendRes.body.data.reduce((sum, r) => sum + r.customers, 0);
      expect(totalLeadsTrend).toBe(2);
      expect(totalCustTrend).toBe(1);
    });

    it('One customer holding multiple plots produces correct distinct booking counts across lead tabs', async () => {
      await Plot.deleteMany({});
      await Lead.deleteMany({});
      const proj = await Project.create({ name: 'MultiPlot Proj', displayId: 'PROJ-MP', location: 'MP', status: 'Active', totalPlots: 10, totalLandArea: 1 });
      const plot1 = await Plot.create({
        projectId: proj._id,
        plotNumber: 'MP-1',
        status: 'Booked',
        bookedBy: { name: 'Multi Buyer', phone: '9333333333', paymentMethod: 'LOAN', bookedAt: '2026-10-10' },
      });
      const plot2 = await Plot.create({
        projectId: proj._id,
        plotNumber: 'MP-2',
        status: 'Booked',
        bookedBy: { name: 'Multi Buyer', phone: '9333333333', paymentMethod: 'LOAN', bookedAt: '2026-10-10' },
      });

      // One customer lead holding both plots
      await Lead.create({
        customerName: 'Multi Buyer',
        phone: '9333333333',
        status: 'Customer',
        paymentMethod: 'LOAN',
        projectId: proj._id,
        plotId: plot1._id,
        plotIds: [plot1._id, plot2._id],
        sourceType: 'Website',
        createdAt: new Date('2026-10-10T10:00:00Z'),
      });

      const trendRes = await request(app)
        .get('/api/v1/reports/leads-trend?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(trendRes.status).toBe(200);
      const trendRow = trendRes.body.data[0];
      expect(trendRow.totalLeads).toBe(1);
      expect(trendRow.plotsBooked).toBe(2);
      expect(trendRow.loanBookings).toBe(2);
      expect(trendRow.cashBookings).toBe(0);

      const contribRes = await request(app)
        .get('/api/v1/reports/lead-contribution?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(contribRes.status).toBe(200);
      const contribRow = contribRes.body.data.find(r => r.sourceType === 'Website');
      expect(contribRow.totalLeads).toBe(1);
      expect(contribRow.plotsBooked).toBe(2);
      expect(contribRow.loanBookings).toBe(2);
    });

    it('Clearing filters does not change operations customer definition (remains plot buyer identity)', async () => {
      await Plot.deleteMany({});
      const proj = await Project.create({ name: 'Ops Dedup Proj', displayId: 'PROJ-OD', location: 'OD', status: 'Active', totalPlots: 10, totalLandArea: 1 });
      // Same buyer books 2 plots
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'OD-1',
        status: 'Booked',
        bookedBy: { name: 'Repeat Buyer', phone: '9444444444', paymentMethod: 'LOAN', paymentStatus: 'Fully Paid' },
      });
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'OD-2',
        status: 'Booked',
        bookedBy: { name: 'Repeat Buyer', phone: '9444444444', paymentMethod: 'CASH', paymentStatus: 'Fully Paid' },
      });

      // Unfiltered operations metrics
      const res = await request(app)
        .get('/api/v1/reports/operations-metrics?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalBookings).toBe(2);
      expect(res.body.data.totalCustomers).toBe(1);
    });

    it('Two buyers with placeholder phones remain distinct by name in operations metrics', async () => {
      await Plot.deleteMany({});
      const proj = await Project.create({ name: 'Placeholder Proj', displayId: 'PROJ-PP', location: 'PP', status: 'Active', totalPlots: 10, totalLandArea: 1 });
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'PP-1',
        status: 'Booked',
        bookedBy: { name: 'Buyer Alpha', phone: '0000000000', paymentMethod: 'LOAN', paymentStatus: 'Partially Paid' },
      });
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'PP-2',
        status: 'Booked',
        bookedBy: { name: 'Buyer Beta', phone: '0000000000', paymentMethod: 'CASH', paymentStatus: 'Not Paid' },
      });

      const res = await request(app)
        .get('/api/v1/reports/operations-metrics?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalBookings).toBe(2);
      expect(res.body.data.totalCustomers).toBe(2);
    });

    it('Latest November timeline booking event excludes the plot from October date filter when bookedBy.bookedAt is absent', async () => {
      await Plot.deleteMany({});
      const proj = await Project.create({ name: 'Timeline Order Proj', displayId: 'PROJ-TO', location: 'TO', status: 'Active', totalPlots: 10, totalLandArea: 1 });
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'TO-1',
        status: 'Booked',
        bookedBy: { name: 'Event Buyer', phone: '9555555555' }, // No bookedAt
        timeline: [
          { type: 'booking_confirmed', label: 'Initial Booking', date: '2026-10-15' },
          { type: 'booking_confirmed', label: 'Re-booking', date: '2026-11-05' },
        ],
      });

      // Filter for October: latest event was Nov 5, so should be excluded
      const octRes = await request(app)
        .get('/api/v1/reports/operations-metrics?dateFrom=2026-10-01&dateTo=2026-10-31&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(octRes.status).toBe(200);
      expect(octRes.body.data.totalBookings).toBe(0);

      // Filter for November: should be included
      const novRes = await request(app)
        .get('/api/v1/reports/operations-metrics?dateFrom=2026-11-01&dateTo=2026-11-30&reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(novRes.status).toBe(200);
      expect(novRes.body.data.totalBookings).toBe(1);
    });

    it('Fully Paid appears in operations metrics and payment breakdown reconciles', async () => {
      await Plot.deleteMany({});
      const proj = await Project.create({ name: 'Pay Breakdown Proj', displayId: 'PROJ-PB', location: 'PB', status: 'Active', totalPlots: 10, totalLandArea: 1 });
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'PB-1',
        status: 'Booked',
        bookedBy: { name: 'Full Buyer', phone: '9666666661', paymentMethod: 'LOAN', paymentStatus: 'Fully Paid' },
      });
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'PB-2',
        status: 'Booked',
        bookedBy: { name: 'Partial Buyer', phone: '9666666662', paymentMethod: 'LOAN', paymentStatus: 'Partially Paid' },
      });
      await Plot.create({
        projectId: proj._id,
        plotNumber: 'PB-3',
        status: 'Booked',
        bookedBy: { name: 'Unpaid Buyer', phone: '9666666663', paymentMethod: 'CASH', paymentStatus: 'Not Paid' },
      });

      const res = await request(app)
        .get('/api/v1/reports/operations-metrics?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.bookingPayments.fullyPaid).toBe(1);
      expect(res.body.data.bookingPayments.partiallyPaid).toBe(1);
      expect(res.body.data.bookingPayments.notPaid).toBe(1);
      const totalPaymentPlots = res.body.data.bookingPayments.fullyPaid + res.body.data.bookingPayments.partiallyPaid + res.body.data.bookingPayments.notPaid;
      expect(totalPaymentPlots).toBe(res.body.data.totalBookings);
    });

    it('Filtered CSV export contains complete filtered rows matching JSON calculations', async () => {
      const res = await request(app)
        .get('/api/v1/export/reports?tab=projects&dateFrom=2026-10-01&dateTo=2026-10-31')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/csv');
      const lines = res.text.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const headers = parseCSVLine(lines[0]);
      expect(headers).toContain('Project');
      expect(headers).toContain('Loan');
      expect(headers).toContain('Cash');
    });

    it('Channel partner and lead contribution pages remain deterministic with tied values', async () => {
      await Lead.deleteMany({});
      await ChannelPartner.deleteMany({});
      const cp1 = await ChannelPartner.create({ name: 'CP Alpha', phone: '9777777771', email: 'cpalpha@example.com', status: 'Active' });
      const cp2 = await ChannelPartner.create({ name: 'CP Beta', phone: '9777777772', email: 'cpbeta@example.com', status: 'Active' });

      // Create identical leads for both
      await Lead.create({ customerName: 'L1', phone: '9777777711', status: 'Open', sourceType: 'Channel Partner', sourceId: cp1._id });
      await Lead.create({ customerName: 'L2', phone: '9777777722', status: 'Open', sourceType: 'Channel Partner', sourceId: cp2._id });

      const res = await request(app)
        .get('/api/v1/reports/channel-partner-performance?reportView=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      // Both have totalLeads = 1, order is deterministic by secondary tie-breaker
      expect(res.body.data[0].totalLeads).toBe(1);
      expect(res.body.data[1].totalLeads).toBe(1);
    });
  });
});
