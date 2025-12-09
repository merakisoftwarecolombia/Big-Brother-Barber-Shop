/**
 * List Appointments Use Case - Application Layer
 * Handles the business logic for listing user appointments
 */
export class ListAppointments {
  #appointmentRepository;

  constructor({ appointmentRepository }) {
    this.#appointmentRepository = appointmentRepository;
  }

  async execute({ phoneNumber }) {
    const appointments = await this.#appointmentRepository.findByPhone(phoneNumber);
    return appointments.filter(apt => 
      apt.status !== 'cancelled' && apt.dateTime > new Date()
    );
  }
}