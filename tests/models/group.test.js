const mongoose = require('mongoose');
const Group = require('../../models/Group');

describe('Group Model', () => {
  describe('Schema Validation', () => {
    it('should create a group with valid data', async () => {
      const group = await Group.create({
        name: 'Test Group',
        description: 'Test description',
      });
      expect(group.name).toBe('Test Group');
      expect(group.description).toBe('Test description');
    });

    it('should fail without name', async () => {
      await expect(Group.create({})).rejects.toThrow();
    });

    it('should store members array', async () => {
      const group = await Group.create({
        name: 'Test',
        members: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
      });
      expect(group.members).toHaveLength(2);
    });
  });
});
