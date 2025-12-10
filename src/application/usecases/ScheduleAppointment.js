import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * Schedule Appointment Use Case - Application Layer
 * Handles the business logic for scheduling new appointments
 * 
 * Business Rules:
 * - Only one active appointment per phone number
 * - Must include barber, service type
 * - Appointment date must be in the future
 * - Slot must be available for the selected barber
 */
export class ScheduleAppointment {
  #appointmentRepository;
  #messagingService;

  constructor({ appointmentRepository, messagingService }) {
    this.#appointmentRepository = appointmentRepository;
    this.#messagingService = messagingService;
  }

  /**
   * Execute appointment scheduling
   * @param {Object} params
   * @param {string} params.phoneNumber - Phone number for the appointment (target)
   * @param {string} params.customerName - Customer name
   * @param {string} params.barberId - Barber ID
   * @param {string} params.barberName - Barber name for display
   * @param {string} params.serviceType - Service type
   * @param {Date} params.dateTime - Appointment date/time
   * @param {boolean} params.skipActiveCheck - Skip active appointment check (already validated)
   */
  async execute({ phoneNumber, customerName, barberId, barberName, serviceType, dateTime, skipActiveCheck = false }) {
    // Check for existing active appointment (unless already validated)
    if (!skipActiveCheck) {
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

    // Verify slot is still available
    const isAvailable = await this.#appointmentRepository.isSlotAvailable(barberId, dateTime);
    if (!isAvailable) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: 'Este horario ya no está disponible. Por favor selecciona otro.',
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
      barberId,
      serviceType,
      dateTime
    });

    await this.#appointmentRepository.save(appointment);
    
    await this.#messagingService.sendConfirmation(phoneNumber, appointment, barberName);

    return appointment;
  }
}