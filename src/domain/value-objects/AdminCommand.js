/**
 * AdminCommand Value Object - Domain Layer
 * Represents a parsed admin command from user input
 * 
 * Command format: "admin <barber_alias> <pin> [action] [params...]"
 * 
 * Examples:
 * - "admin carlos 1234" - Access admin panel
 * - "admin carlos 1234 hoy" - View today's appointments
 * - "admin carlos 1234 semana" - View week's appointments
 * - "admin carlos 1234 cancelar abc123" - Cancel appointment
 * - "admin carlos 1234 bloquear 14:00" - Block time slot
 * - "admin carlos 1234 desbloquear 14:00" - Unblock time slot
 * - "admin carlos 1234 completar abc123" - Mark appointment as completed
 * - "admin carlos 1234 nota abc123 Cliente prefiere corte bajo" - Add note
 * - "admin carlos 1234 stats" - View statistics
 */
export class AdminCommand {
  static ACTIONS = Object.freeze({
    PANEL: 'panel',           // Default - show admin panel menu
    TODAY: 'hoy',             // View today's appointments
    WEEK: 'semana',           // View week's appointments
    CANCEL: 'cancelar',       // Cancel an appointment
    BLOCK: 'bloquear',        // Block a time slot
    UNBLOCK: 'desbloquear',   // Unblock a time slot
    COMPLETE: 'completar',    // Mark appointment as completed
    NOTE: 'nota',             // Add note to client
    STATS: 'stats',           // View statistics
    HELP: 'ayuda'             // Show help
  });

  #barberAlias;
  #pin;
  #action;
  #params;
  #rawInput;

  /**
   * Private constructor - use static factory method
   */
  constructor({ barberAlias, pin, action, params, rawInput }) {
    this.#barberAlias = barberAlias;
    this.#pin = pin;
    this.#action = action;
    this.#params = params;
    this.#rawInput = rawInput;
  }

  /**
   * Parse a text message into an AdminCommand
   * @param {string} text - The raw message text
   * @returns {AdminCommand|null} - Parsed command or null if not an admin command
   */
  static parse(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const sanitized = text.trim().toLowerCase();
    
    // Check if it starts with "admin"
    if (!sanitized.startsWith('admin ')) {
      return null;
    }

    // Split into parts: admin <alias> <pin> [action] [params...]
    const parts = sanitized.split(/\s+/);
    
    if (parts.length < 3) {
      return null; // Need at least: admin, alias, pin
    }

    const [, barberAlias, pin, action, ...params] = parts;

    // Validate barber alias (alphanumeric, 2-20 chars)
    if (!barberAlias || !/^[a-z0-9]{2,20}$/.test(barberAlias)) {
      return null;
    }

    // Validate PIN format (4-6 digits)
    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return null;
    }

    // Determine action (default to PANEL if not specified)
    const normalizedAction = AdminCommand.#normalizeAction(action);

    // For NOTE action, preserve original case for the note content
    let finalParams = params;
    if (normalizedAction === AdminCommand.ACTIONS.NOTE && params.length > 1) {
      // Re-extract params from original text to preserve case
      const originalParts = text.trim().split(/\s+/);
      finalParams = originalParts.slice(5); // Skip: admin, alias, pin, action, appointmentId
      if (originalParts[4]) {
        finalParams = [originalParts[4], ...finalParams];
      }
    }

    return new AdminCommand({
      barberAlias,
      pin,
      action: normalizedAction,
      params: finalParams,
      rawInput: text
    });
  }

  /**
   * Normalize action string to known action
   * @param {string} action 
   * @returns {string}
   */
  static #normalizeAction(action) {
    if (!action) {
      return AdminCommand.ACTIONS.PANEL;
    }

    const actionMap = {
      'hoy': AdminCommand.ACTIONS.TODAY,
      'today': AdminCommand.ACTIONS.TODAY,
      'semana': AdminCommand.ACTIONS.WEEK,
      'week': AdminCommand.ACTIONS.WEEK,
      'cancelar': AdminCommand.ACTIONS.CANCEL,
      'cancel': AdminCommand.ACTIONS.CANCEL,
      'bloquear': AdminCommand.ACTIONS.BLOCK,
      'block': AdminCommand.ACTIONS.BLOCK,
      'desbloquear': AdminCommand.ACTIONS.UNBLOCK,
      'unblock': AdminCommand.ACTIONS.UNBLOCK,
      'completar': AdminCommand.ACTIONS.COMPLETE,
      'complete': AdminCommand.ACTIONS.COMPLETE,
      'nota': AdminCommand.ACTIONS.NOTE,
      'note': AdminCommand.ACTIONS.NOTE,
      'stats': AdminCommand.ACTIONS.STATS,
      'estadisticas': AdminCommand.ACTIONS.STATS,
      'ayuda': AdminCommand.ACTIONS.HELP,
      'help': AdminCommand.ACTIONS.HELP
    };

    return actionMap[action] || AdminCommand.ACTIONS.PANEL;
  }

  /**
   * Check if a text message is an admin command
   * @param {string} text 
   * @returns {boolean}
   */
  static isAdminCommand(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    return text.trim().toLowerCase().startsWith('admin ');
  }

  get barberAlias() { return this.#barberAlias; }
  get pin() { return this.#pin; }
  get action() { return this.#action; }
  get params() { return [...this.#params]; }
  get rawInput() { return this.#rawInput; }

  /**
   * Get the first parameter (commonly used for IDs)
   * @returns {string|null}
   */
  getFirstParam() {
    return this.#params[0] || null;
  }

  /**
   * Get parameters joined as a string (for notes)
   * @param {number} startIndex - Start index for joining
   * @returns {string}
   */
  getParamsAsString(startIndex = 0) {
    return this.#params.slice(startIndex).join(' ');
  }

  /**
   * Validate that required params exist for the action
   * @returns {{valid: boolean, error: string|null}}
   */
  validateParams() {
    switch (this.#action) {
      case AdminCommand.ACTIONS.CANCEL:
      case AdminCommand.ACTIONS.COMPLETE:
        if (!this.#params[0]) {
          return { valid: false, error: 'Se requiere el ID de la cita' };
        }
        break;
      
      case AdminCommand.ACTIONS.BLOCK:
      case AdminCommand.ACTIONS.UNBLOCK:
        if (!this.#params[0]) {
          return { valid: false, error: 'Se requiere la hora (ej: 14:00)' };
        }
        if (!/^\d{1,2}:\d{2}$/.test(this.#params[0])) {
          return { valid: false, error: 'Formato de hora inválido. Use HH:MM (ej: 14:00)' };
        }
        break;
      
      case AdminCommand.ACTIONS.NOTE:
        if (!this.#params[0]) {
          return { valid: false, error: 'Se requiere el ID de la cita' };
        }
        if (!this.#params[1]) {
          return { valid: false, error: 'Se requiere el texto de la nota' };
        }
        break;
    }

    return { valid: true, error: null };
  }
}