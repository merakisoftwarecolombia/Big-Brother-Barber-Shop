/**
 * CompleteAppointment Use Case - Application Layer
 * Allows a barber to mark an appointment as completed
 */
export class CompleteAppointment {
  #appointmentRepository;

  constructor({ appointmentRepository }) {
    this.#appointmentRepository = appointmentRepository;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @param {string} params.appointmentIdPrefix - First characters of appointment ID
   * @returns {Promise<{success: boolean, appointment: Appointment|null, error: string|null}>}
   */
  async execute({ barberId, appointmentIdPrefix }) {
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
      return { success: false, appointment: null, error: 'No tienes permiso para completar esta cita' };
    }

    // Check if already completed
    if (appointment.status === 'completed') {
      return { success: false, appointment: null, error: 'Esta cita ya fue marcada como completada' };
    }

    // Check if cancelled
    if (appointment.status === 'cancelled') {
      return { success: false, appointment: null, error: 'No se puede completar una cita cancelada' };
    }

    // Mark as completed
    appointment.complete();
    await this.#appointmentRepository.save(appointment);

    return { success: true, appointment, error: null };
  }

  async #findAppointmentByPrefix(barberId, prefix) {
    // Get today's appointments for the barber
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

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