/**
 * Client Repository Port - Domain Layer
 * Defines the interface for client persistence operations
 */
export class ClientRepository {
  /**
   * Save or update a client
   * @param {Client} client 
   * @returns {Promise<Client>}
   */
  async save(client) {
    throw new Error('Method not implemented');
  }

  /**
   * Find a client by phone number
   * @param {string} phoneNumber 
   * @returns {Promise<Client|null>}
   */
  async findByPhone(phoneNumber) {
    throw new Error('Method not implemented');
  }

  /**
   * Find all clients
   * @returns {Promise<Client[]>}
   */
  async findAll() {
    throw new Error('Method not implemented');
  }

  /**
   * Find or create a client
   * If client exists, updates name if different and increments appointment count
   * If client doesn't exist, creates new client
   * @param {string} phoneNumber 
   * @param {string} name 
   * @returns {Promise<Client>}
   */
  async findOrCreate(phoneNumber, name) {
    throw new Error('Method not implemented');
  }

  /**
   * Get total number of clients
   * @returns {Promise<number>}
   */
  async count() {
    throw new Error('Method not implemented');
  }

  /**
   * Delete a client
   * @param {string} phoneNumber 
   * @returns {Promise<void>}
   */
  async delete(phoneNumber) {
    throw new Error('Method not implemented');
  }
}