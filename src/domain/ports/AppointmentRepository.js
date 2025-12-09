/**
 * Appointment Repository Port - Domain Layer
 * Defines the contract for appointment persistence
 * 
 * Business Rules:
 * - Phone number is the primary identifier (one active appointment per customer)
 * - When an appointment expires, it moves to history (replacing any previous history)
 * - Only one appointment can exist per phone number at a time
 */
export class AppointmentRepository {
  /**
   * Save or update an appointment
   * @param {Appointment} appointment 
   * @returns {Promise<Appointment>}
   */
  async save(appointment) {
    throw new Error('Method not implemented');
  }

  /**
   * Find appointment by ID
   * @param {string} id 
   * @returns {Promise<Appointment|null>}
   */
  async findById(id) {
    throw new Error('Method not implemented');
  }

  /**
   * Find active appointment by phone number
   * @param {string} phoneNumber 
   * @returns {Promise<Appointment|null>}
   */
  async findByPhone(phoneNumber) {
    throw new Error('Method not implemented');
  }

  /**
   * Find appointments within a date range
   * @param {Date} startDate 
   * @param {Date} endDate 
   * @returns {Promise<Appointment[]>}
   */
  async findByDateRange(startDate, endDate) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete an appointment by ID
   * @param {string} id 
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error('Method not implemented');
  }

  /**
   * Check if customer has an active appointment
   * @param {string} phoneNumber 
   * @returns {Promise<boolean>}
   */
  async hasActiveAppointment(phoneNumber) {
    throw new Error('Method not implemented');
  }

  /**
   * Get appointment history for a phone number
   * @param {string} phoneNumber 
   * @returns {Promise<Object|null>}
   */
  async getHistory(phoneNumber) {
    throw new Error('Method not implemented');
  }

  /**
   * Process expired appointments (move to history)
   * @returns {Promise<number>} Number of appointments processed
   */
  async processExpiredAppointments() {
    throw new Error('Method not implemented');
  }
}