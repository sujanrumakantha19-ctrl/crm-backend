const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Plot = require('../../models/Plot');
const Project = require('../../models/Project');
const Lead = require('../../models/Lead');

const app = buildTestApp();

async function createProjectWithPlots(count = 3) {
  const project = await Project.create({
    name: `MP ${Date.now()}`,
    location: 'Hyd',
    totalLandArea: 100,
    totalPlots: count,
  });
  const plots = [];
  for (let i = 1; i <= count; i += 1) {
    plots.push(await Plot.create({
      projectId: project._id,
      plotNumber: `M${i}-${Date.now()}`,
      status: 'Available',
    }));
  }
  return { project, plots };
}

describe('Multi-plot booking', () => {
  it('admin books two plots for the same lead without releasing the first', async () => {
    const admin = await createAdminUser();
    const { plots } = await createProjectWithPlots(2);
    const [plotA, plotB] = plots;
    const lead = await Lead.create({
      customerName: 'Multi Admin',
      phone: '9000000001',
      email: `ma${Date.now()}@x.com`,
      status: 'Qualified',
    });

    const bookA = await request(app)
      .put(`/api/v1/plots/${plotA._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });
    expect(bookA.status).toBe(200);
    expect(bookA.body.data.status).toBe('Booked');

    const bookB = await request(app)
      .put(`/api/v1/plots/${plotB._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });
    expect(bookB.status).toBe(200);
    expect(bookB.body.data.status).toBe('Booked');

    const refreshedA = await Plot.findById(plotA._id);
    const refreshedB = await Plot.findById(plotB._id);
    const refreshedLead = await Lead.findById(lead._id);
    expect(refreshedA.status).toBe('Booked');
    expect(refreshedB.status).toBe('Booked');
    const ids = (refreshedLead.plotIds || []).map((id) => String(id));
    expect(ids).toEqual(expect.arrayContaining([String(plotA._id), String(plotB._id)]));
    expect(String(refreshedLead.plotId)).toBe(String(plotB._id));
    expect(refreshedLead.status).toBe('Customer');
  });

  it('staff books A (pending), admin approves A, staff books B (pending) without releasing A', async () => {
    const admin = await createAdminUser();
    const staff = await createTestUser({ email: `st${Date.now()}@x.com` });
    const { plots } = await createProjectWithPlots(2);
    const [plotA, plotB] = plots;
    const lead = await Lead.create({
      customerName: 'Multi Staff',
      phone: '9000000002',
      email: `ms${Date.now()}@x.com`,
      status: 'Qualified',
      assignedTo: staff.user._id,
    });

    const bookA = await request(app)
      .put(`/api/v1/plots/${plotA._id}/book`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });
    expect(bookA.status).toBe(200);
    expect(bookA.body.data.status).toBe('Pending');

    const approveA = await request(app)
      .put(`/api/v1/plots/${plotA._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approveA.status).toBe(200);
    expect(approveA.body.data.status).toBe('Booked');

    const bookB = await request(app)
      .put(`/api/v1/plots/${plotB._id}/book`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });
    expect(bookB.status).toBe(200);
    expect(bookB.body.data.status).toBe('Pending');

    const refreshedA = await Plot.findById(plotA._id);
    const refreshedB = await Plot.findById(plotB._id);
    expect(refreshedA.status).toBe('Booked');
    expect(refreshedB.status).toBe('Pending');

    const approveB = await request(app)
      .put(`/api/v1/plots/${plotB._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approveB.status).toBe(200);

    const afterA = await Plot.findById(plotA._id);
    const afterB = await Plot.findById(plotB._id);
    const refreshedLead = await Lead.findById(lead._id);
    expect(afterA.status).toBe('Booked');
    expect(afterB.status).toBe('Booked');
    expect(refreshedLead.status).toBe('Customer');
    const ids = (refreshedLead.plotIds || []).map((id) => String(id));
    expect(ids).toEqual(expect.arrayContaining([String(plotA._id), String(plotB._id)]));
  });

  it('reject/cancel of plot B only unlinks B and keeps A booked', async () => {
    const admin = await createAdminUser();
    const staff = await createTestUser({ email: `rj${Date.now()}@x.com` });
    const { plots } = await createProjectWithPlots(2);
    const [plotA, plotB] = plots;
    const lead = await Lead.create({
      customerName: 'Keep A',
      phone: '9000000003',
      email: `ka${Date.now()}@x.com`,
      status: 'Qualified',
      assignedTo: staff.user._id,
    });

    await request(app)
      .put(`/api/v1/plots/${plotA._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });

    await request(app)
      .put(`/api/v1/plots/${plotB._id}/book`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });

    const rejectB = await request(app)
      .put(`/api/v1/plots/${plotB._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(rejectB.status).toBe(200);
    expect(rejectB.body.data.status).toBe('Available');

    let refreshedA = await Plot.findById(plotA._id);
    let refreshedLead = await Lead.findById(lead._id);
    expect(refreshedA.status).toBe('Booked');
    expect(refreshedLead.status).toBe('Customer');
    expect((refreshedLead.plotIds || []).map(String)).toContain(String(plotA._id));
    expect((refreshedLead.plotIds || []).map(String)).not.toContain(String(plotB._id));

    const plotC = await Plot.create({
      projectId: plotA.projectId,
      plotNumber: `MC-${Date.now()}`,
      status: 'Available',
    });
    await request(app)
      .put(`/api/v1/plots/${plotC._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });

    const cancelC = await request(app)
      .put(`/api/v1/plots/${plotC._id}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(cancelC.status).toBe(200);

    refreshedA = await Plot.findById(plotA._id);
    const refreshedC = await Plot.findById(plotC._id);
    refreshedLead = await Lead.findById(lead._id);
    expect(refreshedA.status).toBe('Booked');
    expect(refreshedC.status).toBe('Canceled');
    expect(refreshedLead.status).toBe('Customer');
    expect((refreshedLead.plotIds || []).map(String)).toContain(String(plotA._id));
    expect((refreshedLead.plotIds || []).map(String)).not.toContain(String(plotC._id));
  });

  it('getMyBookings returns every plot linked via bookedBy.leadId', async () => {
    const staff = await createTestUser({ email: `mb${Date.now()}@x.com` });
    const admin = await createAdminUser({ email: `mba${Date.now()}@x.com` });
    const { plots } = await createProjectWithPlots(2);
    const [plotA, plotB] = plots;
    const lead = await Lead.create({
      customerName: 'Staff Customer',
      phone: '9000000004',
      email: `sc${Date.now()}@x.com`,
      status: 'Qualified',
      assignedTo: staff.user._id,
    });

    await request(app)
      .put(`/api/v1/plots/${plotA._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });
    await request(app)
      .put(`/api/v1/plots/${plotB._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });

    const res = await request(app)
      .get('/api/v1/plots/my-bookings')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((p) => String(p.id || p._id));
    expect(numbers).toEqual(expect.arrayContaining([String(plotA._id), String(plotB._id)]));
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it('registerPlot finds the lead even when primary plotId points at another plot', async () => {
    const admin = await createAdminUser();
    const { plots } = await createProjectWithPlots(2);
    const [plotA, plotB] = plots;
    const lead = await Lead.create({
      customerName: 'Reg Multi',
      phone: '9000000005',
      email: `rm${Date.now()}@x.com`,
      status: 'Qualified',
    });

    await request(app)
      .put(`/api/v1/plots/${plotA._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });
    await request(app)
      .put(`/api/v1/plots/${plotB._id}/book`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ leadId: String(lead._id), customerName: lead.customerName, phone: lead.phone, expectedRegistrationDate: '2026-12-31' });

    const reg = await request(app)
      .put(`/api/v1/plots/${plotA._id}/register`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ registrationDate: '2026-09-04' });
    expect(reg.status).toBe(200);
    expect(reg.body.data.status).toBe('Registered');

    const refreshedLead = await Lead.findById(lead._id);
    expect(refreshedLead.followUps.some((f) => f.outcome === 'Registered' && f.notes.includes(plotA.plotNumber))).toBe(true);
  });
});
