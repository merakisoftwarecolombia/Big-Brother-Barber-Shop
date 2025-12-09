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
      
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        header: '💈 Ya tienes una cita',
        body: `Ya tienes una cita programada.\n\nSi deseas cambiarla, primero cancela la actual.`,
        buttons: [
          { id: `cancel_${existing.id.substring(0, 8)}`, title: 'Cancelar cita' },
          { id: 'btn_ver_citas', title: 'Ver mi cita' }
        ]
      });
      
      return null;
    }

    // Validate future date
    if (new Date(dateTime) <= new Date()) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: 'La fecha debe ser en el futuro. Por favor intenta de nuevo.',
        buttons: [
          { id: 'btn_agendar', title: 'Intentar de nuevo' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
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