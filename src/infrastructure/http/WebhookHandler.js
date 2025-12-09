import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * Webhook Handler - Infrastructure Layer
 * Handles incoming WhatsApp webhook events
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
      
      const closeMessage = `*Sesión cerrada por inactividad*\n\n` +
        `Han pasado 10 minutos sin actividad.\n\n` +
        `💈 Gracias por contactar a *Big Brother Barber Shop*\n\n` +
        `Escribe *hola* cuando quieras volver a agendar.`;
      
      try {
        await this.#messagingService.sendMessage(phoneNumber, closeMessage);
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
    const text = message.text?.body?.trim().toLowerCase() || '';

    try {
      this.#resetInactivityTimer(phoneNumber);

      const isFirstMessage = !this.#welcomedUsers.has(phoneNumber) && !this.#conversationState.has(phoneNumber);
      
      if (isFirstMessage) {
        this.#welcomedUsers.add(phoneNumber);
        return this.#sendWelcomeWithImage(phoneNumber);
      }

      if (text === 'hola' || text === 'menu' || text === 'inicio') {
        this.#clearInactivityTimer(phoneNumber);
        this.#conversationState.delete(phoneNumber);
        return this.#sendMenu(phoneNumber);
      }

      if (text === '1' || text === 'agendar') {
        return this.#startScheduling(phoneNumber);
      }

      if (text === '2' || text === 'mis citas' || text === 'citas') {
        this.#clearInactivityTimer(phoneNumber);
        this.#conversationState.delete(phoneNumber);
        return this.#showAppointments(phoneNumber);
      }

      if (text.startsWith('cancelar ')) {
        this.#clearInactivityTimer(phoneNumber);
        this.#conversationState.delete(phoneNumber);
        return this.#handleCancel(phoneNumber, text);
      }

      const state = this.#conversationState.get(phoneNumber);
      if (state) {
        return this.#handleConversationFlow(phoneNumber, text, state);
      }

      return this.#sendMenu(phoneNumber);
    } catch (error) {
      console.error('Error handling message:', error.message);
      return this.#messagingService.sendMessage(
        phoneNumber,
        'Ocurrió un error. Por favor intenta de nuevo.'
      );
    }
  }

  async #sendWelcomeWithImage(phoneNumber) {
    const menu = `💈 *¡Bienvenido a Big Brother Barber Shop!* 💈\n\n` +
      `¿Qué te gustaría hacer hoy?\n\n` +
      `*1.* Agendar una cita\n` +
      `*2.* Ver mis citas\n\n` +
      `_Escribe el número de la opción que deseas_`;
    
    return this.#messagingService.sendMessage(phoneNumber, menu);
  }

  async #sendMenu(phoneNumber) {
    const menu = `💈 *Big Brother Barber Shop* 💈\n\n` +
      `¿Qué te gustaría hacer?\n\n` +
      `*1.* Agendar una cita\n` +
      `*2.* Ver mis citas\n\n` +
      `_Escribe el número de la opción que deseas_`;
    
    return this.#messagingService.sendMessage(phoneNumber, menu);
  }

  async #startScheduling(phoneNumber) {
    this.#conversationState.set(phoneNumber, { step: 'name' });
    this.#resetInactivityTimer(phoneNumber);
    return this.#messagingService.sendMessage(
      phoneNumber,
      '💈 *Agendar Cita en Big Brother Barber Shop*\n\nPor favor, escribe tu *nombre completo*:'
    );
  }

  async #handleConversationFlow(phoneNumber, text, state) {
    switch (state.step) {
      case 'name':
        if (text.length < 2 || text.length > 100) {
          return this.#messagingService.sendMessage(
            phoneNumber,
            'El nombre debe tener entre 2 y 100 caracteres. Intenta de nuevo:'
          );
        }
        state.customerName = text;
        state.step = 'service';
        this.#conversationState.set(phoneNumber, state);
        return this.#messagingService.sendMessage(
          phoneNumber,
          `*¿Qué servicio deseas?*\n\n` +
          `*1.* Corte de cabello\n` +
          `*2.* Arreglo de barba\n` +
          `*3.* Corte + Barba\n\n` +
          `_Escribe el número del servicio_`
        );

      case 'service':
        const serviceMap = {
          '1': Appointment.SERVICE_TYPES.CORTE,
          '2': Appointment.SERVICE_TYPES.BARBA,
          '3': Appointment.SERVICE_TYPES.CORTE_BARBA,
          'corte': Appointment.SERVICE_TYPES.CORTE,
          'barba': Appointment.SERVICE_TYPES.BARBA,
          'corte y barba': Appointment.SERVICE_TYPES.CORTE_BARBA,
          'corte + barba': Appointment.SERVICE_TYPES.CORTE_BARBA
        };
        
        const serviceType = serviceMap[text];
        if (!serviceType) {
          return this.#messagingService.sendMessage(
            phoneNumber,
            'Opción no válida. Escribe 1, 2 o 3:'
          );
        }
        state.serviceType = serviceType;
        state.step = 'date';
        this.#conversationState.set(phoneNumber, state);
        return this.#messagingService.sendMessage(
          phoneNumber,
          'Escribe la *fecha* de tu cita (formato: DD/MM/YYYY):'
        );

      case 'date':
        const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!dateMatch) {
          return this.#messagingService.sendMessage(
            phoneNumber,
            'Formato inválido. Usa DD/MM/YYYY (ej: 25/12/2024)'
          );
        }
        state.date = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
        state.step = 'time';
        this.#conversationState.set(phoneNumber, state);
        return this.#messagingService.sendMessage(
          phoneNumber,
          'Escribe la *hora* de tu cita (formato: HH:MM, ej: 14:30):'
        );

      case 'time':
        const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
        if (!timeMatch) {
          return this.#messagingService.sendMessage(
            phoneNumber,
            'Formato inválido. Usa HH:MM (ej: 14:30)'
          );
        }
        
        const dateTime = new Date(`${state.date}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`);
        
        if (isNaN(dateTime.getTime())) {
          this.#conversationState.delete(phoneNumber);
          this.#clearInactivityTimer(phoneNumber);
          return this.#messagingService.sendMessage(
            phoneNumber,
            'La fecha/hora no es válida. Escribe *agendar* para intentar de nuevo.'
          );
        }

        if (dateTime <= new Date()) {
          this.#conversationState.delete(phoneNumber);
          this.#clearInactivityTimer(phoneNumber);
          return this.#messagingService.sendMessage(
            phoneNumber,
            'La fecha/hora ya pasó. Escribe *agendar* para intentar de nuevo.'
          );
        }

        this.#conversationState.delete(phoneNumber);
        this.#clearInactivityTimer(phoneNumber);
        
        await this.#scheduleAppointment.execute({
          phoneNumber,
          customerName: state.customerName,
          serviceType: state.serviceType,
          dateTime
        });
        
        return;

      default:
        this.#conversationState.delete(phoneNumber);
        this.#clearInactivityTimer(phoneNumber);
        return this.#sendMenu(phoneNumber);
    }
  }

  async #showAppointments(phoneNumber) {
    const appointments = await this.#listAppointments.execute({ phoneNumber });
    
    if (appointments.length === 0) {
      return this.#messagingService.sendMessage(
        phoneNumber,
        'No tienes citas programadas.\n\nEscribe *agendar* para crear una.'
      );
    }

    const apt = appointments[0];
    const dateStr = apt.dateTime.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const serviceLabel = Appointment.getServiceTypeLabel(apt.serviceType);
    
    const message = `*Tu Cita Programada:*\n\n` +
      `Fecha: ${dateStr}\n` +
      `Servicio: ${serviceLabel}\n` +
      `ID: ${apt.id.substring(0, 8)}\n\n` +
      `Para cancelar, escribe: *cancelar ${apt.id.substring(0, 8)}*`;
    
    return this.#messagingService.sendMessage(phoneNumber, message);
  }

  async #handleCancel(phoneNumber, text) {
    const idPart = text.replace('cancelar ', '').trim();
    
    const appointments = await this.#listAppointments.execute({ phoneNumber });
    const appointment = appointments.find(apt => apt.id.startsWith(idPart));
    
    if (!appointment) {
      return this.#messagingService.sendMessage(
        phoneNumber,
        'No se encontró la cita. Verifica el ID e intenta de nuevo.'
      );
    }

    await this.#cancelAppointment.execute({
      appointmentId: appointment.id,
      phoneNumber
    });
  }
}