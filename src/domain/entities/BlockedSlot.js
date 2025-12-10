/**
 * BlockedSlot Entity - Domain Layer
 * Represents a blocked time slot for a barber (lunch, break, etc.)
 * 
 * Business Rules:
 * - A blocked slot prevents appointments from being scheduled
 * - Can be recurring (daily) or one-time
 * - Must have a valid time range within working hours
 */
export class BlockedSlot {
  #id;
  #barberId;
  #date;
  #startTime;
  #endTime;
  #reason;
  #isRecurring;
  #createdAt;

  static REASONS = Object.freeze({
    LUNCH: 'almuerzo',
    BREAK: 'descanso',
    PERSONAL: 'personal',
    OTHER: 'otro'
  });

  constructor({ id, barberId, date, startTime, endTime, reason, isRecurring = false, createdAt }) {
    this.#validate({ barberId, date, startTime, endTime });
    
    this.#id = id ?? crypto.randomUUID();
    this.#barberId = barberId;
    this.#date = date ? new Date(date) : null;
    this.#startTime = this.#sanitizeTime(startTime);
    this.#endTime = this.#sanitizeTime(endTime);
    this.#reason = this.#sanitizeReason(reason);
    this.#isRecurring = Boolean(isRecurring);
    this.#createdAt = createdAt ? new Date(createdAt) : new Date();
  }

  #validate({ barberId, startTime, endTime }) {
    if (!barberId || typeof barberId !== 'string') {
      throw new Error('Invalid barber ID');
    }
    
    if (!startTime || typeof startTime !== 'string') {
      throw new Error('Invalid start time');
    }
    
    if (!endTime || typeof endTime !== 'string') {
      throw new Error('Invalid end time');
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      throw new Error('Time must be in HH:MM format');
    }

    // Validate start is before end
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      throw new Error('Start time must be before end time');
    }
  }

  #sanitizeTime(time) {
    const [hour, minute] = time.split(':');
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  #sanitizeReason(reason) {
    if (!reason) {
      return BlockedSlot.REASONS.OTHER;
    }
    const normalized = reason.toLowerCase().trim();
    return Object.values(BlockedSlot.REASONS).includes(normalized) 
      ? normalized 
      : BlockedSlot.REASONS.OTHER;
  }

  /**
   * Check if this blocked slot conflicts with a given datetime
   * @param {Date} dateTime 
   * @returns {boolean}
   */
  conflictsWith(dateTime) {
    const checkDate = new Date(dateTime);
    
    // For recurring slots, only check time
    if (this.#isRecurring) {
      return this.#timeConflicts(checkDate);
    }

    // For one-time slots, check both date and time
    if (this.#date) {
      const slotDate = new Date(this.#date);
      if (slotDate.toDateString() !== checkDate.toDateString()) {
        return false;
      }
    }

    return this.#timeConflicts(checkDate);
  }

  #timeConflicts(dateTime) {
    const checkHour = dateTime.getHours();
    const checkMinute = dateTime.getMinutes();
    const checkMinutes = checkHour * 60 + checkMinute;

    const [startHour, startMin] = this.#startTime.split(':').map(Number);
    const [endHour, endMin] = this.#endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return checkMinutes >= startMinutes && checkMinutes < endMinutes;
  }

  /**
   * Check if this slot is for a specific date
   * @param {Date} date 
   * @returns {boolean}
   */
  isForDate(date) {
    if (this.#isRecurring) {
      return true;
    }
    if (!this.#date) {
      return false;
    }
    return this.#date.toDateString() === new Date(date).toDateString();
  }

  get id() { return this.#id; }
  get barberId() { return this.#barberId; }
  get date() { return this.#date ? new Date(this.#date) : null; }
  get startTime() { return this.#startTime; }
  get endTime() { return this.#endTime; }
  get reason() { return this.#reason; }
  get isRecurring() { return this.#isRecurring; }
  get createdAt() { return new Date(this.#createdAt); }

  toJSON() {
    return {
      id: this.#id,
      barberId: this.#barberId,
      date: this.#date ? this.#date.toISOString() : null,
      startTime: this.#startTime,
      endTime: this.#endTime,
      reason: this.#reason,
      isRecurring: this.#isRecurring,
      createdAt: this.#createdAt.toISOString()
    };
  }

  static fromJSON(data) {
    return new BlockedSlot(data);
  }

  /**
   * Create a one-hour blocked slot starting at the given time
   * @param {string} barberId 
   * @param {Date} date 
   * @param {string} startTime - HH:MM format
   * @param {string} reason 
   * @returns {BlockedSlot}
   */
  static createOneHourBlock(barberId, date, startTime, reason = BlockedSlot.REASONS.OTHER) {
    const [hour, minute] = startTime.split(':').map(Number);
    const endHour = hour + 1;
    const endTime = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    return new BlockedSlot({
      barberId,
      date,
      startTime,
      endTime,
      reason,
      isRecurring: false
    });
  }
}