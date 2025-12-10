import { Appointment } from '../../domain/entities/Appointment.js';
import { AdminCommand } from '../../domain/value-objects/AdminCommand.js';

/**
 * Webhook Handler - Infrastructure Layer
 * Handles incoming WhatsApp webhook events including interactive messages
 *
 * Booking Flow:
 * 1. Name input (text)
 * 2. Barber selection (list)
 * 3. Service selection (list)
 * 4. Date selection (list with availability)
 * 5. Time selection (list with available slots)
 * 6. Confirmation
 *
 * Admin Flow:
 * - Secret command: "admin <alias> <pin> [action] [params]"
 */
export class WebhookHandler {
  #scheduleAppointment;
  #cancelAppointment;
  #listAppointments;
  #messagingService;
  #appointmentRepository;
  #adminPanelHandler;
  #conversationState = new Map();
  #conversationTimers = new Map();
  #welcomedUsers = new Set();
  #inactivityTimeout = 10 * 60 * 1000; // 10 minutes

  constructor({
    scheduleAppointment,
    cancelAppointment,
    listAppointments,
    messagingService,
    appointmentRepository,
    adminPanelHandler = null
  }) {
    this.#scheduleAppointment = scheduleAppointment;
    this.#cancelAppointment = cancelAppointment;
    this.#listAppointments = listAppointments;
    this.#messagingService = messagingService;
    this.#appointmentRepository = appointmentRepository;
    this.#adminPanelHandler = adminPanelHandler;
  }

  #resetInactivityTimer(phoneNumber) {
    if (this.#conversationTimers.has(phoneNumber)) {
      clearTimeout(this.#conversationTimers.get(phoneNumber));
    }

    if (this.#conversationState.has(phoneNumber)) {
      const timer = setTimeout(async () => {
        await this.#closeInactiveConversation(phoneNumber);
      }, this.#inactivityTimeout);
      
      this.#conversationTimers.set(phoneNumber, timer);
    }
  }

  async #closeInactiveConversation(phoneNumber) {
    if (this.#conversationState.has(phoneNumber)) {
      this.#conversationState.delete(phoneNumber);
      this.#conversationTimers.delete(phoneNumber);
      this.#welcomedUsers.delete(phoneNumber);
      
      try {
        await this.#messagingService.sendMessage(
          phoneNumber,
          '*Sesión cerrada por inactividad*\n\nHan pasado 10 minutos sin actividad.\n\n💈 Gracias por contactar a Big Brother Barber Shop\n\nEscribe *hola* cuando quieras volver.'
        );
      } catch (error) {
        console.error('Error sending inactivity message:', error.message);
      }
    }
  }

  #clearInactivityTimer(phoneNumber) {
    if (this.#conversationTimers.has(phoneNumber)) {
      clearTimeout(this.#conversationTimers.get(phoneNumber));
      this.#conversationTimers.delete(phoneNumber);
    }
  }

  async handleMessage(message) {
    const phoneNumber = message.from;
    
    try {
      this.#resetInactivityTimer(phoneNumber);

      // Handle interactive message responses
      if (message.type === 'interactive') {
        return this.#handleInteractiveResponse(phoneNumber, message.interactive);
      }

      // Handle text messages
      const text = message.text?.body?.trim() || '';
      const textLower = text.toLowerCase();

      // Check for admin command FIRST (before any other processing)
      // Admin commands are secret and should not be logged with sensitive data
      if (AdminCommand.isAdminCommand(text) && this.#adminPanelHandler) {
        // Clear any conversation state when entering admin mode
        this.#conversationState.delete(phoneNumber);
        this.#clearInactivityTimer(phoneNumber);
        
        const handled = await this.#adminPanelHandler.handleCommand(phoneNumber, text);
        if (handled) {
          return; // Admin command was processed
        }
      }

      // Check if user has active admin session (for text input like notes)
      if (this.#adminPanelHandler && this.#adminPanelHandler.hasActiveSession(phoneNumber)) {
        const handled = await this.#adminPanelHandler.handleTextMessage(phoneNumber, text);
        if (handled) {
          return;
        }
      }

      // Check if user is in a conversation flow
      const state = this.#conversationState.get(phoneNumber);
      if (state) {
        if (textLower === 'menu' || textLower === 'inicio' || textLower === 'salir') {
          this.#clearInactivityTimer(phoneNumber);
          this.#conversationState.delete(phoneNumber);
          return this.#messagingService.sendWelcomeMenu(phoneNumber);
        }
        return this.#handleConversationFlow(phoneNumber, textLower, state);
      }

      // First message - welcome
      const isFirstMessage = !this.#welcomedUsers.has(phoneNumber);
      if (isFirstMessage) {
        this.#welcomedUsers.add(phoneNumber);
        return this.#messagingService.sendWelcomeMenu(phoneNumber);
      }

      // Text commands
      if (textLower === 'hola' || textLower === 'menu' || textLower === 'inicio') {
        return this.#messagingService.sendWelcomeMenu(phoneNumber);
      }

      if (textLower === 'agendar' || textLower === '1') {
        return this.#startScheduling(phoneNumber);
      }

      if (textLower === 'citas' || textLower === 'mi cita' || textLower === '2') {
        return this.#showAppointments(phoneNumber);
      }

      if (textLower.startsWith('cancelar ')) {
        return this.#handleCancelCommand(phoneNumber, textLower);
      }

      // Default: show menu
      return this.#messagingService.sendWelcomeMenu(phoneNumber);
    } catch (error) {
      console.error('Error handling message:', error.message);
      return this.#messagingService.sendMessage(
        phoneNumber,
        'Ocurrió un error. Por favor intenta de nuevo.'
      );
    }
  }

  async #handleInteractiveResponse(phoneNumber, interactive) {
    let buttonId;
    
    if (interactive.type === 'button_reply') {
      buttonId = interactive.button_reply.id;
    } else if (interactive.type === 'list_reply') {
      buttonId = interactive.list_reply.id;
    } else {
      return this.#messagingService.sendWelcomeMenu(phoneNumber);
    }

    console.log(`Interactive response: ${buttonId} from ${phoneNumber}`);

    // Check if this is an admin panel interaction
    if (buttonId.startsWith('adm_') && this.#adminPanelHandler) {
      const handled = await this.#adminPanelHandler.handleInteractiveResponse(phoneNumber, buttonId);
      if (handled) {
        return;
      }
    }

    // Handle main menu buttons
    if (buttonId === 'btn_agendar') {
      return this.#startScheduling(phoneNumber);
    }

    if (buttonId === 'btn_ver_citas') {
      return this.#showAppointments(phoneNumber);
    }

    if (buttonId === 'btn_menu') {
      this.#conversationState.delete(phoneNumber);
      this.#clearInactivityTimer(phoneNumber);
      return this.#messagingService.sendWelcomeMenu(phoneNumber);
    }

    // Handle cancel button
    if (buttonId.startsWith('cancel_')) {
      const appointmentIdPart = buttonId.replace('cancel_', '');
      return this.#handleCancel(phoneNumber, appointmentIdPart);
    }

    // Handle barber selection
    if (buttonId.startsWith('barber_')) {
      return this.#handleBarberSelection(phoneNumber, buttonId);
    }

    // Handle service selection
    if (buttonId.startsWith('srv_')) {
      return this.#handleServiceSelection(phoneNumber, buttonId);
    }

    // Handle date selection
    if (buttonId.startsWith('date_')) {
      return this.#handleDateSelection(phoneNumber, buttonId);
    }

    // Handle time selection
    if (buttonId.startsWith('time_')) {
      return this.#handleTimeSelection(phoneNumber, buttonId);
    }

    // Default
    return this.#messagingService.sendWelcomeMenu(phoneNumber);
  }

  async #startScheduling(phoneNumber) {
    this.#conversationState.set(phoneNumber, { step: 'name' });
    this.#resetInactivityTimer(phoneNumber);
    return this.#messagingService.sendMessage(
      phoneNumber,
      '💈 *Agendar Cita*\n\nPor favor, escribe tu *nombre completo*:'
    );
  }

  async #handleConversationFlow(phoneNumber, text, state) {
    if (state.step === 'name') {
      if (text.length < 2 || text.length > 100) {
        return this.#messagingService.sendMessage(
          phoneNumber,
          'El nombre debe tener entre 2 y 100 caracteres. Intenta de nuevo:'
        );
      }
      
      // Save name and show barber selection
      state.customerName = text;
      state.step = 'barber';
      this.#conversationState.set(phoneNumber, state);
      
      // Get all barbers
      const barbers = await this.#appointmentRepository.findAllBarbers();
      return this.#messagingService.sendBarberSelection(phoneNumber, barbers, text);
    }

    // For other steps, show menu
    this.#conversationState.delete(phoneNumber);
    this.#clearInactivityTimer(phoneNumber);
    return this.#messagingService.sendWelcomeMenu(phoneNumber);
  }

  async #handleBarberSelection(phoneNumber, buttonId) {
    const state = this.#conversationState.get(phoneNumber);
    
    if (!state || state.step !== 'barber') {
      return this.#startScheduling(phoneNumber);
    }

    // Extract barber ID (format: barber_barber_carlos -> barber_carlos)
    const barberId = buttonId.replace('barber_', '');
    
    const barber = await this.#appointmentRepository.findBarberById(barberId);
    if (!barber) {
      const barbers = await this.#appointmentRepository.findAllBarbers();
      return this.#messagingService.sendBarberSelection(phoneNumber, barbers, state.customerName);
    }

    state.barberId = barberId;
    state.barberName = barber.name;
    state.step = 'service';
    this.#conversationState.set(phoneNumber, state);

    return this.#messagingService.sendServiceSelection(phoneNumber, state.customerName);
  }

  async #handleServiceSelection(phoneNumber, buttonId) {
    const state = this.#conversationState.get(phoneNumber);
    
    if (!state || state.step !== 'service') {
      return this.#startScheduling(phoneNumber);
    }

    const serviceMap = {
      'srv_corte': Appointment.SERVICE_TYPES.CORTE,
      'srv_barba': Appointment.SERVICE_TYPES.BARBA,
      'srv_corte_barba': Appointment.SERVICE_TYPES.CORTE_BARBA
    };

    const serviceType = serviceMap[buttonId];
    if (!serviceType) {
      return this.#messagingService.sendServiceSelection(phoneNumber, state.customerName);
    }

    state.serviceType = serviceType;
    state.step = 'date';
    this.#conversationState.set(phoneNumber, state);

    // Get availability for next 7 days
    const datesWithAvailability = await this.#getAvailabilityForDates(state.barberId, 7);
    
    return this.#messagingService.sendDateSelection(phoneNumber, datesWithAvailability, state.barberName);
  }

  async #handleDateSelection(phoneNumber, buttonId) {
    const state = this.#conversationState.get(phoneNumber);
    
    if (!state || state.step !== 'date') {
      return this.#startScheduling(phoneNumber);
    }

    // Extract date from button ID (format: date_YYYY-MM-DD)
    const dateValue = buttonId.replace('date_', '');
    const selectedDate = new Date(dateValue + 'T12:00:00');
    
    state.date = dateValue;
    state.step = 'time';
    this.#conversationState.set(phoneNumber, state);

    // Get available slots for this date
    const availableSlots = await this.#appointmentRepository.getAvailableSlots(state.barberId, selectedDate);
    
    // Format date for display
    const dateStr = selectedDate.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    return this.#messagingService.sendTimeSelection(phoneNumber, availableSlots, dateStr, state.barberName);
  }

  async #handleTimeSelection(phoneNumber, buttonId) {
    const state = this.#conversationState.get(phoneNumber);
    
    if (!state || state.step !== 'time') {
      return this.#startScheduling(phoneNumber);
    }

    // Extract time from button ID (format: time_HH:MM)
    const timeValue = buttonId.replace('time_', '');
    
    const dateTime = new Date(`${state.date}T${timeValue}:00`);
    
    if (isNaN(dateTime.getTime())) {
      return this.#messagingService.sendMessage(
        phoneNumber,
        'Error con la fecha/hora. Por favor intenta de nuevo.'
      );
    }

    if (dateTime <= new Date()) {
      this.#conversationState.delete(phoneNumber);
      this.#clearInactivityTimer(phoneNumber);
      return this.#messagingService.sendButtonMessage(phoneNumber, {
        body: 'La fecha/hora seleccionada ya pasó. Por favor selecciona otra.',
        buttons: [
          { id: 'btn_agendar', title: 'Intentar de nuevo' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
    }

    // Verify slot is still available
    const isAvailable = await this.#appointmentRepository.isSlotAvailable(state.barberId, dateTime);
    if (!isAvailable) {
      // Slot was taken, show available slots again
      const selectedDate = new Date(state.date + 'T12:00:00');
      const availableSlots = await this.#appointmentRepository.getAvailableSlots(state.barberId, selectedDate);
      
      const dateStr = selectedDate.toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });

      await this.#messagingService.sendMessage(
        phoneNumber,
        'Este horario ya fue reservado. Por favor selecciona otro:'
      );
      
      return this.#messagingService.sendTimeSelection(phoneNumber, availableSlots, dateStr, state.barberName);
    }

    // Clear state before scheduling
    const barberName = state.barberName;
    this.#conversationState.delete(phoneNumber);
    this.#clearInactivityTimer(phoneNumber);
    
    await this.#scheduleAppointment.execute({
      phoneNumber,
      customerName: state.customerName,
      barberId: state.barberId,
      barberName,
      serviceType: state.serviceType,
      dateTime
    });
  }

  async #getAvailabilityForDates(barberId, days) {
    const barber = await this.#appointmentRepository.findBarberById(barberId);
    if (!barber) {
      return [];
    }

    const result = [];
    const today = new Date();
    
    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      date.setHours(0, 0, 0, 0);
      
      const allSlots = barber.generateTimeSlots(date);
      const bookedSlots = await this.#appointmentRepository.getBookedSlots(barberId, date);
      const bookedTimes = new Set(bookedSlots.map(d => d.getTime()));
      
      const availableSlots = allSlots.filter(slot => !bookedTimes.has(slot.dateTime.getTime()));
      
      result.push({
        date,
        availableSlots: availableSlots.length,
        totalSlots: allSlots.length
      });
    }
    
    return result;
  }

  async #showAppointments(phoneNumber) {
    const appointments = await this.#listAppointments.execute({ phoneNumber });
    
    if (appointments.length === 0) {
      return this.#messagingService.sendNoAppointmentMessage(phoneNumber);
    }

    const apt = appointments[0];
    const barber = await this.#appointmentRepository.findBarberById(apt.barberId);
    const barberName = barber ? barber.name : 'Barbero';
    
    return this.#messagingService.sendAppointmentDetails(phoneNumber, apt, barberName);
  }

  async #handleCancelCommand(phoneNumber, text) {
    const idPart = text.replace('cancelar ', '').trim();
    return this.#handleCancel(phoneNumber, idPart);
  }

  async #handleCancel(phoneNumber, appointmentIdPart) {
    const appointments = await this.#listAppointments.execute({ phoneNumber });
    const appointment = appointments.find(apt => apt.id.startsWith(appointmentIdPart));
    
    if (!appointment) {
      return this.#messagingService.sendButtonMessage(phoneNumber, {
        body: 'No se encontró la cita.',
        buttons: [
          { id: 'btn_ver_citas', title: 'Ver mi cita' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
    }

    await this.#cancelAppointment.execute({
      appointmentId: appointment.id,
      phoneNumber
    });
  }
}