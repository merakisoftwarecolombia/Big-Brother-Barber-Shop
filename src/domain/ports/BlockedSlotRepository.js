/**
 * BlockedSlot Repository Port - Domain Layer
 * Defines the contract for blocked slot persistence
 */
export class BlockedSlotRepository {
  /**
   * Save a blocked slot
   * @param {BlockedSlot} blockedSlot 
   * @returns {Promise<BlockedSlot>}
   */
  async save(blockedSlot) {
    throw new Error('Method not implemented');
  }

  /**
   * Find blocked slot by ID
   * @param {string} id 
   * @returns {Promise<BlockedSlot|null>}
   */
  async findById(id) {
    throw new Error('Method not implemented');
  }

  /**
   * Find all blocked slots for a barber
   * @param {string} barberId 
   * @returns {Promise<BlockedSlot[]>}
   */
  async findByBarberId(barberId) {
    throw new Error('Method not implemented');
  }

  /**
   * Find blocked slots for a barber on a specific date
   * @param {string} barberId 
   * @param {Date} date 
   * @returns {Promise<BlockedSlot[]>}
   */
  async findByBarberAndDate(barberId, date) {
    throw new Error('Method not implemented');
  }

  /**
   * Check if a time slot is blocked for a barber
   * @param {string} barberId 
   * @param {Date} dateTime 
   * @returns {Promise<boolean>}
   */
  async isTimeBlocked(barberId, dateTime) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete a blocked slot by ID
   * @param {string} id 
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error('Method not implemented');
  }

  /**
   * Delete blocked slot by barber, date and time
   * @param {string} barberId 
   * @param {Date} date 
   * @param {string} startTime 
   * @returns {Promise<boolean>} - Returns true if deleted, false if not found
   */
  async deleteByBarberDateTime(barberId, date, startTime) {
    throw new Error('Method not implemented');
  }
}