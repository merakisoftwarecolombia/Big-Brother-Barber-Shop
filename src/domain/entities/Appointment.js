/**
 * Appointment Entity - Domain Layer
 * Represents a scheduled appointment in the system
 */
export class Appointment {
  #id;
  #phoneNumber;
  #customerName;
  #dateTime;
  #status;
  #createdAt;

  static STATUSES = Object.freeze({
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed'
  });

  constructor({ id, phoneNumber, customerName, dateTime, status, createdAt }) {
    this.#validate({ phoneNumber, customerName, dateTime });
    
    this.#id = id ?? crypto.randomUUID();
    this.#phoneNumber = this.#sanitizePhone(phoneNumber);
    this.#customerName = this.#sanitizeName(customerName);
    this.#dateTime = new Date(dateTime);
    this.#status = status ?? Appointment.STATUSES.PENDING;
    this.#createdAt = createdAt ? new Date(createdAt) : new Date();
  }

  #validate({ phoneNumber, customerName, dateTime }) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error('Invalid phone number');
    }
    if (!customerName || typeof customerName !== 'string') {
      throw new Error('Invalid customer name');
    }
    if (!dateTime || isNaN(new Date(dateTime).getTime())) {
      throw new Error('Invalid date/time');
    }
    if (new Date(dateTime) < new Date()) {
      throw new Error('Appointment date must be in the future');
    }
  }

  #sanitizePhone(phone) {
    return phone.replace(/[^\d+]/g, '');
  }

  #sanitizeName(name) {
    return name.trim().substring(0, 100);
  }

  confirm() {
    if (this.#status === Appointment.STATUSES.CANCELLED) {
      throw new Error('Cannot confirm a cancelled appointment');
    }
    this.#status = Appointment.STATUSES.CONFIRMED;
  }

  cancel() {
    if (this.#status === Appointment.STATUSES.COMPLETED) {
      throw new Error('Cannot cancel a completed appointment');
    }
    this.#status = Appointment.STATUSES.CANCELLED;
  }

  complete() {
    if (this.#status !== Appointment.STATUSES.CONFIRMED) {
      throw new Error('Only confirmed appointments can be completed');
    }
    this.#status = Appointment.STATUSES.COMPLETED;
  }

  get id() { return this.#id; }
  get phoneNumber() { return this.#phoneNumber; }
  get customerName() { return this.#customerName; }
  get dateTime() { return this.#dateTime; }
  get status() { return this.#status; }
  get createdAt() { return this.#createdAt; }

  toJSON() {
    return {
      id: this.#id,
      phoneNumber: this.#phoneNumber,
      customerName: this.#customerName,
      dateTime: this.#dateTime.toISOString(),
      status: this.#status,
      createdAt: this.#createdAt.toISOString()
    };
  }

  static fromJSON(data) {
    return new Appointment(data);
  }
}