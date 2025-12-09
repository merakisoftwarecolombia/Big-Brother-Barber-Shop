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
        buttons: buttons.map((btn, index) => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title.substring(0, 20) // Max 20 chars
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
   * Send interactive list message (for menus with more options)
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
      image: {
        link: imageUrl
      }
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
      footer: 'Tu barbería de confianza'
    });
  }

  /**
   * Send service selection list
   */
  async sendServiceSelection(phoneNumber, customerName) {
    return this.sendListMessage(phoneNumber, {
      header: '💈 Selecciona el servicio',
      body: `Hola ${customerName}, ¿qué servicio deseas?`,
      buttonText: 'Ver servicios',
      sections: [
        {
          title: 'Servicios disponibles',
          rows: [
            { id: 'srv_corte', title: 'Corte de cabello', description: 'Corte clásico o moderno' },
            { id: 'srv_barba', title: 'Arreglo de barba', description: 'Perfilado y arreglo de barba' },
            { id: 'srv_corte_barba', title: 'Corte + Barba', description: 'Servicio completo' }
          ]
        }
      ]
    });
  }

  /**
   * Send date selection list (next 7 days)
   */
  async sendDateSelection(phoneNumber) {
    const dates = this.#generateNextDays(7);
    
    return this.sendListMessage(phoneNumber, {
      header: '📅 Selecciona la fecha',
      body: 'Elige el día para tu cita:',
      buttonText: 'Ver fechas',
      sections: [
        {
          title: 'Fechas disponibles',
          rows: dates.map(date => ({
            id: `date_${date.value}`,
            title: date.label,
            description: date.description
          }))
        }
      ]
    });
  }

  /**
   * Send time selection list
   */
  async sendTimeSelection(phoneNumber, selectedDate) {
    const times = this.#generateTimeSlots();
    
    // Split times into morning and afternoon sections
    const morningTimes = times.filter(t => parseInt(t.hour) < 12);
    const afternoonTimes = times.filter(t => parseInt(t.hour) >= 12);
    
    const sections = [];
    
    if (morningTimes.length > 0) {
      sections.push({
        title: 'Mañana',
        rows: morningTimes.map(time => ({
          id: `time_${time.value}`,
          title: time.label
        }))
      });
    }
    
    if (afternoonTimes.length > 0) {
      sections.push({
        title: 'Tarde',
        rows: afternoonTimes.map(time => ({
          id: `time_${time.value}`,
          title: time.label
        }))
      });
    }

    return this.sendListMessage(phoneNumber, {
      header: '🕐 Selecciona la hora',
      body: `Fecha seleccionada: ${selectedDate}\nElige la hora para tu cita:`,
      buttonText: 'Ver horarios',
      sections
    });
  }

  /**
   * Generate next N days for date selection
   */
  #generateNextDays(count) {
    const days = [];
    const today = new Date();
    
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    for (let i = 1; i <= count; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const dayName = dayNames[date.getDay()];
      const day = date.getDate();
      const month = monthNames[date.getMonth()];
      
      // Format: YYYY-MM-DD for value
      const value = date.toISOString().split('T')[0];
      
      days.push({
        value,
        label: `${dayName} ${day} ${month}`,
        description: i === 1 ? 'Mañana' : (i === 2 ? 'Pasado mañana' : '')
      });
    }
    
    return days;
  }

  /**
   * Generate time slots for appointment
   */
  #generateTimeSlots() {
    const slots = [];
    const startHour = 9; // 9 AM
    const endHour = 19; // 7 PM
    
    for (let hour = startHour; hour < endHour; hour++) {
      // Full hour
      slots.push({
        value: `${hour.toString().padStart(2, '0')}:00`,
        label: `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`,
        hour: hour.toString()
      });
      
      // Half hour
      slots.push({
        value: `${hour.toString().padStart(2, '0')}:30`,
        label: `${hour > 12 ? hour - 12 : hour}:30 ${hour >= 12 ? 'PM' : 'AM'}`,
        hour: hour.toString()
      });
    }
    
    return slots;
  }

  async sendConfirmation(phoneNumber, appointment) {
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
      body: `Hola ${appointment.customerName}!\n\nTu cita ha sido agendada:\n\n📅 ${dateStr}\n💇 ${serviceLabel}\n\nID: ${appointment.id.substring(0, 8)}`,
      buttons: [
        { id: `cancel_${appointment.id.substring(0, 8)}`, title: 'Cancelar cita' },
        { id: 'btn_menu', title: 'Menú principal' }
      ]
    });
  }

  async sendAppointmentDetails(phoneNumber, appointment) {
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
      body: `📅 ${dateStr}\n💇 ${serviceLabel}\n\nID: ${appointment.id.substring(0, 8)}`,
      buttons: [
        { id: `cancel_${appointment.id.substring(0, 8)}`, title: 'Cancelar cita' },
        { id: 'btn_menu', title: 'Menú principal' }
      ]
    });
  }

  async sendReminder(phoneNumber, appointment) {
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
      `💇 ${serviceLabel}\n\n` +
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