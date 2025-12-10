import { randomBytes, timingSafeEqual, pbkdf2 } from 'crypto';

/**
 * HashService - Infrastructure Layer
 * Provides secure hashing for PINs using PBKDF2
 *
 * Security considerations:
 * - Uses PBKDF2 with SHA-256 for key derivation
 * - Includes random salt to prevent rainbow table attacks
 * - Uses timing-safe comparison to prevent timing attacks
 * - Configurable iterations for future-proofing
 *
 * OWASP Compliance:
 * - Minimum 100,000 iterations for PBKDF2
 * - 256-bit salt (32 bytes)
 * - 512-bit derived key (64 bytes)
 */
export class HashService {
  #iterations;
  #keyLength;
  #digest;

  constructor({ iterations = 100000, keyLength = 64, digest = 'sha256' } = {}) {
    this.#iterations = iterations;
    this.#keyLength = keyLength;
    this.#digest = digest;
  }

  /**
   * Hash a plain text PIN
   * @param {string} plainPin - The plain text PIN
   * @returns {Promise<string>} - The hashed PIN with salt (format: salt:hash)
   */
  async hash(plainPin) {
    // Generate random salt (256 bits)
    const salt = randomBytes(32).toString('hex');
    
    // Use PBKDF2 for key derivation
    const derivedKey = await this.#pbkdf2(plainPin, salt);
    
    // Store salt and hash together
    return `${salt}:${derivedKey}`;
  }

  /**
   * Verify a plain PIN against a stored hash
   * @param {string} plainPin - The plain text PIN to verify
   * @param {string} storedHash - The stored hash (format: salt:hash)
   * @returns {Promise<boolean>} - True if PIN matches
   */
  async verify(plainPin, storedHash) {
    try {
      // Extract salt and hash from stored value
      const [salt, hash] = storedHash.split(':');
      
      if (!salt || !hash) {
        return false;
      }

      // Derive key from provided PIN using same salt
      const derivedKey = await this.#pbkdf2(plainPin, salt);
      
      // Use timing-safe comparison to prevent timing attacks
      const hashBuffer = Buffer.from(hash, 'hex');
      const derivedBuffer = Buffer.from(derivedKey, 'hex');
      
      if (hashBuffer.length !== derivedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(hashBuffer, derivedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * PBKDF2 key derivation (promisified)
   * @param {string} password
   * @param {string} salt
   * @returns {Promise<string>}
   */
  #pbkdf2(password, salt) {
    return new Promise((resolve, reject) => {
      pbkdf2(
        password,
        salt,
        this.#iterations,
        this.#keyLength,
        this.#digest,
        (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            resolve(derivedKey.toString('hex'));
          }
        }
      );
    });
  }

  /**
   * Generate a secure random PIN
   * @param {number} length - PIN length (4-6)
   * @returns {string}
   */
  static generateRandomPin(length = 4) {
    if (length < 4 || length > 6) {
      throw new Error('PIN length must be between 4 and 6');
    }
    
    const max = Math.pow(10, length);
    const min = Math.pow(10, length - 1);
    
    // Generate cryptographically secure random number
    const range = max - min;
    const randomValue = randomBytes(4).readUInt32BE(0);
    const pin = min + (randomValue % range);
    
    return pin.toString();
  }
}