const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');

const app = buildTestApp();

describe('Project Controller', () => {
  let adminToken, staffToken;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
  });

  describe('POST /api/v1/projects', () => {
    it('should create a project and auto-generate plots', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Project',
          location: 'Hyderabad',
          category: 'Open Plots',
          totalLandArea: 100,
          totalPlots: 10,
          plotSize: 200,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('New Project');
      expect(res.body.data.status).toBe('Upcoming');

      // Verify plots were auto-created
      const plots = await Plot.find({ projectId: res.body.data.id });
      expect(plots.length).toBe(10);
      expect(plots[0].status).toBe('Available');
    });

    it('should create project with 0 plots when totalPlots is 0', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'No Plots', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 0,
        });

      expect(res.status).toBe(201);
      const plots = await Plot.find({ projectId: res.body.data.id });
      expect(plots.length).toBe(0);
    });

    it('should fail without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Incomplete' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/projects', () => {
    it('should return paginated projects', async () => {
      await Project.create([
        { name: 'P1', location: 'L1', totalLandArea: 10, totalPlots: 5 },
        { name: 'P2', location: 'L2', totalLandArea: 20, totalPlots: 10 },
      ]);

      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/projects/:id', () => {
    it('should return a single project with availablePlots', async () => {
      const project = await Project.create({
        name: 'Test', location: 'Hyd', totalLandArea: 100, totalPlots: 5,
      });
      await Plot.create([
        { projectId: project._id, plotNumber: '1', status: 'Available' },
        { projectId: project._id, plotNumber: '2', status: 'Booked' },
      ]);

      const res = await request(app)
        .get(`/api/v1/projects/${project._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/v1/projects/:id', () => {
    it('should update a project', async () => {
      const project = await Project.create({
        name: 'Old', location: 'Hyd', totalLandArea: 100, totalPlots: 10,
      });
      const res = await request(app)
        .put(`/api/v1/projects/${project._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated', status: 'Active' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
      expect(res.body.data.status).toBe('Active');
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('should delete project and cascade-delete plots', async () => {
      const project = await Project.create({
        name: 'To Delete', location: 'Hyd', totalLandArea: 100, totalPlots: 5,
      });
      await Plot.create({ projectId: project._id, plotNumber: '1' });

      const res = await request(app)
        .delete(`/api/v1/projects/${project._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(await Project.findById(project._id)).toBeNull();
      expect(await Plot.find({ projectId: project._id })).toHaveLength(0);
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/v1/projects/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/projects/locations', () => {
    it('should return distinct non-empty locations', async () => {
      await Project.create([
        { name: 'P1', location: 'Hyderabad', totalLandArea: 10, totalPlots: 5 },
        { name: 'P2', location: 'Bangalore', totalLandArea: 20, totalPlots: 10 },
      ]);

      const res = await request(app)
        .get('/api/v1/projects/locations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toContain('Hyderabad');
      expect(res.body.data).toContain('Bangalore');
    });
  });
});
