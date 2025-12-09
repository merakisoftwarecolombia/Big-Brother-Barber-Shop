import { MessagingService } from '../../domain/ports/MessagingService.js';
import { Appointment } from '../../domain/entities/Appointment.js';

/**
 * WhatsApp Service - Infrastructure Layer
 * Implements WhatsApp Cloud API integration
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

    const message = `💈 *Cita Confirmada*\n\n` +
      `Hola ${appointment.customerName}!\n\n` +
      `Tu cita ha sido agendada:\n\n` +
      `Fecha: ${dateStr}\n` +
      `Servicio: ${serviceLabel}\n\n` +
      `ID de cita: ${appointment.id.substring(0, 8)}\n\n` +
      `Para cancelar, escribe: *cancelar ${appointment.id.substring(0, 8)}*`;

    return this.sendMessage(phoneNumber, message);
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
      `Fecha: ${dateStr}\n` +
      `Servicio: ${serviceLabel}\n\n` +
      `¡Te esperamos!`;

    return this.sendMessage(phoneNumber, message);
  }
}