/**
 * GetTodayAppointments Use Case - Application Layer
 * Retrieves all appointments for a barber for the current day
 */
export class GetTodayAppointments {
  #appointmentRepository;

  constructor({ appointmentRepository }) {
    this.#appointmentRepository = appointmentRepository;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @returns {Promise<{appointments: Appointment[], summary: Object}>}
   */
  async execute({ barberId }) {
    if (!barberId || typeof barberId !== 'string') {
      throw new Error('Invalid barber ID');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments = await this.#appointmentRepository.findByBarberAndDate(barberId, today);

    // Sort by time
    const sortedAppointments = appointments
      .filter(apt => apt.status !== 'cancelled')
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

    // Generate summary
    const summary = {
      total: sortedAppointments.length,
      pending: sortedAppointments.filter(apt => apt.status === 'pending').length,
      confirmed: sortedAppointments.filter(apt => apt.status === 'confirmed').length,
      completed: sortedAppointments.filter(apt => apt.status === 'completed').length,
      nextAppointment: this.#getNextAppointment(sortedAppointments)
    };

    return { appointments: sortedAppointments, summary };
  }

  #getNextAppointment(appointments) {
    const now = new Date();
    const upcoming = appointments.find(apt => 
      apt.dateTime > now && 
      apt.status !== 'completed' && 
      apt.status !== 'cancelled'
    );
    return upcoming || null;
  }
}