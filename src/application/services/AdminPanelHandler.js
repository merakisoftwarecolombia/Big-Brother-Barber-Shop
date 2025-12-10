import { AdminCommand } from '../../domain/value-objects/AdminCommand.js';
import { Appointment } from '../../domain/entities/Appointment.js';
import { Barber } from '../../domain/entities/Barber.js';

/**
 * AdminPanelHandler - Application Service
 * Orchestrates admin panel with interactive WhatsApp messages
 *
 * IMPORTANT: All date/time operations use Colombia timezone (UTC-5)
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
  #appointmentRepository;
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
    barberRepository,
    appointmentRepository
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
    this.#appointmentRepository = appointmentRepository;
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
      if (buttonId === 'adm_appointments') {
        await this.#sendDateSelectionForAppointments(phoneNumber, barber);
        return true;
      }

      if (buttonId === 'adm_today') {
        await this.#handleTodayAppointments(phoneNumber, barber);
        return true;
      }

      // Handle date selection for viewing appointments
      if (buttonId.startsWith('adm_viewdate_')) {
        const dateStr = buttonId.replace('adm_viewdate_', '');
        await this.#handleAppointmentsForDate(phoneNumber, barber, dateStr);
        return true;
      }

      if (buttonId === 'adm_stats') {
        await this.#handleStats(phoneNumber, barber);
        return true;
      }

      if (buttonId === 'adm_block') {
        await this.#sendBlockDateSelection(phoneNumber, barber);
        return true;
      }

      // Handle date selection for blocking
      if (buttonId.startsWith('adm_blockdate_')) {
        const dateStr = buttonId.replace('adm_blockdate_', '');
        session.blockDate = dateStr;
        this.#adminSessions.set(phoneNumber, session);
        await this.#sendBlockTimeMenu(phoneNumber, barber, dateStr);
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
      if (buttonId.startsWith('adm_blocktime_')) {
        const time = buttonId.replace('adm_blocktime_', '').replace('_', ':');
        const dateStr = session.blockDate;
        await this.#handleBlockSlot(phoneNumber, barber, time, dateStr);
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
            { id: 'adm_appointments', title: '📅 Ver Citas Programadas', description: 'Hoy y próximos 7 días' }
          ]
        },
        {
          title: '✏️ Gestionar',
          rows: [
            { id: 'adm_manage', title: '👥 Gestionar Citas', description: 'Completar, cancelar o agregar notas' },
            { id: 'adm_block', title: '🚫 Bloquear Horario', description: 'Bloquear fecha y hora específica' }
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

  async #sendDateSelectionForAppointments(phoneNumber, barber) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const rows = [];
    
    // Use Colombia timezone for date calculations
    const todayColombia = Barber.getColombiaTime();
    todayColombia.setHours(0, 0, 0, 0);

    for (let i = 0; i <= 7; i++) {
      const date = new Date(todayColombia);
      date.setDate(todayColombia.getDate() + i);
      
      const dayName = dayNames[date.getDay()];
      const day = date.getDate();
      const month = monthNames[date.getMonth()];
      
      // Format date string in YYYY-MM-DD format
      const year = date.getFullYear();
      const monthNum = String(date.getMonth() + 1).padStart(2, '0');
      const dayNum = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${monthNum}-${dayNum}`;
      
      const isToday = i === 0;
      
      rows.push({
        id: `adm_viewdate_${dateStr}`,
        title: isToday ? `📅 HOY - ${dayName} ${day} ${month}` : `${dayName} ${day} ${month}`,
        description: isToday ? 'Ver citas de hoy' : `Ver citas del ${dayName}`
      });
    }

    await this.#messagingService.sendListMessage(phoneNumber, {
      header: '📅 Ver Citas Programadas',
      body: 'Selecciona una fecha para ver las citas:',
      buttonText: 'Ver fechas',
      sections: [
        {
          title: 'Próximos 8 días',
          rows
        }
      ]
    });
  }

  async #handleAppointmentsForDate(phoneNumber, barber, dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const appointments = await this.#appointmentRepository.findByBarberAndDate(barber.id, date);
    
    const activeAppointments = appointments.filter(apt => apt.status !== 'cancelled');
    
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const dayName = dayNames[date.getDay()];
    const day = date.getDate();
    const month = monthNames[date.getMonth()];

    if (activeAppointments.length === 0) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `📅 *${dayName} ${day} de ${month}*\n\nNo tienes citas programadas para este día.`,
        buttons: [
          { id: 'adm_appointments', title: '📅 Otra fecha' },
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    let message = `📅 *${dayName} ${day} de ${month}*\n\n`;
    message += `📊 Total: ${activeAppointments.length} cita${activeAppointments.length !== 1 ? 's' : ''}\n\n`;

    for (const apt of activeAppointments.sort((a, b) => a.dateTime - b.dateTime)) {
      // Use Colombia timezone for time display
      const time = apt.dateTime.toLocaleTimeString('es-CO', {
        timeZone: Barber.COLOMBIA_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit'
      });
      const service = Appointment.getServiceTypeLabel(apt.serviceType);
      const status = this.#getStatusEmoji(apt.status);
      
      message += `${status} *${time}* - ${apt.customerName}\n`;
      message += `   💇 ${service} | 🆔 ${apt.id.substring(0, 8)}\n\n`;
    }

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: message,
      buttons: [
        { id: 'adm_appointments', title: '📅 Otra fecha' },
        { id: 'adm_menu', title: '📋 Menú' }
      ]
    });
  }

  async #sendBlockDateSelection(phoneNumber, barber) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const rows = [];
    
    // Use Colombia timezone for date calculations
    const todayColombia = Barber.getColombiaTime();
    todayColombia.setHours(0, 0, 0, 0);

    for (let i = 0; i <= 7; i++) {
      const date = new Date(todayColombia);
      date.setDate(todayColombia.getDate() + i);
      
      const dayName = dayNames[date.getDay()];
      const day = date.getDate();
      const month = monthNames[date.getMonth()];
      
      // Format date string in YYYY-MM-DD format
      const year = date.getFullYear();
      const monthNum = String(date.getMonth() + 1).padStart(2, '0');
      const dayNum = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${monthNum}-${dayNum}`;
      
      const isToday = i === 0;
      
      rows.push({
        id: `adm_blockdate_${dateStr}`,
        title: isToday ? `📅 HOY - ${dayName} ${day} ${month}` : `${dayName} ${day} ${month}`,
        description: `Bloquear horario del ${dayName}`
      });
    }

    await this.#messagingService.sendListMessage(phoneNumber, {
      header: '🚫 Bloquear Horario',
      body: 'Primero selecciona la fecha:',
      buttonText: 'Ver fechas',
      sections: [
        {
          title: 'Próximos 8 días',
          rows
        }
      ]
    });
  }

  async #sendBlockTimeMenu(phoneNumber, barber, dateStr) {
    const { start, end } = barber.workingHours;
    const rows = [];
    const date = new Date(dateStr + 'T12:00:00');
    
    // Use Colombia timezone for comparisons
    const nowColombia = Barber.getColombiaTime();
    const dateColombia = new Date(date.toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
    const isToday = dateColombia.toDateString() === nowColombia.toDateString();
    const currentHour = nowColombia.getHours();

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = dayNames[date.getDay()];
    const day = date.getDate();

    for (let hour = start; hour < end; hour++) {
      // Skip past hours if today (using Colombia time)
      if (isToday && hour <= currentHour) {
        continue;
      }
      
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      
      rows.push({
        id: `adm_blocktime_${hour.toString().padStart(2, '0')}_00`,
        title: `🚫 ${displayHour}:00 ${ampm}`,
        description: `Bloquear de ${hour}:00 a ${hour + 1}:00`
      });
    }

    if (rows.length === 0) {
      await this.#messagingService.sendButtonMessage(phoneNumber, {
        body: `🚫 *Bloquear Horario*\n\n${dayName} ${day}\n\nNo hay horarios disponibles para bloquear.`,
        buttons: [
          { id: 'adm_block', title: '📅 Otra fecha' },
          { id: 'adm_menu', title: '📋 Menú' }
        ]
      });
      return;
    }

    await this.#messagingService.sendListMessage(phoneNumber, {
      header: '🚫 Bloquear Horario',
      body: `${dayName} ${day}\n\nSelecciona la hora a bloquear:`,
      buttonText: 'Ver horarios',
      sections: [
        {
          title: 'Horarios disponibles',
          rows: rows.slice(0, 10) // WhatsApp limit
        }
      ]
    });
  }

  async #handleTodayAppointments(phoneNumber, barber) {
    // Use Colombia timezone for today's date
    const todayColombia = Barber.getColombiaTime();
    const year = todayColombia.getFullYear();
    const month = String(todayColombia.getMonth() + 1).padStart(2, '0');
    const day = String(todayColombia.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    await this.#handleAppointmentsForDate(phoneNumber, barber, today);
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

  async #handleBlockSlot(phoneNumber, barber, time, dateStr) {
    const date = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
    
    const result = await this.#blockTimeSlot.execute({
      barberId: barber.id,
      time,
      date
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

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const dayName = dayNames[date.getDay()];
    const day = date.getDate();
    const month = monthNames[date.getMonth()];

    await this.#messagingService.sendButtonMessage(phoneNumber, {
      body: `🚫 *Horario Bloqueado*\n\n📅 ${dayName} ${day} de ${month}\n⏰ ${time}\n\nEste horario ya no estará disponible para citas.`,
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
