/**
 * AuthenticateBarber Use Case - Application Layer
 * Handles barber authentication for admin panel access
 * 
 * Security:
 * - Validates barber alias exists
 * - Verifies PIN against stored hash
 * - Uses constant-time comparison to prevent timing attacks
 * - Logs authentication attempts (without sensitive data)
 */
export class AuthenticateBarber {
  #barberRepository;
  #hashService;

  constructor({ barberRepository, hashService }) {
    this.#barberRepository = barberRepository;
    this.#hashService = hashService;
  }

  /**
   * Execute authentication
   * @param {Object} params
   * @param {string} params.alias - Barber alias
   * @param {string} params.pin - Plain text PIN
   * @returns {Promise<{success: boolean, barber: Barber|null, error: string|null}>}
   */
  async execute({ alias, pin }) {
    // Validate inputs
    if (!alias || typeof alias !== 'string') {
      return { success: false, barber: null, error: 'Alias inválido' };
    }

    if (!pin || typeof pin !== 'string') {
      return { success: false, barber: null, error: 'PIN inválido' };
    }

    // Sanitize alias
    const sanitizedAlias = alias.toLowerCase().trim();

    // Find barber by alias
    const barber = await this.#barberRepository.findByAlias(sanitizedAlias);
    
    if (!barber) {
      // Log failed attempt (without revealing if alias exists)
      console.log(`Admin auth attempt: alias not found`);
      // Use generic error to prevent enumeration
      return { success: false, barber: null, error: 'Credenciales inválidas' };
    }

    // Check if barber has PIN set
    if (!barber.hasPin) {
      console.log(`Admin auth attempt: barber ${barber.id} has no PIN set`);
      return { success: false, barber: null, error: 'PIN no configurado. Contacte al administrador.' };
    }

    // Verify PIN
    const isValid = await barber.verifyPin(pin, this.#hashService.verify.bind(this.#hashService));

    if (!isValid) {
      console.log(`Admin auth attempt: invalid PIN for barber ${barber.id}`);
      return { success: false, barber: null, error: 'Credenciales inválidas' };
    }

    console.log(`Admin auth success: barber ${barber.id}`);
    return { success: true, barber, error: null };
  }
}