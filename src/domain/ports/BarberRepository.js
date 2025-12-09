/**
 * Barber Repository Port - Domain Layer
 * Defines the contract for barber persistence
 */
export class BarberRepository {
  /**
   * Get all active barbers
   * @returns {Promise<Barber[]>}
   */
  async findAll() {
    throw new Error('Method not implemented');
  }

  /**
   * Find barber by ID
   * @param {string} id 
   * @returns {Promise<Barber|null>}
   */
  async findById(id) {
    throw new Error('Method not implemented');
  }

  /**
   * Save or update a barber
   * @param {Barber} barber 
   * @returns {Promise<Barber>}
   */
  async save(barber) {
    throw new Error('Method not implemented');
  }
}