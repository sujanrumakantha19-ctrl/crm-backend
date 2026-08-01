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
  let adminToken, staffToken;
  let project, bookedPlot;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;

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

    await Lead.create({
      customerName: 'Export Customer',
      phone: `98${Date.now()}`,
      status: 'Customer',
      paymentMethod: 'LOAN',
      projectId: project._id,
      plotId: bookedPlot._id,
      sourceType: 'Staff',
    });

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

    it('should export projects CSV', async () => {
      const res = await request(app)
        .get('/api/v1/export/projects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('projects');
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
