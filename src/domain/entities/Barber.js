import { BarberPin } from '../value-objects/BarberPin.js';

/**
 * Barber Entity - Domain Layer
 * Represents a barber in the system with admin capabilities
 *
 * Security:
 * - PIN is stored as a hash, never in plain text
 * - Alias is used for admin command identification
 *
 * Working Hours:
 * - Default: 9 AM to 9 PM (Colombia time)
 * - All time operations use Colombia timezone (UTC-5)
 */
export class Barber {
  static COLOMBIA_TIMEZONE = 'America/Bogota';
  
  #id;
  #name;
  #alias;
  #pinHash;
  #isActive;
  #workingHours;

  constructor({ id, name, alias = null, pinHash = null, isActive = true, workingHours = null }) {
    this.#validate({ id, name });
    
    this.#id = id;
    this.#name = this.#sanitizeName(name);
    this.#alias = alias ? this.#sanitizeAlias(alias) : this.#generateAlias(name);
    this.#pinHash = pinHash;
    this.#isActive = isActive;
    this.#workingHours = workingHours ?? {
      start: 9,  // 9 AM
      end: 21,   // 9 PM (extended hours)
      slotDuration: 60 // 1 hour per appointment
    };
  }

  #validate({ id, name }) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid barber ID');
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new Error('Invalid barber name');
    }
  }

  #sanitizeName(name) {
    return name.trim().substring(0, 50);
  }

  #sanitizeAlias(alias) {
    return alias.toLowerCase().trim().substring(0, 20).replace(/[^a-z0-9]/g, '');
  }

  #generateAlias(name) {
    // Generate alias from first name, lowercase, no spaces
    const firstName = name.split(' ')[0];
    return firstName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get alias() { return this.#alias; }
  get pinHash() { return this.#pinHash; }
  get hasPin() { return this.#pinHash !== null && this.#pinHash !== undefined; }
  get isActive() { return this.#isActive; }
  get workingHours() { return { ...this.#workingHours }; }

  /**
   * Get current time in Colombia timezone
   * @returns {Date}
   */
  static getColombiaTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
  }

  /**
   * Generate all possible time slots for a given date
   * Uses Colombia timezone for all comparisons
   * @param {Date} date
   * @returns {Array<{time: string, dateTime: Date}>}
   */
  generateTimeSlots(date) {
    const slots = [];
    const { start, end, slotDuration } = this.#workingHours;
    
    // Get current time in Colombia
    const nowColombia = Barber.getColombiaTime();
    const currentHour = nowColombia.getHours();
    
    // Check if the date is today in Colombia time
    const dateColombia = new Date(date.toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
    const isToday = dateColombia.toDateString() === nowColombia.toDateString();
    
    for (let hour = start; hour < end; hour++) {
      // If today, only include future hours (current hour + 1 and beyond)
      if (isToday && hour <= currentHour) {
        continue;
      }
      
      const slotDate = new Date(date);
      slotDate.setHours(hour, 0, 0, 0);
      
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        dateTime: new Date(slotDate)
      });
    }
    
    return slots;
  }

  activate() {
    this.#isActive = true;
  }

  deactivate() {
    this.#isActive = false;
  }

  /**
   * Set the PIN hash for admin authentication
   * @param {string} pinHash - The hashed PIN
   */
  setPinHash(pinHash) {
    if (!pinHash || typeof pinHash !== 'string') {
      throw new Error('Invalid PIN hash');
    }
    this.#pinHash = pinHash;
  }

  /**
   * Verify if a plain PIN matches this barber's PIN
   * @param {string} plainPin - The plain text PIN to verify
   * @param {Function} verifyFunction - Async function to verify PIN against hash
   * @returns {Promise<boolean>}
   */
  async verifyPin(plainPin, verifyFunction) {
    if (!this.#pinHash) {
      return false;
    }
    
    try {
      const pin = BarberPin.fromHash(this.#pinHash);
      return await pin.verify(plainPin, verifyFunction);
    } catch {
      return false;
    }
  }

  /**
   * Update the alias
   * @param {string} newAlias
   */
  updateAlias(newAlias) {
    if (!newAlias || typeof newAlias !== 'string' || newAlias.trim().length < 2) {
      throw new Error('Invalid alias');
    }
    this.#alias = this.#sanitizeAlias(newAlias);
  }

  toJSON() {
    return {
      id: this.#id,
      name: this.#name,
      alias: this.#alias,
      pinHash: this.#pinHash,
      isActive: this.#isActive,
      workingHours: { ...this.#workingHours }
    };
  }

  /**
   * Convert to JSON without sensitive data (for client responses)
   * @returns {Object}
   */
  toPublicJSON() {
    return {
      id: this.#id,
      name: this.#name,
      isActive: this.#isActive,
      workingHours: { ...this.#workingHours }
    };
  }

  static fromJSON(data) {
    return new Barber(data);
  }
}

/**
 * Default barbers for the system
 * Note: PINs should be set via admin setup, not hardcoded
 * Default PIN hash is for "1234" - MUST be changed in production
 */
export const DEFAULT_BARBERS = [
  { id: 'barber_carlos', name: 'Carlos Mendoza', alias: 'carlos' },
  { id: 'barber_miguel', name: 'Miguel Ángel', alias: 'miguel' },
  { id: 'barber_david', name: 'David Restrepo', alias: 'david' },
  { id: 'barber_andres', name: 'Andrés Martínez', alias: 'andres' },
  { id: 'barber_juan', name: 'Juan Pablo', alias: 'juan' }
];