/**
 * Client Entity - Domain Layer
 * Represents a client in the system
 * 
 * Clients are automatically registered when they book an appointment.
 * This entity stores basic client information for future reference.
 */
export class Client {
  #phoneNumber;
  #name;
  #totalAppointments;
  #lastAppointmentDate;
  #createdAt;
  #updatedAt;

  constructor({ 
    phoneNumber, 
    name, 
    totalAppointments = 0, 
    lastAppointmentDate = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    this.#validate({ phoneNumber, name });
    
    this.#phoneNumber = this.#sanitizePhone(phoneNumber);
    this.#name = this.#sanitizeName(name);
    this.#totalAppointments = totalAppointments;
    this.#lastAppointmentDate = lastAppointmentDate;
    this.#createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.#updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  #validate({ phoneNumber, name }) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error('Invalid phone number');
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new Error('Invalid client name');
    }
  }

  #sanitizePhone(phone) {
    // Remove all non-numeric characters
    return phone.replace(/\D/g, '');
  }

  #sanitizeName(name) {
    // Trim and limit length, capitalize first letters
    return name.trim()
      .substring(0, 100)
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  get phoneNumber() { return this.#phoneNumber; }
  get name() { return this.#name; }
  get totalAppointments() { return this.#totalAppointments; }
  get lastAppointmentDate() { return this.#lastAppointmentDate; }
  get createdAt() { return this.#createdAt; }
  get updatedAt() { return this.#updatedAt; }

  /**
   * Update client name
   * @param {string} newName 
   */
  updateName(newName) {
    if (!newName || typeof newName !== 'string' || newName.trim().length < 2) {
      throw new Error('Invalid name');
    }
    this.#name = this.#sanitizeName(newName);
    this.#updatedAt = new Date();
  }

  /**
   * Increment appointment count and update last appointment date
   */
  recordAppointment() {
    this.#totalAppointments++;
    this.#lastAppointmentDate = new Date();
    this.#updatedAt = new Date();
  }

  toJSON() {
    return {
      phoneNumber: this.#phoneNumber,
      name: this.#name,
      totalAppointments: this.#totalAppointments,
      lastAppointmentDate: this.#lastAppointmentDate?.toISOString() || null,
      createdAt: this.#createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString()
    };
  }

  static fromJSON(data) {
    return new Client({
      phoneNumber: data.phoneNumber || data.phone_number,
      name: data.name,
      totalAppointments: data.totalAppointments || data.total_appointments || 0,
      lastAppointmentDate: data.lastAppointmentDate || data.last_appointment_date 
        ? new Date(data.lastAppointmentDate || data.last_appointment_date) 
        : null,
      createdAt: data.createdAt || data.created_at ? new Date(data.createdAt || data.created_at) : new Date(),
      updatedAt: data.updatedAt || data.updated_at ? new Date(data.updatedAt || data.updated_at) : new Date()
    });
  }
}