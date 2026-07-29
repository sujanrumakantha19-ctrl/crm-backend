const mongoose = require('mongoose');
const Attendance = require('../../models/Attendance');

describe('Attendance Model', () => {
  describe('Schema Validation', () => {
    it('should create attendance with valid data', async () => {
      const attendance = await Attendance.create({
        staffId: new mongoose.Types.ObjectId(),
        staffName: 'John Doe',
        date: '2024-01-15',
        status: 'Present',
      });
      expect(attendance.staffName).toBe('John Doe');
      expect(attendance.date).toBe('2024-01-15');
      expect(attendance.status).toBe('Present');
    });

    it('should fail without staffId', async () => {
      await expect(Attendance.create({ staffName: 'John', date: '2024-01-15', status: 'Present' })).rejects.toThrow();
    });

    it('should fail without staffName', async () => {
      await expect(Attendance.create({ staffId: new mongoose.Types.ObjectId(), date: '2024-01-15', status: 'Present' })).rejects.toThrow();
    });

    it('should fail without date', async () => {
      await expect(Attendance.create({ staffId: new mongoose.Types.ObjectId(), staffName: 'John', status: 'Present' })).rejects.toThrow();
    });

    it('should fail without status', async () => {
      await expect(Attendance.create({ staffId: new mongoose.Types.ObjectId(), staffName: 'John', date: '2024-01-15' })).rejects.toThrow();
    });

    it('should accept valid status enum', async () => {
      const attendance = await Attendance.create({
        staffId: new mongoose.Types.ObjectId(),
        staffName: 'John',
        date: '2024-01-15',
        status: 'Absent',
      });
      expect(attendance.status).toBe('Absent');
    });

    it('should reject invalid status', async () => {
      await expect(Attendance.create({
        staffId: new mongoose.Types.ObjectId(),
        staffName: 'John',
        date: '2024-01-15',
        status: 'Invalid',
      })).rejects.toThrow();
    });

    it('should accept valid activityType', async () => {
      const attendance = await Attendance.create({
        staffId: new mongoose.Types.ObjectId(),
        staffName: 'John',
        date: '2024-01-15',
        status: 'Present',
        activityType: 'Projects',
      });
      expect(attendance.activityType).toBe('Projects');
    });
  });
});
