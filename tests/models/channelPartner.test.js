const mongoose = require('mongoose');
const ChannelPartner = require('../../models/ChannelPartner');

describe('ChannelPartner Model', () => {
  describe('Schema Validation', () => {
    it('should create a channel partner with valid data', async () => {
      const partner = await ChannelPartner.create({
        name: 'Test Partner',
        phone: '9876543210',
        email: 'partner@example.com',
      });
      expect(partner.name).toBe('Test Partner');
      expect(partner.phone).toBe('9876543210');
      expect(partner.email).toBe('partner@example.com');
      expect(partner.isActive).toBe(true);
    });

    it('should fail without name', async () => {
      await expect(ChannelPartner.create({ phone: '123', email: 'a@b.com' })).rejects.toThrow();
    });

    it('should fail without phone', async () => {
      await expect(ChannelPartner.create({ name: 'Test', email: 'a@b.com' })).rejects.toThrow();
    });

    it('should fail without email', async () => {
      await expect(ChannelPartner.create({ name: 'Test', phone: '123' })).rejects.toThrow();
    });

    it('should fail with invalid email', async () => {
      await expect(ChannelPartner.create({ name: 'Test', phone: '123', email: 'invalid' })).rejects.toThrow();
    });

    it('should default isActive to true', async () => {
      const partner = await ChannelPartner.create({
        name: 'Test',
        phone: '123',
        email: 'a@b.com',
      });
      expect(partner.isActive).toBe(true);
    });

    it('should default totalLeads to 0', async () => {
      const partner = await ChannelPartner.create({
        name: 'Test',
        phone: '123',
        email: 'a@b.com',
      });
      expect(partner.totalLeads).toBe(0);
    });
  });
});
