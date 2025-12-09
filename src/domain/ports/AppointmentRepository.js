/**
 * Appointment Repository Port - Domain Layer
 * Defines the contract for appointment persistence
 */
export class AppointmentRepository {
  async save(appointment) {
    throw new Error('Method not implemented');
  }

  async findById(id) {
    throw new Error('Method not implemented');
  }

  async findByPhone(phoneNumber) {
    throw new Error('Method not implemented');
  }

  async findByDateRange(startDate, endDate) {
    throw new Error('Method not implemented');
  }

  async delete(id) {
    throw new Error('Method not implemented');
  }
}