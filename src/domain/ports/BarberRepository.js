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
   * Find barber by alias (for admin authentication)
   * @param {string} alias
   * @returns {Promise<Barber|null>}
   */
  async findByAlias(alias) {
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

  /**
   * Update barber's PIN hash
   * @param {string} barberId
   * @param {string} pinHash
   * @returns {Promise<void>}
   */
  async updatePinHash(barberId, pinHash) {
    throw new Error('Method not implemented');
  }

  /**
   * Check if a barber has a PIN set
   * @param {string} barberId
   * @returns {Promise<boolean>}
   */
  async hasPin(barberId) {
    throw new Error('Method not implemented');
  }
}