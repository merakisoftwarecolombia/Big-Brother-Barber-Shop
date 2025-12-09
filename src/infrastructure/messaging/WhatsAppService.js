import { MessagingService } from '../../domain/ports/MessagingService.js';
import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * WhatsApp Service - Infrastructure Layer
 * Implements WhatsApp Cloud API integration with interactive messages
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
   * @param {string} phoneNumber 
   * @param {Array<{date: Date, availableSlots: number, totalSlots: number}>} datesWithAvailability 
   * @param {string} barberName 
   */
  async sendDateSelection(phoneNumber, datesWithAvailability, barberName) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    const rows = datesWithAvailability
      .filter(d => d.availableSlots > 0)
      .map(({ date, availableSlots }) => {
        const dayName = dayNames[date.getDay()];
        const day = date.getDate();
        const month = monthNames[date.getMonth()];
        const dateStr = date.toISOString().split('T')[0];
        
        return {
          id: `date_${dateStr}`,
          title: `${dayName} ${day} ${month}`,
          description: `${availableSlots} horario${availableSlots > 1 ? 's' : ''} disponible${availableSlots > 1 ? 's' : ''}`
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
   * Send time selection with available slots
   * @param {string} phoneNumber 
   * @param {Array<{time: string, dateTime: Date}>} availableSlots 
   * @param {string} dateStr 
   * @param {string} barberName 
   */
  async sendTimeSelection(phoneNumber, availableSlots, dateStr, barberName) {
    if (availableSlots.length === 0) {
      return this.sendButtonMessage(phoneNumber, {
        body: `Lo sentimos, no hay horarios disponibles para esta fecha con ${barberName}.`,
        buttons: [
          { id: 'btn_agendar', title: 'Elegir otra fecha' },
          { id: 'btn_menu', title: 'Menú principal' }
        ]
      });
    }

    // Group by morning/afternoon
    const morningSlots = availableSlots.filter(s => parseInt(s.time.split(':')[0]) < 12);
    const afternoonSlots = availableSlots.filter(s => parseInt(s.time.split(':')[0]) >= 12);
    
    const sections = [];
    
    if (morningSlots.length > 0) {
      sections.push({
        title: 'Mañana',
        rows: morningSlots.map(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          const displayHour = hour > 12 ? hour - 12 : hour;
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
          const ampm = hour >= 12 ? 'PM' : 'AM';
          return {
            id: `time_${slot.time}`,
            title: `${displayHour}:00 ${ampm}`
          };
        })
      });
    }

    return this.sendListMessage(phoneNumber, {
      header: '🕐 Selecciona la hora',
      body: `${dateStr} con ${barberName}\nCada cita dura 1 hora`,
      buttonText: 'Ver horarios',
      sections
    });
  }

  async sendConfirmation(phoneNumber, appointment, barberName) {
    const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
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
    const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
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
    const dateStr = appointment.dateTime.toLocaleDateString('es-CO', {
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