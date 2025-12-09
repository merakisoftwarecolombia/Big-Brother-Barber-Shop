/**
 * Cancel Appointment Use Case - Application Layer
 * Handles the business logic for cancelling appointments
 */
export class CancelAppointment {
  #appointmentRepository;
  #messagingService;

  constructor({ appointmentRepository, messagingService }) {
    this.#appointmentRepository = appointmentRepository;
    this.#messagingService = messagingService;
  }

  async execute({ appointmentId, phoneNumber }) {
    const appointment = await this.#appointmentRepository.findById(appointmentId);
    
    if (!appointment) {
      await this.#messagingService.sendMessage(
        phoneNumber,
        'No se encontró la cita. Verifica el ID e intenta de nuevo.'
      );
      return null;
    }

    if (appointment.phoneNumber !== phoneNumber) {
      await this.#messagingService.sendMessage(
        phoneNumber,
        'No tienes permiso para cancelar esta cita.'
      );
      return null;
    }

    if (appointment.status === 'cancelled') {
      await this.#messagingService.sendMessage(
        phoneNumber,
        'Esta cita ya fue cancelada anteriormente.'
      );
      return null;
    }

    appointment.cancel();
    await this.#appointmentRepository.save(appointment);

    const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    await this.#messagingService.sendMessage(
      phoneNumber,
      `💈 Tu cita del ${dateStr} ha sido cancelada.\n\n` +
      `Escribe *agendar* cuando quieras programar una nueva cita.`
    );

    return appointment;
  }
}