/**
 * ClientNote Repository Port - Domain Layer
 * Defines the contract for client note persistence
 */
export class ClientNoteRepository {
  /**
   * Save a client note
   * @param {ClientNote} note 
   * @returns {Promise<ClientNote>}
   */
  async save(note) {
    throw new Error('Method not implemented');
  }

  /**
   * Find note by ID
   * @param {string} id 
   * @returns {Promise<ClientNote|null>}
   */
  async findById(id) {
    throw new Error('Method not implemented');
  }

  /**
   * Find all notes for a client (phone number)
   * @param {string} phoneNumber 
   * @returns {Promise<ClientNote[]>}
   */
  async findByPhoneNumber(phoneNumber) {
    throw new Error('Method not implemented');
  }

  /**
   * Find all notes created by a barber
   * @param {string} barberId 
   * @returns {Promise<ClientNote[]>}
   */
  async findByBarberId(barberId) {
    throw new Error('Method not implemented');
  }

  /**
   * Find notes for a client by a specific barber
   * @param {string} phoneNumber 
   * @param {string} barberId 
   * @returns {Promise<ClientNote[]>}
   */
  async findByPhoneAndBarber(phoneNumber, barberId) {
    throw new Error('Method not implemented');
  }

  /**
   * Find note linked to a specific appointment
   * @param {string} appointmentId 
   * @returns {Promise<ClientNote|null>}
   */
  async findByAppointmentId(appointmentId) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete a note by ID
   * @param {string} id 
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error('Method not implemented');
  }

  /**
   * Get the most recent note for a client
   * @param {string} phoneNumber 
   * @returns {Promise<ClientNote|null>}
   */
  async findLatestByPhone(phoneNumber) {
    throw new Error('Method not implemented');
  }
}