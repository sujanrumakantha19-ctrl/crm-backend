const {
  buildProjectExportFilter,
  buildProjectDetailExportDocsForProject,
} = require('../../utils/projectDetailExport');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');
const Lead = require('../../models/Lead');

describe('projectDetailExport utility', () => {
  it('should build filter from list query params', () => {
    const filter = buildProjectExportFilter({
      status: 'Active',
      location: 'Hyderabad',
      category: 'Open Plots',
      search: 'Green',
    });
    expect(filter.status).toBe('Active');
    expect(filter.location).toBe('Hyderabad');
    expect(filter.category).toBe('Open Plots');
    expect(filter.$or).toBeDefined();
  });

  it('should build one row per plot with linked lead and staff', async () => {
    const project = await Project.create({
      name: 'Utility Export Project',
      location: 'Hyderabad',
      totalLandArea: 10,
      totalPlots: 1,
      dtcpNumber: 'DTCP-UTIL-1',
    });
    const plot = await Plot.create({
      projectId: project._id,
      plotNumber: 'U1',
      status: 'Booked',
      bookedBy: {
        name: 'Utility Customer',
        phone: '9876500000',
        paymentStatus: 'Not Paid',
        paymentMethod: 'LOAN',
        bookedAt: '2026-09-06',
      },
    });
    const lead = await Lead.create({
      customerName: 'Utility Customer',
      phone: '9876500000',
      status: 'Customer',
      projectId: project._id,
      plotId: plot._id,
      assignedToName: 'Staff One',
      assignedToDisplayId: 'STF-1',
    });
    plot.bookedBy.leadId = String(lead._id);
    await plot.save();

    const docs = await buildProjectDetailExportDocsForProject(project._id);
    expect(docs.length).toBe(1);
    expect(docs[0].project.name).toBe('Utility Export Project');
    expect(docs[0].project.dtcpNumber).toBe('DTCP-UTIL-1');
    expect(docs[0].plot.plotNumber).toBe('U1');
    expect(docs[0].lead.customerName).toBe('Utility Customer');
    expect(docs[0].lead.assignedToName).toBe('Staff One');
  });
});
