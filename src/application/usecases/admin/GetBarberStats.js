import { Appointment } from '../../../domain/entities/Appointment.js';

/**
 * GetBarberStats Use Case - Application Layer
 * Retrieves statistics for a barber (monthly appointments, popular services)
 */
export class GetBarberStats {
  #appointmentRepository;

  constructor({ appointmentRepository }) {
    this.#appointmentRepository = appointmentRepository;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @returns {Promise<Object>} Statistics object
   */
  async execute({ barberId }) {
    if (!barberId || typeof barberId !== 'string') {
      throw new Error('Invalid barber ID');
    }

    const now = new Date();
    
    // Get start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get end of current month
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Get all appointments for the month
    const monthAppointments = await this.#appointmentRepository.findByDateRange(startOfMonth, endOfMonth);
    
    // Filter by barber
    const barberAppointments = monthAppointments.filter(apt => apt.barberId === barberId);

    // Calculate statistics
    const stats = {
      month: this.#getMonthName(now.getMonth()),
      year: now.getFullYear(),
      
      // Total counts
      totalAppointments: barberAppointments.length,
      completedAppointments: barberAppointments.filter(apt => apt.status === 'completed').length,
      cancelledAppointments: barberAppointments.filter(apt => apt.status === 'cancelled').length,
      pendingAppointments: barberAppointments.filter(apt => 
        apt.status === 'pending' || apt.status === 'confirmed'
      ).length,

      // Service breakdown
      serviceBreakdown: this.#calculateServiceBreakdown(barberAppointments),
      
      // Most popular service
      mostPopularService: this.#getMostPopularService(barberAppointments),

      // Daily average (excluding cancelled)
      dailyAverage: this.#calculateDailyAverage(barberAppointments, startOfMonth, now),

      // Busiest day of week
      busiestDay: this.#getBusiestDayOfWeek(barberAppointments),

      // Peak hours
      peakHours: this.#getPeakHours(barberAppointments),

      // Completion rate
      completionRate: this.#calculateCompletionRate(barberAppointments)
    };

    return stats;
  }

  #getMonthName(monthIndex) {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return months[monthIndex];
  }

  #calculateServiceBreakdown(appointments) {
    const nonCancelled = appointments.filter(apt => apt.status !== 'cancelled');
    const breakdown = {};

    for (const apt of nonCancelled) {
      const serviceLabel = Appointment.getServiceTypeLabel(apt.serviceType);
      breakdown[serviceLabel] = (breakdown[serviceLabel] || 0) + 1;
    }

    return breakdown;
  }

  #getMostPopularService(appointments) {
    const breakdown = this.#calculateServiceBreakdown(appointments);
    let maxCount = 0;
    let mostPopular = null;

    for (const [service, count] of Object.entries(breakdown)) {
      if (count > maxCount) {
        maxCount = count;
        mostPopular = service;
      }
    }

    return mostPopular ? { service: mostPopular, count: maxCount } : null;
  }

  #calculateDailyAverage(appointments, startDate, endDate) {
    const nonCancelled = appointments.filter(apt => apt.status !== 'cancelled');
    const daysPassed = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    return Math.round((nonCancelled.length / daysPassed) * 10) / 10;
  }

  #getBusiestDayOfWeek(appointments) {
    const nonCancelled = appointments.filter(apt => apt.status !== 'cancelled');
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayCounts = new Array(7).fill(0);

    for (const apt of nonCancelled) {
      const dayOfWeek = apt.dateTime.getDay();
      dayCounts[dayOfWeek]++;
    }

    let maxCount = 0;
    let busiestDay = null;

    for (let i = 0; i < 7; i++) {
      if (dayCounts[i] > maxCount) {
        maxCount = dayCounts[i];
        busiestDay = dayNames[i];
      }
    }

    return busiestDay ? { day: busiestDay, count: maxCount } : null;
  }

  #getPeakHours(appointments) {
    const nonCancelled = appointments.filter(apt => apt.status !== 'cancelled');
    const hourCounts = {};

    for (const apt of nonCancelled) {
      const hour = apt.dateTime.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    // Sort by count and get top 3
    const sortedHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({
        hour: `${hour}:00`,
        count
      }));

    return sortedHours;
  }

  #calculateCompletionRate(appointments) {
    const nonCancelled = appointments.filter(apt => apt.status !== 'cancelled');
    if (nonCancelled.length === 0) return 0;

    const completed = appointments.filter(apt => apt.status === 'completed').length;
    return Math.round((completed / nonCancelled.length) * 100);
  }
}