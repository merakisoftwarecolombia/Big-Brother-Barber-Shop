/**
 * BarberPin Value Object - Domain Layer
 * Represents a secure PIN for barber authentication
 * 
 * Security considerations:
 * - PIN must be 4-6 digits
 * - PIN is stored as a hash, never in plain text
 * - Comparison is done via constant-time comparison to prevent timing attacks
 */
export class BarberPin {
  #hash;

  /**
   * Private constructor - use static factory methods
   * @param {string} hash - The hashed PIN
   */
  constructor(hash) {
    if (!hash || typeof hash !== 'string') {
      throw new Error('Invalid PIN hash');
    }
    this.#hash = hash;
  }

  /**
   * Create a BarberPin from a plain text PIN (for initial setup)
   * @param {string} plainPin - The plain text PIN (4-6 digits)
   * @param {Function} hashFunction - Async function to hash the PIN
   * @returns {Promise<BarberPin>}
   */
  static async fromPlainText(plainPin, hashFunction) {
    BarberPin.#validatePlainPin(plainPin);
    const hash = await hashFunction(plainPin);
    return new BarberPin(hash);
  }

  /**
   * Create a BarberPin from an existing hash (from database)
   * @param {string} hash - The stored hash
   * @returns {BarberPin}
   */
  static fromHash(hash) {
    return new BarberPin(hash);
  }

  /**
   * Validate plain PIN format
   * @param {string} pin 
   */
  static #validatePlainPin(pin) {
    if (!pin || typeof pin !== 'string') {
      throw new Error('PIN must be a string');
    }
    
    const sanitized = pin.trim();
    
    if (!/^\d{4,6}$/.test(sanitized)) {
      throw new Error('PIN must be 4-6 digits');
    }
  }

  /**
   * Verify if a plain PIN matches this hashed PIN
   * @param {string} plainPin - The plain text PIN to verify
   * @param {Function} verifyFunction - Async function to verify PIN against hash
   * @returns {Promise<boolean>}
   */
  async verify(plainPin, verifyFunction) {
    try {
      BarberPin.#validatePlainPin(plainPin);
      return await verifyFunction(plainPin, this.#hash);
    } catch {
      return false;
    }
  }

  /**
   * Get the hash value (for persistence)
   * @returns {string}
   */
  get hash() {
    return this.#hash;
  }

  /**
   * Check if PIN format is valid (static validation without hashing)
   * @param {string} pin 
   * @returns {boolean}
   */
  static isValidFormat(pin) {
    if (!pin || typeof pin !== 'string') {
      return false;
    }
    return /^\d{4,6}$/.test(pin.trim());
  }
}