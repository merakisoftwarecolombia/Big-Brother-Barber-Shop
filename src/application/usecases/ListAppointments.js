/**
 * List Appointments Use Case - Application Layer
 * Handles the business logic for listing user appointments
 * 
 * Returns the single active appointment for a phone number (if exists)
 */
export class ListAppointments {
  #appointmentRepository;

  constructor({ appointmentRepository }) {
    this.#appointmentRepository = appointmentRepository;
  }

  async execute({ phoneNumber }) {
    const appointment = await this.#appointmentRepository.findByPhone(phoneNumber);
    
    if (!appointment) {
      return [];
    }
    
    // Only return if not cancelled and not in the past
    if (appointment.status === 'cancelled' || appointment.isPast()) {
      return [];
    }
    
    return [appointment];
  }
}