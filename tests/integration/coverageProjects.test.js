const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Project = require('../../models/Project');
const Plot = require('../../models/Plot');

const app = buildTestApp();

describe('Project Controller Coverage', () => {
  describe('GET /api/v1/projects/:id', () => {
    it('should return 404 for non-existent project', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/projects/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/projects auto-plot creation', () => {
    it('should create plots when totalPlots > 0', async () => {
      const admin = await createAdminUser();
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Auto Plot Project', location: 'Hyd', category: 'Villas',
          totalLandArea: 100, totalPlots: 5, plotSize: 200, plotSizeUnit: 'Sq Yards',
        });
      expect(res.status).toBe(201);
      const plots = await Plot.find({ projectId: res.body.data.id });
      expect(plots.length).toBe(5);
      expect(plots[0].size).toBe(200);
      expect(plots[0].sizeUnit).toBe('Sq Yards');
      expect(plots[0].status).toBe('Available');
    });

    it('should not create plots when totalPlots is 0', async () => {
      const admin = await createAdminUser();
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'No Plots', location: 'Hyd', category: 'Open Plots', totalLandArea: 50, totalPlots: 0 });
      expect(res.status).toBe(201);
      const plots = await Plot.find({ projectId: res.body.data.id });
      expect(plots.length).toBe(0);
    });
  });

  describe('PUT /api/v1/projects/:id', () => {
    it('should return 404 for non-existent project', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/projects/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Updated' });
      expect(res.status).toBe(404);
    });

    it('should strip undefined fields from update', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({ name: 'Strip Test', location: 'Hyd', totalLandArea: 10, totalPlots: 2 });
      const res = await request(app)
        .put(`/api/v1/projects/${proj._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Updated', status: undefined, location: undefined });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('should return 404 for non-existent project', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/v1/projects/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });

    it('should cascade delete plots', async () => {
      const admin = await createAdminUser();
      const proj = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Cascade', location: 'Hyd', category: 'Villas', totalLandArea: 50, totalPlots: 3 });
      const plots = await Plot.find({ projectId: proj.body.data.id });
      expect(plots.length).toBe(3);

      await request(app)
        .delete(`/api/v1/projects/${proj.body.data.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(await Plot.find({ projectId: proj.body.data.id })).toHaveLength(0);
    });
  });

  describe('GET /api/v1/projects/locations', () => {
    it('should filter out null and empty locations', async () => {
      const admin = await createAdminUser();
      await Project.create({ name: 'P1', location: 'Hyderabad', totalLandArea: 10, totalPlots: 2 });
      await Project.create({ name: 'P3', location: 'Bangalore', totalLandArea: 10, totalPlots: 2 });
      const res = await request(app)
        .get('/api/v1/projects/locations')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toContain('Hyderabad');
      expect(res.body.data).toContain('Bangalore');
      expect(res.body.data).not.toContain('');
    });
  });

  describe('POST /api/v1/projects/sync-plots', () => {
    it('should sync missing plots for projects', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({
        name: 'Sync Test', location: 'Hyd', totalLandArea: 100, totalPlots: 5, plotSize: 200,
      });
      // Create only 2 plots (missing 3)
      await Plot.create([
        { projectId: proj._id, plotNumber: '1' },
        { projectId: proj._id, plotNumber: '2' },
      ]);

      const res = await request(app)
        .post('/api/v1/projects/sync-plots')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].plotsAdded).toBe(3);

      const allPlots = await Plot.find({ projectId: proj._id });
      expect(allPlots.length).toBe(5);
    });

    it('should not create plots when already synced', async () => {
      const admin = await createAdminUser();
      const proj = await Project.create({
        name: 'Synced', location: 'Hyd', totalLandArea: 50, totalPlots: 2,
      });
      await Plot.create([
        { projectId: proj._id, plotNumber: '1' },
        { projectId: proj._id, plotNumber: '2' },
      ]);

      const res = await request(app)
        .post('/api/v1/projects/sync-plots')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });
});
