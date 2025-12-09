import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * Schedule Appointment Use Case - Application Layer
 * Handles the business logic for scheduling new appointments
 * 
 * Business Rules:
 * - Only one active appointment per phone number
 * - Must include service type (corte, barba, corte_barba)
 * - Appointment date must be in the future
 */
export class ScheduleAppointment {
  #appointmentRepository;
  #messagingService;

  constructor({ appointmentRepository, messagingService }) {
    this.#appointmentRepository = appointmentRepository;
    this.#messagingService = messagingService;
  }

  async execute({ phoneNumber, customerName, serviceType, dateTime }) {
    // Check for existing active appointment
    const hasActive = await this.#appointmentRepository.hasActiveAppointment(phoneNumber);
    
    if (hasActive) {
      const existing = await this.#appointmentRepository.findByPhone(phoneNumber);
      const dateStr = existing.dateTime.toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      await this.#messagingService.sendMessage(
        phoneNumber,
        `Ya tienes una cita programada para el ${dateStr}.\n\n` +
        `Si deseas cambiarla, primero cancela la actual escribiendo:\n` +
        `*cancelar ${existing.id.substring(0, 8)}*`
      );
      
      return null;
    }

    // Validate future date
    if (new Date(dateTime) <= new Date()) {
      await this.#messagingService.sendMessage(
        phoneNumber,
        'La fecha debe ser en el futuro. Por favor intenta de nuevo.'
      );
      return null;
    }

    const appointment = new Appointment({
      phoneNumber,
      customerName,
      serviceType,
      dateTime
    });

    await this.#appointmentRepository.save(appointment);
    
    await this.#messagingService.sendConfirmation(phoneNumber, appointment);

    return appointment;
  }
}