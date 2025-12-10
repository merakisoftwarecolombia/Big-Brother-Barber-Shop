import { MessagingService } from '../../domain/ports/MessagingService.js';
import { Appointment } from '../../domain/entities/Appointment.js';
import { Barber } from '../../domain/entities/Barber.js';

/**
 * WhatsApp Service - Infrastructure Layer
 * Implements WhatsApp Cloud API integration with interactive messages
 *
 * IMPORTANT: All date/time displays use Colombia timezone (UTC-5)
 */
export class WhatsAppService extends MessagingService {
  #accessToken;
  #phoneNumberId;
  #apiVersion = 'v18.0';
  #baseImageUrl;

  constructor({ accessToken, phoneNumberId, baseImageUrl = '' }) {
    super();
    this.#accessToken = accessToken;
    this.#phoneNumberId = phoneNumberId;
    this.#baseImageUrl = baseImageUrl;
  }

  async sendMessage(phoneNumber, message) {
    const url = `https://graph.facebook.com/${this.#apiVersion}/${this.#phoneNumberId}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('WhatsApp API error:', JSON.stringify(error));
      throw new Error('Failed to send WhatsApp message');
    }

    return response.json();
  }

  /**
   * Send interactive button message (max 3 buttons)
   */
  async sendButtonMessage(phoneNumber, { body, buttons, header = null, footer = null }) {
    const url = `https://graph.facebook.com/${this.#apiVersion}/${this.#phoneNumberId}/messages`;
    
    const interactive = {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title.substring(0, 20)
          }
        }))
      }
    };

    if (header) {
      interactive.header = { type: 'text', text: header };
    }

    if (footer) {
      interactive.footer = { text: footer };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('WhatsApp API error (buttons):', JSON.stringify(error));
      throw new Error('Failed to send WhatsApp button message');
    }

    return response.json();
  }

  /**
   * Send interactive list message
   */
  async sendListMessage(phoneNumber, { body, buttonText, sections, header = null, footer = null }) {
    const url = `https://graph.facebook.com/${this.#apiVersion}/${this.#phoneNumberId}/messages`;
    
    const interactive = {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonText.substring(0, 20),
        sections: sections.map(section => ({
          title: section.title.substring(0, 24),
          rows: section.rows.map(row => ({
            id: row.id,
            title: row.title.substring(0, 24),
            description: row.description ? row.description.substring(0, 72) : undefined
          }))
        }))
      }
    };

    if (header) {
      interactive.header = { type: 'text', text: header };
    }

    if (footer) {
      interactive.footer = { text: footer };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('WhatsApp API error (list):', JSON.stringify(error));
      throw new Error('Failed to send WhatsApp list message');
    }

    return response.json();
  }

  async sendImage(phoneNumber, imageUrl, caption = '') {
    const url = `https://graph.facebook.com/${this.#apiVersion}/${this.#phoneNumberId}/messages`;
    
    const body = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'image',
      image: { link: imageUrl }
    };

    if (caption) {
      body.image.caption = caption;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('WhatsApp API error (image):', JSON.stringify(error));
      throw new Error('Failed to send WhatsApp image');
    }

    return response.json();
  }

  getImageUrl(imageName) {
    return `${this.#baseImageUrl}/Imagenes/${imageName}`;
  }

  /**
   * Send welcome menu with buttons
   */
  async sendWelcomeMenu(phoneNumber) {
    return this.sendButtonMessage(phoneNumber, {
      header: '💈 Big Brother Barber Shop',
      body: '¡Bienvenido! ¿Qué te gustaría hacer hoy?',
      buttons: [
        { id: 'btn_agendar', title: 'Agendar cita' },
        { id: 'btn_ver_citas', title: 'Ver mi cita' }
      ],
      footer: 'by Meraki | meraki.com'
    });
  }

  /**
   * Send barber selection list
   */
  async sendBarberSelection(phoneNumber, barbers, customerName) {
    const rows = barbers.map(barber => ({
      id: `barber_${barber.id}`,
      title: barber.name,
      description: 'Disponible'
    }));

    return this.sendListMessage(phoneNumber, {
      header: '💈 Selecciona tu barbero',
      body: `Hola ${customerName}, ¿con quién te gustaría atenderte?`,
      buttonText: 'Ver barberos',
      sections: [
        {
          title: 'Barberos disponibles',
          rows
        }
      ]
    });
  }

  /**
   * Send service selection list
   */
  async sendServiceSelection(phoneNumber, customerName) {
    return this.sendListMessage(phoneNumber, {
      header: '💈 Selecciona el servicio',
      body: `${customerName}, ¿qué servicio deseas?`,
      buttonText: 'Ver servicios',
      sections: [
        {
          title: 'Servicios disponibles',
          rows: [
            { id: 'srv_corte', title: 'Corte de cabello', description: 'Corte clásico o moderno' },
            { id: 'srv_barba', title: 'Arreglo de barba', description: 'Perfilado y arreglo' },
            { id: 'srv_corte_barba', title: 'Corte + Barba', description: 'Servicio completo' }
          ]
        }
      ]
    });
  }

  /**
   * Send date selection with availability info
   * Uses Colombia timezone for date display
   * @param {string} phoneNumber
   * @param {Array<{date: Date, availableSlots: number, totalSlots: number, isToday?: boolean, dayIndex?: number}>} datesWithAvailability
   * @param {string} barberName
   */
  async sendDateSelection(phoneNumber, datesWithAvailability, barberName) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    const rows = datesWithAvailability
      .filter(d => d.availableSlots > 0)
      .map(({ date, availableSlots, isToday, dayIndex }) => {
        const dayName = dayNames[date.getDay()];
        const day = date.getDate();
        const month = monthNames[date.getMonth()];
        
        // Format date string in YYYY-MM-DD format (Colombia time)
        const year = date.getFullYear();
        const monthNum = String(date.getMonth() + 1).padStart(2, '0');
        const dayNum = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${monthNum}-${dayNum}`;
        
        // Build title with date
        const title = `${dayName} ${day} ${month}`;
        
        // Subtle description for first 2 days: Hoy, Mañana (capitalized)
        let description;
        if (dayIndex === 0 || isToday) {
          description = 'Hoy';
        } else if (dayIndex === 1) {
          description = 'Mañana';
        } else {
          description = undefined;
        }
        
        return {
          id: `date_${dateStr}`,
          title,
          description
        };
      });

    if (rows.length === 0) {
      return this.sendButtonMessage(phoneNumber, {
        body: `Lo sentimos, ${barberName} no tiene disponibilidad en los próximos días.`,
        buttons: [
          { id: 'btn_agendar', title: 'Elegir otro barbero' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
    }

    return this.sendListMessage(phoneNumber, {
      header: '📅 Selecciona la fecha',
      body: `Disponibilidad de ${barberName}:`,
      buttonText: 'Ver fechas',
      sections: [
        {
          title: 'Fechas disponibles',
          rows
        }
      ]
    });
  }

  /**
   * Send time selection with available slots (with pagination support)
   * @param {string} phoneNumber
   * @param {Array<{time: string, dateTime: Date}>} availableSlots
   * @param {string} dateStr
   * @param {string} barberName
   * @param {number} page - Page number (0 = first 10 slots, 1 = next slots)
   * @returns {Promise<{hasMore: boolean}>} - Returns whether there are more slots
   */
  async sendTimeSelection(phoneNumber, availableSlots, dateStr, barberName, page = 0) {
    if (availableSlots.length === 0) {
      return this.sendButtonMessage(phoneNumber, {
        body: `Lo sentimos, no hay horarios disponibles para esta fecha con ${barberName}.`,
        buttons: [
          { id: 'btn_otra_fecha', title: 'Elegir otra fecha' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
    }

    // WhatsApp has a limit of 10 total rows in a list message
    const PAGE_SIZE = 10;
    const startIndex = page * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const paginatedSlots = availableSlots.slice(startIndex, endIndex);
    const hasMore = availableSlots.length > endIndex;
    const totalSlots = availableSlots.length;

    // Group by morning/afternoon/evening (extended hours until 9 PM)
    const morningSlots = paginatedSlots.filter(s => parseInt(s.time.split(':')[0]) < 12);
    const afternoonSlots = paginatedSlots.filter(s => {
      const hour = parseInt(s.time.split(':')[0]);
      return hour >= 12 && hour < 18;
    });
    const eveningSlots = paginatedSlots.filter(s => parseInt(s.time.split(':')[0]) >= 18);
    
    const sections = [];
    
    if (morningSlots.length > 0) {
      sections.push({
        title: 'Mañana',
        rows: morningSlots.map(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          return {
            id: `time_${slot.time}`,
            title: `${displayHour}:00 ${ampm}`
          };
        })
      });
    }
    
    if (afternoonSlots.length > 0) {
      sections.push({
        title: 'Tarde',
        rows: afternoonSlots.map(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          const displayHour = hour > 12 ? hour - 12 : hour;
          const ampm = 'PM';
          return {
            id: `time_${slot.time}`,
            title: `${displayHour}:00 ${ampm}`
          };
        })
      });
    }

    if (eveningSlots.length > 0) {
      sections.push({
        title: 'Noche',
        rows: eveningSlots.map(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          const displayHour = hour > 12 ? hour - 12 : hour;
          const ampm = 'PM';
          return {
            id: `time_${slot.time}`,
            title: `${displayHour}:00 ${ampm}`
          };
        })
      });
    }

    // Build body message with pagination info
    let bodyText = `${dateStr} con ${barberName}\nCada cita dura 1 hora`;
    if (page > 0) {
      bodyText = `${dateStr} con ${barberName}\nMás horarios disponibles:`;
    }

    await this.sendListMessage(phoneNumber, {
      header: '🕐 Selecciona la hora',
      body: bodyText,
      buttonText: 'Ver horarios',
      sections
    });

    // If there are more slots, send a button to see more
    if (hasMore) {
      const remainingSlots = totalSlots - endIndex;
      await this.sendButtonMessage(phoneNumber, {
        body: `Hay ${remainingSlots} horario${remainingSlots > 1 ? 's' : ''} más disponible${remainingSlots > 1 ? 's' : ''} en la noche.`,
        buttons: [
          { id: 'btn_mas_horarios', title: '🕐 Ver más horarios' }
        ]
      });
    }

    return { hasMore };
  }

  async sendConfirmation(phoneNumber, appointment, barberName) {
    // Use Colombia timezone for date display
    const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
      timeZone: Barber.COLOMBIA_TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const serviceLabel = Appointment.getServiceTypeLabel(appointment.serviceType);

    return this.sendButtonMessage(phoneNumber, {
      header: '💈 Cita Confirmada',
      body: `Hola ${appointment.customerName}!\n\nTu cita ha sido agendada:\n\n📅 ${dateStr}\n💇 ${serviceLabel}\n👤 Barbero: ${barberName}\n\nID: ${appointment.id.substring(0, 8)}`,
      buttons: [
        { id: `cancel_${appointment.id.substring(0, 8)}`, title: 'Cancelar cita' },
        { id: 'btn_menu', title: 'Menú principal' }
      ]
    });
  }

  async sendAppointmentDetails(phoneNumber, appointment, barberName) {
    // Use Colombia timezone for date display
    const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
      timeZone: Barber.COLOMBIA_TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const serviceLabel = Appointment.getServiceTypeLabel(appointment.serviceType);

    return this.sendButtonMessage(phoneNumber, {
      header: '💈 Tu Cita',
      body: `📅 ${dateStr}\n💇 ${serviceLabel}\n👤 Barbero: ${barberName}\n\nID: ${appointment.id.substring(0, 8)}`,
      buttons: [
        { id: `cancel_${appointment.id.substring(0, 8)}`, title: 'Cancelar cita' },
        { id: 'btn_menu', title: 'Menú principal' }
      ]
    });
  }

  async sendReminder(phoneNumber, appointment, barberName) {
    // Use Colombia timezone for date display
    const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
      timeZone: Barber.COLOMBIA_TIMEZONE,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const serviceLabel = Appointment.getServiceTypeLabel(appointment.serviceType);

    const message = `💈 *Recordatorio de Cita*\n\n` +
      `Hola ${appointment.customerName}!\n\n` +
      `Te recordamos tu cita:\n\n` +
      `📅 ${dateStr}\n` +
      `💇 ${serviceLabel}\n` +
      `👤 Barbero: ${barberName}\n\n` +
      `¡Te esperamos!`;

    return this.sendMessage(phoneNumber, message);
  }

  async sendNoAppointmentMessage(phoneNumber) {
    return this.sendButtonMessage(phoneNumber, {
      body: 'No tienes citas programadas.',
      buttons: [
        { id: 'btn_agendar', title: 'Agendar cita' },
        { id: 'btn_menu', title: 'Menú principal' }
      ]
    });
  }

  async sendCancellationConfirmation(phoneNumber, dateStr) {
    return this.sendButtonMessage(phoneNumber, {
      header: '💈 Cita Cancelada',
      body: `Tu cita del ${dateStr} ha sido cancelada.`,
      buttons: [
        { id: 'btn_agendar', title: 'Agendar nueva cita' },
        { id: 'btn_menu', title: 'Menú principal' }
      ]
    });
  }
}