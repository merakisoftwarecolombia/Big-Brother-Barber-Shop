/**
 * ColombiaTime Utility - Infrastructure Layer
 * Handles all date/time operations in Colombia timezone (UTC-5)
 * 
 * This ensures consistent time handling regardless of server location
 */
export class ColombiaTime {
  static TIMEZONE = 'America/Bogota';
  static UTC_OFFSET = -5; // UTC-5

  /**
   * Get current date/time in Colombia
   * @returns {Date}
   */
  static now() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: ColombiaTime.TIMEZONE }));
  }

  /**
   * Get today's date at midnight in Colombia timezone
   * @returns {Date}
   */
  static today() {
    const now = ColombiaTime.now();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  /**
   * Get current hour in Colombia (0-23)
   * @returns {number}
   */
  static currentHour() {
    return ColombiaTime.now().getHours();
  }

  /**
   * Convert a date to Colombia timezone
   * @param {Date} date 
   * @returns {Date}
   */
  static toColombiaTime(date) {
    return new Date(date.toLocaleString('en-US', { timeZone: ColombiaTime.TIMEZONE }));
  }

  /**
   * Create a date in Colombia timezone
   * @param {number} year 
   * @param {number} month - 0-indexed
   * @param {number} day 
   * @param {number} hour 
   * @param {number} minute 
   * @returns {Date}
   */
  static createDate(year, month, day, hour = 0, minute = 0) {
    // Create date string in Colombia timezone
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    
    // Parse as local Colombia time
    const date = new Date(dateStr);
    return date;
  }

  /**
   * Get date string in YYYY-MM-DD format for Colombia
   * @param {Date} date 
   * @returns {string}
   */
  static toDateString(date) {
    const colombiaDate = ColombiaTime.toColombiaTime(date);
    const year = colombiaDate.getFullYear();
    const month = String(colombiaDate.getMonth() + 1).padStart(2, '0');
    const day = String(colombiaDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format date for display in Spanish
   * @param {Date} date 
   * @param {Object} options - Intl.DateTimeFormat options
   * @returns {string}
   */
  static format(date, options = {}) {
    const defaultOptions = {
      timeZone: ColombiaTime.TIMEZONE,
      ...options
    };
    return date.toLocaleDateString('es-CO', defaultOptions);
  }

  /**
   * Format time for display
   * @param {Date} date 
   * @returns {string}
   */
  static formatTime(date) {
    return date.toLocaleTimeString('es-CO', {
      timeZone: ColombiaTime.TIMEZONE,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Check if a date is today in Colombia
   * @param {Date} date 
   * @returns {boolean}
   */
  static isToday(date) {
    const today = ColombiaTime.today();
    const checkDate = ColombiaTime.toColombiaTime(date);
    return today.toDateString() === checkDate.toDateString();
  }

  /**
   * Check if a date is in the past (Colombia time)
   * @param {Date} date 
   * @returns {boolean}
   */
  static isPast(date) {
    return date < ColombiaTime.now();
  }

  /**
   * Get an array of dates starting from today
   * @param {number} days - Number of days to include
   * @returns {Date[]}
   */
  static getNextDays(days) {
    const result = [];
    const today = ColombiaTime.today();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      result.push(date);
    }
    
    return result;
  }

  /**
   * Parse a date string (YYYY-MM-DD) as Colombia time
   * @param {string} dateStr 
   * @param {number} hour 
   * @param {number} minute 
   * @returns {Date}
   */
  static parseDate(dateStr, hour = 12, minute = 0) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return ColombiaTime.createDate(year, month - 1, day, hour, minute);
  }
}