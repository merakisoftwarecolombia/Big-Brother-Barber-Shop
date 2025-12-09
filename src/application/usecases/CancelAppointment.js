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
      throw new Error('Appointment not found');
    }

    if (appointment.phoneNumber !== phoneNumber) {
      throw new Error('Unauthorized to cancel this appointment');
    }

    appointment.cancel();
    await this.#appointmentRepository.save(appointment);

    await this.#messagingService.sendMessage(
      phoneNumber,
      `Your appointment on ${appointment.dateTime.toLocaleDateString()} has been cancelled.`
    );

    return appointment;
  }
}