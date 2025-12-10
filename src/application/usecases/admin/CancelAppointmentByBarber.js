/**
 * CancelAppointmentByBarber Use Case - Application Layer
 * Allows a barber to cancel a client's appointment
 * 
 * Business Rules:
 * - Barber can only cancel appointments assigned to them
 * - Cannot cancel already completed appointments
 * - Optionally notify the client
 */
export class CancelAppointmentByBarber {
  #appointmentRepository;
  #messagingService;

  constructor({ appointmentRepository, messagingService }) {
    this.#appointmentRepository = appointmentRepository;
    this.#messagingService = messagingService;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @param {string} params.appointmentIdPrefix - First characters of appointment ID
   * @param {boolean} params.notifyClient - Whether to notify the client
   * @returns {Promise<{success: boolean, appointment: Appointment|null, error: string|null}>}
   */
  async execute({ barberId, appointmentIdPrefix, notifyClient = true }) {
    if (!barberId || typeof barberId !== 'string') {
      return { success: false, appointment: null, error: 'ID de barbero inválido' };
    }

    if (!appointmentIdPrefix || typeof appointmentIdPrefix !== 'string') {
      return { success: false, appointment: null, error: 'ID de cita inválido' };
    }

    // Find appointment by prefix
    const appointment = await this.#findAppointmentByPrefix(barberId, appointmentIdPrefix);

    if (!appointment) {
      return { success: false, appointment: null, error: 'Cita no encontrada' };
    }

    // Verify barber owns this appointment
    if (appointment.barberId !== barberId) {
      return { success: false, appointment: null, error: 'No tienes permiso para cancelar esta cita' };
    }

    // Check if already cancelled or completed
    if (appointment.status === 'cancelled') {
      return { success: false, appointment: null, error: 'Esta cita ya fue cancelada' };
    }

    if (appointment.status === 'completed') {
      return { success: false, appointment: null, error: 'No se puede cancelar una cita completada' };
    }

    // Cancel the appointment
    appointment.cancel();
    await this.#appointmentRepository.save(appointment);

    // Notify client if requested
    if (notifyClient && this.#messagingService) {
      try {
        const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit'
        });

        await this.#messagingService.sendMessage(
          appointment.phoneNumber,
          `⚠️ *Cita Cancelada*\n\nHola ${appointment.customerName},\n\nTu cita del ${dateStr} ha sido cancelada por el barbero.\n\nPuedes agendar una nueva cita cuando lo desees.\n\nEscribe *hola* para comenzar.`
        );
      } catch (error) {
        console.error('Error notifying client of cancellation:', error.message);
        // Don't fail the operation if notification fails
      }
    }

    return { success: true, appointment, error: null };
  }

  async #findAppointmentByPrefix(barberId, prefix) {
    // Get today's appointments for the barber
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 7); // Search within a week

    const appointments = await this.#appointmentRepository.findByDateRange(today, tomorrow);
    
    // Find appointment matching prefix and barber
    const normalizedPrefix = prefix.toLowerCase().trim();
    return appointments.find(apt => 
      apt.barberId === barberId && 
      apt.id.toLowerCase().startsWith(normalizedPrefix) &&
      apt.status !== 'cancelled'
    );
  }
}