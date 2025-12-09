/**
 * Appointment Repository Port - Domain Layer
 * Defines the contract for appointment persistence
 * 
 * Business Rules:
 * - Phone number is the primary identifier (one active appointment per customer)
 * - Each appointment is linked to a specific barber
 * - Appointments are 1 hour each
 * - When an appointment expires, it moves to history
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
   * Find all appointments for a barber on a specific date
   * @param {string} barberId 
   * @param {Date} date 
   * @returns {Promise<Appointment[]>}
   */
  async findByBarberAndDate(barberId, date) {
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
   * Check if a specific time slot is available for a barber
   * @param {string} barberId 
   * @param {Date} dateTime 
   * @returns {Promise<boolean>}
   */
  async isSlotAvailable(barberId, dateTime) {
    throw new Error('Method not implemented');
  }

  /**
   * Get all booked slots for a barber on a specific date
   * @param {string} barberId 
   * @param {Date} date 
   * @returns {Promise<Date[]>}
   */
  async getBookedSlots(barberId, date) {
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

  /**
   * Count appointments per day for availability display
   * @param {string} barberId 
   * @param {Date[]} dates 
   * @returns {Promise<Map<string, number>>} Map of date string to appointment count
   */
  async countAppointmentsByDates(barberId, dates) {
    throw new Error('Method not implemented');
  }
}