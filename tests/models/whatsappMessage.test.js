const mongoose = require('mongoose');
const WhatsAppMessage = require('../../models/WhatsAppMessage');

describe('WhatsAppMessage Model', () => {
  describe('Schema Validation', () => {
    it('should create a message with valid data', async () => {
      const message = await WhatsAppMessage.create({
        phone: '919876543210',
        message: 'Hello World',
      });
      expect(message.phone).toBe('919876543210');
      expect(message.message).toBe('Hello World');
      expect(message.type).toBe('text');
      expect(message.direction).toBe('outbound');
      expect(message.status).toBe('sent');
    });

    it('should fail without phone', async () => {
      await expect(WhatsAppMessage.create({ message: 'Test' })).rejects.toThrow();
    });

    it('should fail without message', async () => {
      await expect(WhatsAppMessage.create({ phone: '123' })).rejects.toThrow();
    });

    it('should accept valid type enum', async () => {
      const message = await WhatsAppMessage.create({
        phone: '123',
        message: 'Test',
        type: 'template',
        templateName: 'welcome',
      });
      expect(message.type).toBe('template');
      expect(message.templateName).toBe('welcome');
    });

    it('should accept valid direction enum', async () => {
      const message = await WhatsAppMessage.create({
        phone: '123',
        message: 'Test',
        direction: 'inbound',
      });
      expect(message.direction).toBe('inbound');
    });

    it('should accept valid status enum', async () => {
      const message = await WhatsAppMessage.create({
        phone: '123',
        message: 'Test',
        status: 'delivered',
      });
      expect(message.status).toBe('delivered');
    });
  });
});
