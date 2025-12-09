/**
 * Messaging Service Port - Domain Layer
 * Defines the contract for messaging operations
 */
export class MessagingService {
  async sendMessage(phoneNumber, message) {
    throw new Error('Method not implemented');
  }

  async sendConfirmation(phoneNumber, appointment) {
    throw new Error('Method not implemented');
  }

  async sendReminder(phoneNumber, appointment) {
    throw new Error('Method not implemented');
  }
}