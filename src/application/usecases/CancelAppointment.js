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
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: 'No se encontró la cita. Verifica el ID e intenta de nuevo.',
        buttons: [
          { id: 'btn_ver_citas', title: 'Ver mi cita' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
      return null;
    }

    if (appointment.phoneNumber !== phoneNumber) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: 'No tienes permiso para cancelar esta cita.',
        buttons: [
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
      return null;
    }

    if (appointment.status === 'cancelled') {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: 'Esta cita ya fue cancelada anteriormente.',
        buttons: [
          { id: 'btn_agendar', title: 'Agendar nueva cita' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
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

    await this.#messagingService.sendCancellationConfirmation(phoneNumber, dateStr);

    return appointment;
  }
}