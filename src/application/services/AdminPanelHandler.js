import { AdminCommand } from '../../domain/value-objects/AdminCommand.js';
import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * AdminPanelHandler - Application Service
 * Orchestrates admin panel with interactive WhatsApp messages
 * 
 * Flow:
 * 1. Barber sends "admin <alias> <pin>" to authenticate
 * 2. System shows interactive menu with buttons/lists
 * 3. Barber selects options via interactive responses
 * 4. System processes and shows results with navigation options
 */
export class AdminPanelHandler {
  #authenticateBarber;
  #getTodayAppointments;
  #getWeekAppointments;
  #cancelAppointmentByBarber;
  #blockTimeSlot;
  #unblockTimeSlot;
  #completeAppointment;
  #addClientNote;
  #getBarberStats;
  #messagingService;
  #barberRepository;
  #adminSessions = new Map(); // Store authenticated sessions

  constructor({
    authenticateBarber,
    getTodayAppointments,
    getWeekAppointments,
    cancelAppointmentByBarber,
    blockTimeSlot,
    unblockTimeSlot,
    completeAppointment,
    addClientNote,
    getBarberStats,
    messagingService,
    barberRepository
  }) {
    this.#authenticateBarber = authenticateBarber;
    this.#getTodayAppointments = getTodayAppointments;
    this.#getWeekAppointments = getWeekAppointments;
    this.#cancelAppointmentByBarber = cancelAppointmentByBarber;
    this.#blockTimeSlot = blockTimeSlot;
    this.#unblockTimeSlot = unblockTimeSlot;
    this.#completeAppointment = completeAppointment;
    this.#addClientNote = addClientNote;
    this.#getBarberStats = getBarberStats;
    this.#messagingService = messagingService;
    this.#barberRepository = barberRepository;
  }

  /**
   * Handle an admin command (initial authentication)
   * @param {string} phoneNumber - The phone number sending the command
   * @param {string} messageText - The raw message text
   * @returns {Promise<boolean>} - True if handled as admin command
   */
  async handleCommand(phoneNumber, messageText) {
    // Parse the command
    const command = AdminCommand.parse(messageText);
    
    if (!command) {
      return false; // Not an admin command
    }

    // Authenticate the barber
    const authResult = await this.#authenticateBarber.execute({
      alias: command.barberAlias,
      pin: command.pin
    });

    if (!authResult.success) {
      await this.#messagingService.sendMessage(
        phoneNumber,
        `❌ *Error de autenticación*\n\n${authResult.error}`
      );
      return true;
    }

    const barber = authResult.barber;

    // Store session
    this.#adminSessions.set(phoneNumber, {
      barber,
      authenticatedAt: new Date(),
      state: 'menu'
    });

    // Show interactive main menu
    await this.#sendMainMenu(phoneNumber, barber);
    return true;
  }

  /**
   * Handle interactive response from admin panel
   * @param {string} phoneNumber 
   * @param {string} buttonId 
   * @returns {Promise<boolean>}
   */
  async handleInteractiveResponse(phoneNumber, buttonId) {
    const session = this.#adminSessions.get(phoneNumber);
    
    if (!session) {
      return false; // No active admin session
    }

    const barber = session.barber;

    try {
      // Handle menu navigation
      if (buttonId === 'adm_menu') {
        await this.#sendMainMenu(phoneNumber, barber);
        return true;
      }

      if (buttonId === 'adm_exit') {
        this.#adminSessions.delete(phoneNumber);
        await this.#messagingService.sendMessage(
          phoneNumber,
          `👋 *Sesión cerrada*\n\nHasta luego, ${barber.name}!`
        );
        return true;
      }

      // Handle main menu options
      if (buttonId === 'adm_today') {
        await this.#handleTodayAppointments(phoneNumber, barber);
        return true;
      }

      if (buttonId === 'adm_week') {
        await this.#handleWeekAppointments(phoneNumber, barber);
        return true;
      }

      if (buttonId === 'adm_stats') {
        await this.#handleStats(phoneNumber, barber);
        return true;
      }

      if (buttonId === 'adm_block') {
        await this.#sendBlockTimeMenu(phoneNumber, barber);
        return true;
      }

      if (buttonId === 'adm_manage') {
        await this.#sendManageAppointmentsMenu(phoneNumber, barber);
        return true;
      }

      // Handle appointment selection for management
      if (buttonId.startsWith('adm_apt_')) {
        const aptId = buttonId.replace('adm_apt_', '');
        await this.#sendAppointmentActions(phoneNumber, barber, aptId);
        return true;
      }

      // Handle block time slots
      if (buttonId.startsWith('adm_block_')) {
        const time = buttonId.replace('adm_block_', '').replace('_', ':');
        await this.#handleBlockSlot(phoneNumber, barber, time);
        return true;
      }

      // Handle unblock time slots
      if (buttonId.startsWith('adm_unblock_')) {
        const time = buttonId.replace('adm_unblock_', '').replace('_', ':');
        await this.#handleUnblockSlot(phoneNumber, barber, time);
        return true;
      }

      // Handle complete appointment
      if (buttonId.startsWith('adm_complete_')) {
        const aptId = buttonId.replace('adm_complete_', '');
        await this.#handleCompleteAppointment(phoneNumber, barber, aptId);
        return true;
      }

      // Handle cancel appointment
      if (buttonId.startsWith('adm_cancel_')) {
        const aptId = buttonId.replace('adm_cancel_', '');
        await this.#handleCancelAppointment(phoneNumber, barber, aptId);
        return true;
      }

      // Handle add note
      if (buttonId.startsWith('adm_note_')) {
        const aptId = buttonId.replace('adm_note_', '');
        session.state = 'waiting_note';
        session.noteAppointmentId = aptId;
        this.#adminSessions.set(phoneNumber, session);
        
        await this.#messagingService.sendMessage(
          phoneNumber,
          `📝 *Agregar Nota*\n\nEscribe la nota para este cliente (máx. 500 caracteres):\n\n_Escribe "cancelar" para volver al menú_`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error('Admin interactive error:', error.message);
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `❌ *Error*\n\nOcurrió un error. Intenta de nuevo.`,
        buttons: [
          { id: 'adm_menu', title: '📋 Menú Admin' },
          { id: 'adm_exit', title: '🚪 Salir' }
        ]
      });
      return true;
    }
  }

  /**
   * Handle text message in admin context (for notes)
   * @param {string} phoneNumber 
   * @param {string} text 
   * @returns {Promise<boolean>}
   */
  async handleTextMessage(phoneNumber, text) {
    const session = this.#adminSessions.get(phoneNumber);
    
    if (!session) {
      return false;
    }

    if (session.state === 'waiting_note') {
      if (text.toLowerCase() === 'cancelar') {
        session.state = 'menu';
        this.#adminSessions.set(phoneNumber, session);
        await this.#sendMainMenu(phoneNumber, session.barber);
        return true;
      }

      await this.#handleAddNote(phoneNumber, session.barber, session.noteAppointmentId, text);
      session.state = 'menu';
      delete session.noteAppointmentId;
      this.#adminSessions.set(phoneNumber, session);
      return true;
    }

    return false;
  }

  /**
   * Check if phone has active admin session
   * @param {string} phoneNumber 
   * @returns {boolean}
   */
  hasActiveSession(phoneNumber) {
    return this.#adminSessions.has(phoneNumber);
  }

  async #sendMainMenu(phoneNumber, barber) {
    await this.#messagingService.sendListMessage(phoneNumber, {
      header: '🔐 Panel de Administración',
      body: `Hola ${barber.name}!\n\nSelecciona una opción:`,
      buttonText: 'Ver opciones',
      sections: [
        {
          title: '📋 Ver Citas',
          rows: [
            { id: 'adm_today', title: '📅 Citas de Hoy', description: 'Ver todas las citas del día' },
            { id: 'adm_week', title: '📆 Resumen Semanal', description: 'Ver citas de la semana' }
          ]
        },
        {
          title: '✏️ Gestionar',
          rows: [
            { id: 'adm_manage', title: '👥 Gestionar Citas', description: 'Completar, cancelar o agregar notas' },
            { id: 'adm_block', title: '🚫 Bloquear Horario', description: 'Bloquear horas (almuerzo, etc.)' }
          ]
        },
        {
          title: '📊 Información',
          rows: [
            { id: 'adm_stats', title: '📈 Estadísticas', description: 'Ver estadísticas del mes' },
            { id: 'adm_exit', title: '🚪 Salir', description: 'Cerrar sesión de admin' }
          ]
        }
      ]
    });
  }

  async #sendManageAppointmentsMenu(phoneNumber, barber) {
    const result = await this.#getTodayAppointments.execute({ barberId: barber.id });
    
    if (result.appointments.length === 0) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `📋 *Gestionar Citas*\n\nNo tienes citas para gestionar hoy.`,
        buttons: [
          { id: 'adm_menu', title: '📋 Menú Admin' },
          { id: 'adm_exit', title: '🚪 Salir' }
        ]
      });
      return;
    }

    const rows = result.appointments
      .filter(apt => apt.status !== 'cancelled')
      .slice(0, 10) // WhatsApp limit
      .map(apt => {
        const time = apt.dateTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const status = this.#getStatusEmoji(apt.status);
        return {
          id: `adm_apt_${apt.id.substring(0, 8)}`,
          title: `${status} ${time} - ${apt.customerName.substring(0, 15)}`,
          description: Appointment.getServiceTypeLabel(apt.serviceType)
        };
      });

    if (rows.length === 0) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `📋 *Gestionar Citas*\n\nNo hay citas activas para gestionar.`,
        buttons: [
          { id: 'adm_menu', title: '📋 Menú Admin' }
        ]
      });
      return;
    }

    await this.#messagingService.sendListMessage(phoneNumber, {
      header: '👥 Gestionar Citas',
      body: 'Selecciona una cita para ver opciones:',
      buttonText: 'Ver citas',
      sections: [
        {
          title: 'Citas de Hoy',
          rows
        }
      ]
    });
  }

  async #sendAppointmentActions(phoneNumber, barber, appointmentIdPrefix) {
    // Find the appointment
    const result = await this.#getTodayAppointments.execute({ barberId: barber.id });
    const apt = result.appointments.find(a => a.id.startsWith(appointmentIdPrefix));

    if (!apt) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `❌ Cita no encontrada`,
        buttons: [
          { id: 'adm_manage', title: '👥 Ver Citas' },
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    const time = apt.dateTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const service = Appointment.getServiceTypeLabel(apt.serviceType);
    const status = this.#getStatusEmoji(apt.status);

    const buttons = [];
    
    if (apt.status !== 'completed') {
      buttons.push({ id: `adm_complete_${apt.id.substring(0, 8)}`, title: '✅ Completar' });
    }
    if (apt.status !== 'cancelled') {
      buttons.push({ id: `adm_cancel_${apt.id.substring(0, 8)}`, title: '❌ Cancelar' });
    }
    buttons.push({ id: `adm_note_${apt.id.substring(0, 8)}`, title: '📝 Agregar Nota' });

    // WhatsApp only allows 3 buttons max
    const finalButtons = buttons.slice(0, 3);

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      header: '📋 Detalles de Cita',
      body: `${status} *${apt.customerName}*\n\n⏰ Hora: ${time}\n💇 Servicio: ${service}\n🆔 ID: ${apt.id.substring(0, 8)}`,
      buttons: finalButtons
    });
  }

  async #sendBlockTimeMenu(phoneNumber, barber) {
    const { start, end } = barber.workingHours;
    const rows = [];

    for (let hour = start; hour < end; hour++) {
      const time = `${hour.toString().padStart(2, '0')}:00`;
      const displayHour = hour > 12 ? hour - 12 : hour;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      
      rows.push({
        id: `adm_block_${hour.toString().padStart(2, '0')}_00`,
        title: `🚫 Bloquear ${displayHour}:00 ${ampm}`,
        description: `Bloquear horario de ${time}`
      });
    }

    await this.#messagingService.sendListMessage(phoneNumber, {
      header: '🚫 Bloquear Horario',
      body: 'Selecciona la hora a bloquear para hoy:',
      buttonText: 'Ver horarios',
      sections: [
        {
          title: 'Horarios disponibles',
          rows: rows.slice(0, 10) // WhatsApp limit
        }
      ],
      footer: 'El bloqueo aplica solo para hoy'
    });
  }

  async #handleTodayAppointments(phoneNumber, barber) {
    const result = await this.#getTodayAppointments.execute({ barberId: barber.id });
    
    if (result.appointments.length === 0) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `📋 *Citas de Hoy*\n\nNo tienes citas programadas para hoy.`,
        buttons: [
          { id: 'adm_menu', title: '📋 Menú Admin' },
          { id: 'adm_exit', title: '🚪 Salir' }
        ]
      });
      return;
    }

    let message = `📋 *Citas de Hoy - ${barber.name}*\n\n`;
    message += `📊 Total: ${result.summary.total} | ⏳ Pendientes: ${result.summary.pending} | ✅ Completadas: ${result.summary.completed}\n\n`;

    for (const apt of result.appointments) {
      const time = apt.dateTime.toLocaleTimeString('es-CO', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const service = Appointment.getServiceTypeLabel(apt.serviceType);
      const status = this.#getStatusEmoji(apt.status);
      
      message += `${status} *${time}* - ${apt.customerName}\n`;
      message += `   💇 ${service} | 🆔 ${apt.id.substring(0, 8)}\n\n`;
    }

    if (result.summary.nextAppointment) {
      const nextTime = result.summary.nextAppointment.dateTime.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit'
      });
      message += `\n⏰ *Próxima:* ${nextTime} - ${result.summary.nextAppointment.customerName}`;
    }

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: message,
      buttons: [
        { id: 'adm_manage', title: '✏️ Gestionar' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #handleWeekAppointments(phoneNumber, barber) {
    const result = await this.#getWeekAppointments.execute({ barberId: barber.id });
    
    let message = `📅 *Resumen Semanal - ${barber.name}*\n\n`;
    message += `📊 Total: ${result.totalWeek} | ✅ Completadas: ${result.completedWeek} | ⏳ Pendientes: ${result.pendingWeek}\n\n`;

    for (const day of result.weekSummary) {
      const indicator = day.isToday ? '👉 ' : (day.isPast ? '✓ ' : '  ');
      const dayLabel = day.isToday ? `*${day.dayName} ${day.dayNumber}*` : `${day.dayName} ${day.dayNumber}`;
      
      message += `${indicator}${dayLabel}: ${day.count} cita${day.count !== 1 ? 's' : ''}`;
      if (day.count > 0) {
        message += ` (${day.completed}✓ ${day.pending}⏳)`;
      }
      message += '\n';
    }

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: message,
      buttons: [
        { id: 'adm_today', title: '📅 Ver Hoy' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #handleCancelAppointment(phoneNumber, barber, appointmentIdPrefix) {
    const result = await this.#cancelAppointmentByBarber.execute({
      barberId: barber.id,
      appointmentIdPrefix,
      notifyClient: true
    });

    if (!result.success) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `❌ *Error al cancelar*\n\n${result.error}`,
        buttons: [
          { id: 'adm_manage', title: '👥 Ver Citas' },
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    const apt = result.appointment;
    const dateStr = apt.dateTime.toLocaleDateString('es-CO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: `✅ *Cita Cancelada*\n\nCliente: ${apt.customerName}\nFecha: ${dateStr}\n\n📱 El cliente ha sido notificado.`,
      buttons: [
        { id: 'adm_today', title: '📅 Ver Hoy' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #handleBlockSlot(phoneNumber, barber, time) {
    const result = await this.#blockTimeSlot.execute({
      barberId: barber.id,
      time
    });

    if (!result.success) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `❌ *Error al bloquear*\n\n${result.error}`,
        buttons: [
          { id: 'adm_block', title: '🚫 Intentar otro' },
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: `🚫 *Horario Bloqueado*\n\nHora: ${time}\nFecha: Hoy\n\nEste horario ya no estará disponible para citas.`,
      buttons: [
        { id: 'adm_block', title: '🚫 Bloquear otro' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #handleUnblockSlot(phoneNumber, barber, time) {
    const result = await this.#unblockTimeSlot.execute({
      barberId: barber.id,
      time
    });

    if (!result.success) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `❌ *Error al desbloquear*\n\n${result.error}`,
        buttons: [
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: `✅ *Horario Desbloqueado*\n\nHora: ${time}\n\nEste horario vuelve a estar disponible para citas.`,
      buttons: [
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #handleCompleteAppointment(phoneNumber, barber, appointmentIdPrefix) {
    const result = await this.#completeAppointment.execute({
      barberId: barber.id,
      appointmentIdPrefix
    });

    if (!result.success) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `❌ *Error*\n\n${result.error}`,
        buttons: [
          { id: 'adm_manage', title: '👥 Ver Citas' },
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    const apt = result.appointment;
    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: `✅ *Cita Completada*\n\nCliente: ${apt.customerName}\nServicio: ${Appointment.getServiceTypeLabel(apt.serviceType)}`,
      buttons: [
        { id: 'adm_today', title: '📅 Ver Hoy' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #handleAddNote(phoneNumber, barber, appointmentIdPrefix, noteContent) {
    const result = await this.#addClientNote.execute({
      barberId: barber.id,
      appointmentIdPrefix,
      noteContent
    });

    if (!result.success) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `❌ *Error*\n\n${result.error}`,
        buttons: [
          { id: 'adm_manage', title: '👥 Ver Citas' },
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: `📝 *Nota Guardada*\n\n"${result.note.getPreview()}"`,
      buttons: [
        { id: 'adm_manage', title: '👥 Ver Citas' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #handleStats(phoneNumber, barber) {
    const stats = await this.#getBarberStats.execute({ barberId: barber.id });

    let message = `📊 *Estadísticas - ${stats.month} ${stats.year}*\n\n`;
    message += `*${barber.name}*\n\n`;
    
    message += `📅 *Citas del mes:* ${stats.totalAppointments}\n`;
    message += `✅ Completadas: ${stats.completedAppointments}\n`;
    message += `❌ Canceladas: ${stats.cancelledAppointments}\n`;
    message += `⏳ Pendientes: ${stats.pendingAppointments}\n\n`;

    if (stats.mostPopularService) {
      message += `💇 *Servicio más solicitado:*\n`;
      message += `${stats.mostPopularService.service} (${stats.mostPopularService.count})\n\n`;
    }

    message += `📈 *Promedio diario:* ${stats.dailyAverage} citas\n`;
    
    if (stats.busiestDay) {
      message += `📆 *Día más ocupado:* ${stats.busiestDay.day}\n`;
    }

    if (stats.peakHours.length > 0) {
      message += `\n⏰ *Horas pico:*\n`;
      for (const peak of stats.peakHours) {
        message += `• ${peak.hour} (${peak.count} citas)\n`;
      }
    }

    message += `\n✨ *Tasa de completado:* ${stats.completionRate}%`;

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: message,
      buttons: [
        { id: 'adm_today', title: '📅 Ver Hoy' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  #getStatusEmoji(status) {
    const emojis = {
      'pending': '⏳',
      'confirmed': '✓',
      'completed': '✅',
      'cancelled': '❌'
    };
    return emojis[status] || '•';
  }
}
