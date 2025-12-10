import { BlockedSlot } from '../../../domain/entities/BlockedSlot.js';

/**
 * BlockTimeSlot Use Case - Application Layer
 * Allows a barber to block a time slot (lunch, break, etc.)
 */
export class BlockTimeSlot {
  #blockedSlotRepository;
  #barberRepository;

  constructor({ blockedSlotRepository, barberRepository }) {
    this.#blockedSlotRepository = blockedSlotRepository;
    this.#barberRepository = barberRepository;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @param {string} params.time - Time to block (HH:MM format)
   * @param {Date} params.date - Date to block (optional, defaults to today)
   * @param {string} params.reason - Reason for blocking (optional)
   * @returns {Promise<{success: boolean, blockedSlot: BlockedSlot|null, error: string|null}>}
   */
  async execute({ barberId, time, date = null, reason = BlockedSlot.REASONS.OTHER }) {
    if (!barberId || typeof barberId !== 'string') {
      return { success: false, blockedSlot: null, error: 'ID de barbero inválido' };
    }

    if (!time || typeof time !== 'string') {
      return { success: false, blockedSlot: null, error: 'Hora inválida' };
    }

    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(time)) {
      return { success: false, blockedSlot: null, error: 'Formato de hora inválido. Use HH:MM (ej: 14:00)' };
    }

    // Verify barber exists
    const barber = await this.#barberRepository.findById(barberId);
    if (!barber) {
      return { success: false, blockedSlot: null, error: 'Barbero no encontrado' };
    }

    // Use today if no date provided
    const blockDate = date ? new Date(date) : new Date();
    blockDate.setHours(0, 0, 0, 0);

    // Validate time is within working hours
    const [hour] = time.split(':').map(Number);
    const { start, end } = barber.workingHours;
    
    if (hour < start || hour >= end) {
      return { 
        success: false, 
        blockedSlot: null, 
        error: `La hora debe estar entre ${start}:00 y ${end - 1}:00` 
      };
    }

    // Check if already blocked
    const existingBlocks = await this.#blockedSlotRepository.findByBarberAndDate(barberId, blockDate);
    const alreadyBlocked = existingBlocks.some(block => block.startTime === this.#normalizeTime(time));
    
    if (alreadyBlocked) {
      return { success: false, blockedSlot: null, error: 'Este horario ya está bloqueado' };
    }

    // Create blocked slot (1 hour duration)
    try {
      const blockedSlot = BlockedSlot.createOneHourBlock(
        barberId,
        blockDate,
        this.#normalizeTime(time),
        reason
      );

      await this.#blockedSlotRepository.save(blockedSlot);

      return { success: true, blockedSlot, error: null };
    } catch (error) {
      return { success: false, blockedSlot: null, error: error.message };
    }
  }

  #normalizeTime(time) {
    const [hour, minute] = time.split(':');
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
}