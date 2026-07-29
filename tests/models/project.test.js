const mongoose = require('mongoose');
const Project = require('../../models/Project');

const validProjectData = {
  name: 'Test Project',
  location: 'Hyderabad',
  totalLandArea: 100,
  totalPlots: 50,
};

describe('Project Model', () => {
  describe('Schema Validation', () => {
    it('should create a project with valid data', async () => {
      const project = await Project.create(validProjectData);
      expect(project.name).toBe('Test Project');
      expect(project.location).toBe('Hyderabad');
      expect(project.totalLandArea).toBe(100);
      expect(project.totalPlots).toBe(50);
    });

    it('should fail without name', async () => {
      await expect(Project.create({ location: 'Hyderabad', totalLandArea: 100, totalPlots: 50 })).rejects.toThrow();
    });

    it('should fail without location', async () => {
      await expect(Project.create({ name: 'Test', totalLandArea: 100, totalPlots: 50 })).rejects.toThrow();
    });

    it('should fail without totalLandArea', async () => {
      await expect(Project.create({ name: 'Test', location: 'Hyd', totalPlots: 50 })).rejects.toThrow();
    });

    it('should fail without totalPlots', async () => {
      await expect(Project.create({ name: 'Test', location: 'Hyd', totalLandArea: 100 })).rejects.toThrow();
    });

    it('should default status to Upcoming', async () => {
      const project = await Project.create(validProjectData);
      expect(project.status).toBe('Upcoming');
    });

    it('should default isEnabled to true', async () => {
      const project = await Project.create(validProjectData);
      expect(project.isEnabled).toBe(true);
    });

    it('should accept valid status enum', async () => {
      const project = await Project.create({ ...validProjectData, status: 'Active' });
      expect(project.status).toBe('Active');
    });

    it('should reject invalid status', async () => {
      await expect(Project.create({ ...validProjectData, status: 'Invalid' })).rejects.toThrow();
    });

    it('should accept valid category', async () => {
      const project = await Project.create({ ...validProjectData, category: 'Open Plots' });
      expect(project.category).toBe('Open Plots');
    });

    it('should reject invalid category', async () => {
      await expect(Project.create({ ...validProjectData, category: 'Invalid' })).rejects.toThrow();
    });
  });

  describe('Owner Info', () => {
    it('should store owner info', async () => {
      const project = await Project.create({
        ...validProjectData,
        owner: {
          name: 'Owner Name',
          phone: '9876543210',
          email: 'owner@example.com',
        },
      });
      expect(project.owner.name).toBe('Owner Name');
    });
  });

  describe('JSON Serialization', () => {
    it('should include id instead of _id', async () => {
      const project = await Project.create(validProjectData);
      const json = project.toJSON();
      expect(json.id).toBeDefined();
      expect(json._id).toBeUndefined();
    });
  });
});
