import { ClientNote } from '../../../domain/entities/ClientNote.js';

/**
 * AddClientNote Use Case - Application Layer
 * Allows a barber to add a note about a client
 */
export class AddClientNote {
  #clientNoteRepository;
  #appointmentRepository;

  constructor({ clientNoteRepository, appointmentRepository }) {
    this.#clientNoteRepository = clientNoteRepository;
    this.#appointmentRepository = appointmentRepository;
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.barberId - The barber's ID
   * @param {string} params.appointmentIdPrefix - First characters of appointment ID
   * @param {string} params.noteContent - The note content
   * @returns {Promise<{success: boolean, note: ClientNote|null, error: string|null}>}
   */
  async execute({ barberId, appointmentIdPrefix, noteContent }) {
    if (!barberId || typeof barberId !== 'string') {
      return { success: false, note: null, error: 'ID de barbero inválido' };
    }

    if (!appointmentIdPrefix || typeof appointmentIdPrefix !== 'string') {
      return { success: false, note: null, error: 'ID de cita inválido' };
    }

    if (!noteContent || typeof noteContent !== 'string' || noteContent.trim().length === 0) {
      return { success: false, note: null, error: 'El contenido de la nota no puede estar vacío' };
    }

    if (noteContent.length > ClientNote.MAX_CONTENT_LENGTH) {
      return { 
        success: false, 
        note: null, 
        error: `La nota no puede exceder ${ClientNote.MAX_CONTENT_LENGTH} caracteres` 
      };
    }

    // Find appointment by prefix
    const appointment = await this.#findAppointmentByPrefix(barberId, appointmentIdPrefix);

    if (!appointment) {
      return { success: false, note: null, error: 'Cita no encontrada' };
    }

    // Verify barber owns this appointment
    if (appointment.barberId !== barberId) {
      return { success: false, note: null, error: 'No tienes permiso para agregar notas a esta cita' };
    }

    try {
      // Create the note
      const note = new ClientNote({
        phoneNumber: appointment.phoneNumber,
        barberId,
        appointmentId: appointment.id,
        content: noteContent.trim()
      });

      await this.#clientNoteRepository.save(note);

      return { success: true, note, error: null };
    } catch (error) {
      return { success: false, note: null, error: error.message };
    }
  }

  async #findAppointmentByPrefix(barberId, prefix) {
    // Search in recent appointments (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const appointments = await this.#appointmentRepository.findByDateRange(startDate, endDate);
    
    // Find appointment matching prefix and barber
    const normalizedPrefix = prefix.toLowerCase().trim();
    return appointments.find(apt => 
      apt.barberId === barberId && 
      apt.id.toLowerCase().startsWith(normalizedPrefix)
    );
  }
}