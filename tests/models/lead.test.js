const mongoose = require('mongoose');
const Lead = require('../../models/Lead');

describe('Lead Model', () => {
  describe('Schema Validation', () => {
    const validLeadData = {
      customerName: 'Test Customer',
      phone: '9876543210',
      email: 'test@example.com',
    };

    it('should create a lead with valid data', async () => {
      const lead = await Lead.create(validLeadData);
      expect(lead.customerName).toBe('Test Customer');
      expect(lead.phone).toBe('9876543210');
      expect(lead.email).toBe('test@example.com');
      expect(lead.status).toBe('Open');
    });

    it('should fail without customerName', async () => {
      await expect(Lead.create({ phone: '123', email: 'a@b.com' })).rejects.toThrow();
    });

    it('should fail without phone', async () => {
      await expect(Lead.create({ customerName: 'Test', email: 'a@b.com' })).rejects.toThrow();
    });

    it('should fail without email', async () => {
      await expect(Lead.create({ customerName: 'Test', phone: '123' })).rejects.toThrow();
    });

    it('should fail with invalid email format', async () => {
      await expect(Lead.create({ ...validLeadData, email: 'invalid' })).rejects.toThrow();
    });

    it('should default status to Open', async () => {
      const lead = await Lead.create(validLeadData);
      expect(lead.status).toBe('Open');
    });

    it('should accept valid sourceType enum', async () => {
      const lead = await Lead.create({ ...validLeadData, sourceType: 'Direct' });
      expect(lead.sourceType).toBe('Direct');
    });

    it('should reject invalid sourceType', async () => {
      await expect(Lead.create({ ...validLeadData, sourceType: 'Invalid' })).rejects.toThrow();
    });

    it('should accept valid status enum', async () => {
      const lead = await Lead.create({ ...validLeadData, status: 'Qualified' });
      expect(lead.status).toBe('Qualified');
    });

    it('should reject invalid status', async () => {
      await expect(Lead.create({ ...validLeadData, status: 'Invalid' })).rejects.toThrow();
    });
  });

  describe('Follow-ups', () => {
    it('should store follow-ups array', async () => {
      const lead = await Lead.create({
        customerName: 'Test',
        phone: '123',
        email: 'a@b.com',
        followUps: [
          {
            id: '1',
            date: '2024-01-01',
            notes: 'First follow-up',
            outcome: 'Interested',
            nextAction: 'Call again',
          },
        ],
      });
      expect(lead.followUps).toHaveLength(1);
      expect(lead.followUps[0].notes).toBe('First follow-up');
    });
  });

  describe('JSON Serialization', () => {
    it('should include id instead of _id', async () => {
      const lead = await Lead.create({
        customerName: 'Test',
        phone: '123',
        email: 'a@b.com',
      });
      const json = lead.toJSON();
      expect(json.id).toBeDefined();
      expect(json._id).toBeUndefined();
      expect(json.__v).toBeUndefined();
    });
  });
});
