const mongoose = require('mongoose');
const Plot = require('../../models/Plot');
const Project = require('../../models/Project');

describe('Plot Model', () => {
  let projectId;

  beforeEach(async () => {
    const project = await Project.create({
      name: 'Test Project',
      location: 'Hyderabad',
      totalLandArea: 100,
      totalPlots: 50,
    });
    projectId = project._id;
  });

  describe('Schema Validation', () => {
    const validPlotData = {
      projectId: null, // set in beforeEach
      plotNumber: '1',
    };

    it('should create a plot with valid data', async () => {
      const plot = await Plot.create({ ...validPlotData, projectId });
      expect(plot.plotNumber).toBe('1');
      expect(plot.status).toBe('Available');
    });

    it('should fail without projectId', async () => {
      await expect(Plot.create({ plotNumber: '1' })).rejects.toThrow();
    });

    it('should fail without plotNumber', async () => {
      await expect(Plot.create({ projectId })).rejects.toThrow();
    });

    it('should default status to Available', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '1' });
      expect(plot.status).toBe('Available');
    });

    it('should default sizeUnit to Sq Yards', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '1' });
      expect(plot.sizeUnit).toBe('Sq Yards');
    });

    it('should accept valid status enum', async () => {
      const plot = await Plot.create({ projectId, plotNumber: '1', status: 'Booked' });
      expect(plot.status).toBe('Booked');
    });

    it('should reject invalid status', async () => {
      await expect(Plot.create({ projectId, plotNumber: '1', status: 'Invalid' })).rejects.toThrow();
    });

    it('should enforce unique plotNumber per project', async () => {
      await Plot.create({ projectId, plotNumber: '1' });
      await expect(Plot.create({ projectId, plotNumber: '1' })).rejects.toThrow();
    });
  });

  describe('Timeline', () => {
    it('should store timeline events', async () => {
      const plot = await Plot.create({
        projectId,
        plotNumber: '1',
        timeline: [
          {
            id: '1',
            type: 'lead_added',
            label: 'Lead added',
            actor: 'John',
            actorRole: 'staff',
            date: '2024-01-01',
            color: 'blue',
          },
        ],
      });
      expect(plot.timeline).toHaveLength(1);
      expect(plot.timeline[0].type).toBe('lead_added');
    });
  });

  describe('Pending Approval', () => {
    it('should store pending approval details', async () => {
      const plot = await Plot.create({
        projectId,
        plotNumber: '1',
        status: 'Pending',
        pendingApproval: {
          leadId: 'lead123',
          customerName: 'Customer',
          phone: '1234567890',
          requestedBy: 'Staff',
          requestedAt: '2024-01-01',
          paymentStatus: 'Not Paid',
        },
      });
      expect(plot.pendingApproval.customerName).toBe('Customer');
      expect(plot.pendingApproval.paymentStatus).toBe('Not Paid');
    });
  });

  describe('Booked By', () => {
    it('should store bookedBy details', async () => {
      const plot = await Plot.create({
        projectId,
        plotNumber: '1',
        status: 'Booked',
        bookedBy: {
          name: 'Customer',
          phone: '1234567890',
          paymentStatus: 'Fully Paid',
          type: 'customer',
        },
      });
      expect(plot.bookedBy.name).toBe('Customer');
      expect(plot.bookedBy.paymentStatus).toBe('Fully Paid');
    });
  });
});
