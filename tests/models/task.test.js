const mongoose = require('mongoose');
const Task = require('../../models/Task');

describe('Task Model', () => {
  describe('Schema Validation', () => {
    it('should create a task with valid data', async () => {
      const task = await Task.create({
        title: 'Test Task',
        description: 'Test description',
      });
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test description');
      expect(task.status).toBe('To Do');
      expect(task.priority).toBe('Medium');
    });

    it('should fail without title', async () => {
      await expect(Task.create({})).rejects.toThrow();
    });

    it('should default status to To Do', async () => {
      const task = await Task.create({ title: 'Test' });
      expect(task.status).toBe('To Do');
    });

    it('should default priority to Medium', async () => {
      const task = await Task.create({ title: 'Test' });
      expect(task.priority).toBe('Medium');
    });

    it('should accept valid status enum', async () => {
      const task = await Task.create({ title: 'Test', status: 'In Progress' });
      expect(task.status).toBe('In Progress');
    });

    it('should reject invalid status', async () => {
      await expect(Task.create({ title: 'Test', status: 'Invalid' })).rejects.toThrow();
    });

    it('should accept valid priority enum', async () => {
      const task = await Task.create({ title: 'Test', priority: 'High' });
      expect(task.priority).toBe('High');
    });

    it('should reject invalid priority', async () => {
      await expect(Task.create({ title: 'Test', priority: 'Invalid' })).rejects.toThrow();
    });
  });

  describe('Comments', () => {
    it('should store comments array', async () => {
      const task = await Task.create({
        title: 'Test',
        comments: [
          {
            id: '1',
            author: 'John',
            authorInitials: 'JD',
            text: 'Test comment',
            timestamp: '2024-01-01',
          },
        ],
      });
      expect(task.comments).toHaveLength(1);
      expect(task.comments[0].text).toBe('Test comment');
    });
  });

  describe('JSON Serialization', () => {
    it('should include id instead of _id', async () => {
      const task = await Task.create({ title: 'Test' });
      const json = task.toJSON();
      expect(json.id).toBeDefined();
      expect(json._id).toBeUndefined();
    });
  });
});
