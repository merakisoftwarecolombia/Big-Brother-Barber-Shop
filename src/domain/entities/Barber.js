/**
 * Barber Entity - Domain Layer
 * Represents a barber in the system
 */
export class Barber {
  #id;
  #name;
  #isActive;
  #workingHours;

  constructor({ id, name, isActive = true, workingHours = null }) {
    this.#validate({ id, name });
    
    this.#id = id;
    this.#name = this.#sanitizeName(name);
    this.#isActive = isActive;
    this.#workingHours = workingHours ?? {
      start: 9,  // 9 AM
      end: 19,   // 7 PM
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

  get id() { return this.#id; }
  get name() { return this.#name; }
  get isActive() { return this.#isActive; }
  get workingHours() { return { ...this.#workingHours }; }

  /**
   * Generate all possible time slots for a given date
   * @param {Date} date 
   * @returns {Array<{time: string, dateTime: Date}>}
   */
  generateTimeSlots(date) {
    const slots = [];
    const { start, end, slotDuration } = this.#workingHours;
    
    for (let hour = start; hour < end; hour++) {
      const slotDate = new Date(date);
      slotDate.setHours(hour, 0, 0, 0);
      
      // Only include future slots
      if (slotDate > new Date()) {
        slots.push({
          time: `${hour.toString().padStart(2, '0')}:00`,
          dateTime: new Date(slotDate)
        });
      }
    }
    
    return slots;
  }

  activate() {
    this.#isActive = true;
  }

  deactivate() {
    this.#isActive = false;
  }

  toJSON() {
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
 */
export const DEFAULT_BARBERS = [
  { id: 'barber_carlos', name: 'Carlos Mendoza' },
  { id: 'barber_miguel', name: 'Miguel Ángel' },
  { id: 'barber_david', name: 'David Restrepo' },
  { id: 'barber_andres', name: 'Andrés Martínez' },
  { id: 'barber_juan', name: 'Juan Pablo' }
];