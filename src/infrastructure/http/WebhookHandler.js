import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * Webhook Handler - Infrastructure Layer
 * Handles incoming WhatsApp webhook events including interactive messages
 */
export class WebhookHandler {
  #scheduleAppointment;
  #cancelAppointment;
  #listAppointments;
  #messagingService;
  #conversationState = new Map();
  #conversationTimers = new Map();
  #welcomedUsers = new Set();
  #inactivityTimeout = 10 * 60 * 1000; // 10 minutes

  constructor({ scheduleAppointment, cancelAppointment, listAppointments, messagingService }) {
    this.#scheduleAppointment = scheduleAppointment;
    this.#cancelAppointment = cancelAppointment;
    this.#listAppointments = listAppointments;
    this.#messagingService = messagingService;
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

      // Handle interactive message responses (buttons and lists)
      if (message.type === 'interactive') {
        return this.#handleInteractiveResponse(phoneNumber, message.interactive);
      }

      // Handle text messages
      const text = message.text?.body?.trim().toLowerCase() || '';

      // Check if user is in a conversation flow
      const state = this.#conversationState.get(phoneNumber);
      if (state) {
        if (text === 'menu' || text === 'inicio' || text === 'salir') {
          this.#clearInactivityTimer(phoneNumber);
          this.#conversationState.delete(phoneNumber);
          return this.#messagingService.sendWelcomeMenu(phoneNumber);
        }
        return this.#handleConversationFlow(phoneNumber, text, state);
      }

      // First message - welcome
      const isFirstMessage = !this.#welcomedUsers.has(phoneNumber);
      if (isFirstMessage) {
        this.#welcomedUsers.add(phoneNumber);
        return this.#messagingService.sendWelcomeMenu(phoneNumber);
      }

      // Text commands
      if (text === 'hola' || text === 'menu' || text === 'inicio') {
        return this.#messagingService.sendWelcomeMenu(phoneNumber);
      }

      if (text === 'agendar' || text === '1') {
        return this.#startScheduling(phoneNumber);
      }

      if (text === 'citas' || text === 'mi cita' || text === '2') {
        return this.#showAppointments(phoneNumber);
      }

      if (text.startsWith('cancelar ')) {
        return this.#handleCancelCommand(phoneNumber, text);
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
      
      // Save name and show service selection
      state.customerName = text;
      state.step = 'service';
      this.#conversationState.set(phoneNumber, state);
      
      return this.#messagingService.sendServiceSelection(phoneNumber, text);
    }

    // For other steps, show menu (shouldn't reach here with interactive flow)
    this.#conversationState.delete(phoneNumber);
    this.#clearInactivityTimer(phoneNumber);
    return this.#messagingService.sendWelcomeMenu(phoneNumber);
  }

  async #handleServiceSelection(phoneNumber, buttonId) {
    const state = this.#conversationState.get(phoneNumber);
    
    if (!state || state.step !== 'service') {
      // Start fresh if no state
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

    return this.#messagingService.sendDateSelection(phoneNumber);
  }

  async #handleDateSelection(phoneNumber, buttonId) {
    const state = this.#conversationState.get(phoneNumber);
    
    if (!state || state.step !== 'date') {
      return this.#startScheduling(phoneNumber);
    }

    // Extract date from button ID (format: date_YYYY-MM-DD)
    const dateValue = buttonId.replace('date_', '');
    
    state.date = dateValue;
    state.step = 'time';
    this.#conversationState.set(phoneNumber, state);

    // Format date for display
    const dateObj = new Date(dateValue + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    return this.#messagingService.sendTimeSelection(phoneNumber, dateStr);
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

    // Clear state before scheduling
    this.#conversationState.delete(phoneNumber);
    this.#clearInactivityTimer(phoneNumber);
    
    await this.#scheduleAppointment.execute({
      phoneNumber,
      customerName: state.customerName,
      serviceType: state.serviceType,
      dateTime
    });
  }

  async #showAppointments(phoneNumber) {
    const appointments = await this.#listAppointments.execute({ phoneNumber });
    
    if (appointments.length === 0) {
      return this.#messagingService.sendNoAppointmentMessage(phoneNumber);
    }

    const apt = appointments[0];
    return this.#messagingService.sendAppointmentDetails(phoneNumber, apt);
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