import { Appointment } from '../../domain/entities/Appointment.js';
import { AdminCommand } from '../../domain/value-objects/AdminCommand.js';
import { Barber } from '../../domain/entities/Barber.js';

/**
 * Webhook Handler - Infrastructure Layer
 * Handles incoming WhatsApp webhook events including interactive messages
 *
 * IMPORTANT: All date/time operations use Colombia timezone (UTC-5)
 * This ensures consistent behavior regardless of server location.
 *
 * Booking Flow:
 * 1. Name input (text)
 * 2. Barber selection (list)
 * 3. Service selection (list)
 * 4. Date selection (list with availability) - includes TODAY
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

  /**
   * Capitalize each word in a name (first letter uppercase, rest lowercase)
   * @param {string} name
   * @returns {string}
   */
  #capitalizeName(name) {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

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
        // Pass original text (not lowercase) to preserve name capitalization
        return this.#handleConversationFlow(phoneNumber, text, state);
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
      return this.#checkAndStartScheduling(phoneNumber);
    }

    // Handle "schedule for another person" option
    if (buttonId === 'btn_agendar_otro') {
      return this.#startSchedulingForOther(phoneNumber);
    }

    // Handle "choose another date" - goes back to date selection without restarting
    if (buttonId === 'btn_otra_fecha') {
      return this.#goBackToDateSelection(phoneNumber);
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

    // Handle "Ver más horarios" button for pagination
    if (buttonId === 'btn_mas_horarios') {
      return this.#handleMoreTimeSlots(phoneNumber);
    }

    // Default
    return this.#messagingService.sendWelcomeMenu(phoneNumber);
  }

  async #checkAndStartScheduling(phoneNumber) {
    // Check if user already has an active appointment
    const hasActive = await this.#appointmentRepository.hasActiveAppointment(phoneNumber);
    
    if (hasActive) {
      const existing = await this.#appointmentRepository.findByPhone(phoneNumber);
      const barber = await this.#appointmentRepository.findBarberById(existing.barberId);
      const barberName = barber ? barber.name : 'Barbero';
      
      const dateStr = existing.dateTime.toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });

      return this.#messagingService.sendButtonMessage(phoneNumber, {
        header: '💈 Ya tienes una cita',
        body: `Ya tienes una cita programada:\n\n📅 ${dateStr}\n👤 Barbero: ${barberName}\n🆔 ${existing.id.substring(0, 8)}\n\n¿Qué deseas hacer?`,
        buttons: [
          { id: `cancel_${existing.id.substring(0, 8)}`, title: '❌ Cancelar cita' },
          { id: 'btn_agendar_otro', title: '👥 Agendar para otro' }
        ]
      });
    }

    // No active appointment, proceed with normal scheduling
    return this.#startScheduling(phoneNumber);
  }

  async #startScheduling(phoneNumber) {
    this.#conversationState.set(phoneNumber, { step: 'name', forSelf: true, targetPhone: phoneNumber });
    this.#resetInactivityTimer(phoneNumber);
    return this.#messagingService.sendMessage(
      phoneNumber,
      '💈 *Agendar Cita*\n\nPor favor, escribe tu *nombre completo*:'
    );
  }

  async #startSchedulingForOther(phoneNumber) {
    this.#conversationState.set(phoneNumber, { step: 'other_phone', forSelf: false });
    this.#resetInactivityTimer(phoneNumber);
    return this.#messagingService.sendMessage(
      phoneNumber,
      '👥 *Agendar para otra persona*\n\nEscribe el número de teléfono de la persona con código de país:\n\n_Ejemplo: 573001234567 (Colombia)_\n_Ejemplo: 13051234567 (USA)_'
    );
  }

  async #handleConversationFlow(phoneNumber, text, state) {
    // Handle phone number input for "schedule for other"
    if (state.step === 'other_phone') {
      // Validate phone number format (must have country code and be 10-15 digits)
      const cleanPhone = text.replace(/\D/g, '');
      
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return this.#messagingService.sendMessage(
          phoneNumber,
          '❌ Número inválido. Debe incluir código de país y tener entre 10-15 dígitos.\n\n_Ejemplo: 573001234567 (Colombia)_\n_Ejemplo: 13051234567 (USA)_\n\nIntenta de nuevo:'
        );
      }

      // Check if that phone already has an appointment
      const hasActive = await this.#appointmentRepository.hasActiveAppointment(cleanPhone);
      if (hasActive) {
        this.#conversationState.delete(phoneNumber);
        this.#clearInactivityTimer(phoneNumber);
        return this.#messagingService.sendButtonMessage(phoneNumber, {
          body: `❌ El número ${cleanPhone} ya tiene una cita programada.\n\nNo se puede agendar otra cita para ese número.`,
          buttons: [
            { id: 'btn_menu', title: '📋 Menú principal' }
          ]
        });
      }

      // Save target phone and proceed to name
      state.targetPhone = cleanPhone;
      state.step = 'name';
      this.#conversationState.set(phoneNumber, state);
      
      return this.#messagingService.sendMessage(
        phoneNumber,
        `✅ Número registrado: ${cleanPhone}\n\nAhora escribe el *nombre completo* de la persona:`
      );
    }

    if (state.step === 'name') {
      if (text.length < 2 || text.length > 100) {
        return this.#messagingService.sendMessage(
          phoneNumber,
          'El nombre debe tener entre 2 y 100 caracteres. Intenta de nuevo:'
        );
      }
      
      // Save name with proper capitalization (First Letter Of Each Word)
      const capitalizedName = this.#capitalizeName(text);
      state.customerName = capitalizedName;
      state.step = 'barber';
      this.#conversationState.set(phoneNumber, state);
      
      // Get all barbers
      const barbers = await this.#appointmentRepository.findAllBarbers();
      return this.#messagingService.sendBarberSelection(phoneNumber, barbers, capitalizedName);
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

    // Get availability for today + next 7 days (8 days total)
    // Uses Colombia timezone for date calculations
    const datesWithAvailability = await this.#getAvailabilityForDates(state.barberId, 8);
    
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
    
    // Get available slots for this date (uses Colombia timezone internally)
    const availableSlots = await this.#appointmentRepository.getAvailableSlots(state.barberId, selectedDate);
    
    // Format date for display using Colombia timezone
    const dateStr = selectedDate.toLocaleDateString('es-CO', {
      timeZone: Barber.COLOMBIA_TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    // Save state with available slots for pagination
    state.date = dateValue;
    state.step = 'time';
    state.availableSlots = availableSlots;
    state.dateStr = dateStr;
    state.timePage = 0;
    this.#conversationState.set(phoneNumber, state);

    return this.#messagingService.sendTimeSelection(phoneNumber, availableSlots, dateStr, state.barberName, 0);
  }

  /**
   * Handle "Ver más horarios" button - show next page of time slots
   */
  async #handleMoreTimeSlots(phoneNumber) {
    const state = this.#conversationState.get(phoneNumber);
    
    if (!state || state.step !== 'time' || !state.availableSlots) {
      return this.#startScheduling(phoneNumber);
    }

    // Increment page
    state.timePage = (state.timePage || 0) + 1;
    this.#conversationState.set(phoneNumber, state);

    return this.#messagingService.sendTimeSelection(
      phoneNumber,
      state.availableSlots,
      state.dateStr,
      state.barberName,
      state.timePage
    );
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

    // Compare with Colombia time
    const nowColombia = Barber.getColombiaTime();
    const dateTimeColombia = new Date(dateTime.toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
    
    if (dateTimeColombia <= nowColombia) {
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
        timeZone: Barber.COLOMBIA_TIMEZONE,
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
    const targetPhone = state.targetPhone || phoneNumber;
    const isForOther = !state.forSelf;
    
    this.#conversationState.delete(phoneNumber);
    this.#clearInactivityTimer(phoneNumber);
    
    // Execute scheduling with target phone (could be different from sender)
    // Skip active check if scheduling for another person (already validated in #startSchedulingForOther)
    const appointment = await this.#scheduleAppointment.execute({
      phoneNumber: targetPhone,
      customerName: state.customerName,
      barberId: state.barberId,
      barberName,
      serviceType: state.serviceType,
      dateTime,
      skipActiveCheck: isForOther
    });

    // If scheduled for another person, send confirmation to the person who booked
    if (isForOther && appointment) {
      const dateStr = dateTime.toLocaleDateString('es-CO', {
        timeZone: Barber.COLOMBIA_TIMEZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        header: '✅ Cita Agendada',
        body: `Has agendado una cita para:\n\n👤 ${state.customerName}\n📱 ${targetPhone}\n📅 ${dateStr}\n💇 ${Appointment.getServiceTypeLabel(state.serviceType)}\n👤 Barbero: ${barberName}`,
        buttons: [
          { id: 'btn_menu', title: '📋 Menú principal' }
        ]
      });
    }
  }

  async #getAvailabilityForDates(barberId, days) {
    const barber = await this.#appointmentRepository.findBarberById(barberId);
    if (!barber) {
      return [];
    }

    const result = [];
    // Use Colombia timezone for date calculations
    const todayColombia = Barber.getColombiaTime();
    const todayStr = Barber.getTodayColombiaString();
    
    console.log(`[getAvailabilityForDates] Today Colombia: ${todayStr}, Current hour: ${todayColombia.getHours()}`);
    
    // Start from today (i = 0), not tomorrow
    for (let i = 0; i < days; i++) {
      // Calculate the date string for this day
      const targetDate = new Date(todayColombia);
      targetDate.setDate(todayColombia.getDate() + i);
      
      // Format as YYYY-MM-DD
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      // Use the same method that will be used when selecting the date
      // This ensures consistency between the count shown and actual available slots
      const availableSlots = await this.#appointmentRepository.getAvailableSlots(barberId, targetDate);
      
      console.log(`[getAvailabilityForDates] Date: ${dateStr}, Available slots: ${availableSlots.length}`);
      
      // ONLY include days that have available slots (no empty days)
      if (availableSlots.length > 0) {
        result.push({
          date: targetDate,
          availableSlots: availableSlots.length,
          totalSlots: barber.workingHours.end - barber.workingHours.start,
          isToday: i === 0,
          dayIndex: i  // 0 = hoy, 1 = mañana, 2 = pasado mañana
        });
      }
    }
    
    return result;
  }

  /**
   * Go back to date selection without restarting the entire flow
   * Preserves customer name, barber, and service selection
   */
  async #goBackToDateSelection(phoneNumber) {
    const state = this.#conversationState.get(phoneNumber);
    
    // If no state or missing required data, restart the flow
    if (!state || !state.barberId || !state.serviceType) {
      return this.#checkAndStartScheduling(phoneNumber);
    }

    // Reset to date selection step
    state.step = 'date';
    delete state.date;
    this.#conversationState.set(phoneNumber, state);

    // Get availability for today + next 7 days
    const datesWithAvailability = await this.#getAvailabilityForDates(state.barberId, 8);
    
    return this.#messagingService.sendDateSelection(phoneNumber, datesWithAvailability, state.barberName);
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