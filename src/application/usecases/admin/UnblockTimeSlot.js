/**
 * UnblockTimeSlot Use Case - Application Layer
 * Allows a barber to unblock a previously blocked time slot
 */
export class UnblockTimeSlot {
  #blockedSlotRepository;

  constructor({ blockedSlotRepository }) {
    this.#blockedSlotRepository = blockedSlotRepository;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @param {string} params.time - Time to unblock (HH:MM format)
   * @param {Date} params.date - Date to unblock (optional, defaults to today)
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async execute({ barberId, time, date = null }) {
    if (!barberId || typeof barberId !== 'string') {
      return { success: false, error: 'ID de barbero inválido' };
    }

    if (!time || typeof time !== 'string') {
      return { success: false, error: 'Hora inválida' };
    }

    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(time)) {
      return { success: false, error: 'Formato de hora inválido. Use HH:MM (ej: 14:00)' };
    }

    // Use today if no date provided
    const unblockDate = date ? new Date(date) : new Date();
    unblockDate.setHours(0, 0, 0, 0);

    // Normalize time
    const normalizedTime = this.#normalizeTime(time);

    // Try to delete the blocked slot
    const deleted = await this.#blockedSlotRepository.deleteByBarberDateTime(
      barberId,
      unblockDate,
      normalizedTime
    );

    if (!deleted) {
      return { success: false, error: 'No se encontró un bloqueo para ese horario' };
    }

    return { success: true, error: null };
  }

  #normalizeTime(time) {
    const [hour, minute] = time.split(':');
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
}