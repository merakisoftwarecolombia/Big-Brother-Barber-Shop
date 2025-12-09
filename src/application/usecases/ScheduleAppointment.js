import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * Schedule Appointment Use Case - Application Layer
 * Handles the business logic for scheduling new appointments
 */
export class ScheduleAppointment {
  #appointmentRepository;
  #messagingService;

  constructor({ appointmentRepository, messagingService }) {
    this.#appointmentRepository = appointmentRepository;
    this.#messagingService = messagingService;
  }

  async execute({ phoneNumber, customerName, dateTime }) {
    const appointment = new Appointment({
      phoneNumber,
      customerName,
      dateTime
    });

    await this.#appointmentRepository.save(appointment);
    
    await this.#messagingService.sendConfirmation(
      phoneNumber,
      appointment
    );

    return appointment;
  }
}