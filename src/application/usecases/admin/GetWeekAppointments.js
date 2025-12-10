/**
 * GetWeekAppointments Use Case - Application Layer
 * Retrieves appointment summary for a barber for the current week
 */
export class GetWeekAppointments {
  #appointmentRepository;

  constructor({ appointmentRepository }) {
    this.#appointmentRepository = appointmentRepository;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @returns {Promise<{weekSummary: Object[], totalWeek: number}>}
   */
  async execute({ barberId }) {
    if (!barberId || typeof barberId !== 'string') {
      throw new Error('Invalid barber ID');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get start of week (Monday)
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust for Sunday
    startOfWeek.setDate(today.getDate() + diff);

    // Get end of week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Get all appointments for the week
    const appointments = await this.#appointmentRepository.findByDateRange(startOfWeek, endOfWeek);

    // Filter by barber and non-cancelled
    const barberAppointments = appointments.filter(
      apt => apt.barberId === barberId && apt.status !== 'cancelled'
    );

    // Group by day
    const weekSummary = [];
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      
      const dayAppointments = barberAppointments.filter(apt => {
        const aptDate = new Date(apt.dateTime);
        return aptDate.toDateString() === date.toDateString();
      });

      const isToday = date.toDateString() === today.toDateString();
      const isPast = date < today && !isToday;

      weekSummary.push({
        date: new Date(date),
        dayName: dayNames[date.getDay()],
        dayNumber: date.getDate(),
        isToday,
        isPast,
        count: dayAppointments.length,
        completed: dayAppointments.filter(apt => apt.status === 'completed').length,
        pending: dayAppointments.filter(apt => apt.status === 'pending' || apt.status === 'confirmed').length
      });
    }

    // Calculate totals
    const totalWeek = barberAppointments.length;
    const completedWeek = barberAppointments.filter(apt => apt.status === 'completed').length;
    const pendingWeek = barberAppointments.filter(apt => apt.status === 'pending' || apt.status === 'confirmed').length;

    return {
      weekSummary,
      totalWeek,
      completedWeek,
      pendingWeek,
      startDate: startOfWeek,
      endDate: endOfWeek
    };
  }
}