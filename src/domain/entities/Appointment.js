/**
 * Appointment Entity - Domain Layer
 * Represents a scheduled appointment in the system
 * Primary key: phoneNumber (one appointment per customer)
 */
export class Appointment {
  #id;
  #phoneNumber;
  #customerName;
  #serviceType;
  #dateTime;
  #status;
  #createdAt;

  static STATUSES = Object.freeze({
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed'
  });

  static SERVICE_TYPES = Object.freeze({
    CORTE: 'corte',
    BARBA: 'barba',
    CORTE_BARBA: 'corte_barba'
  });

  constructor({ id, phoneNumber, customerName, serviceType, dateTime, status, createdAt }) {
    this.#validate({ phoneNumber, customerName, serviceType, dateTime });
    
    this.#id = id ?? crypto.randomUUID();
    this.#phoneNumber = this.#sanitizePhone(phoneNumber);
    this.#customerName = this.#sanitizeName(customerName);
    this.#serviceType = serviceType;
    this.#dateTime = new Date(dateTime);
    this.#status = status ?? Appointment.STATUSES.PENDING;
    this.#createdAt = createdAt ? new Date(createdAt) : new Date();
  }

  #validate({ phoneNumber, customerName, serviceType, dateTime }) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error('Invalid phone number');
    }
    if (!customerName || typeof customerName !== 'string') {
      throw new Error('Invalid customer name');
    }
    if (!serviceType || !Object.values(Appointment.SERVICE_TYPES).includes(serviceType)) {
      throw new Error('Invalid service type');
    }
    if (!dateTime || isNaN(new Date(dateTime).getTime())) {
      throw new Error('Invalid date/time');
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
    this.#status = Appointment.STATUSES.COMPLETED;
  }

  isPast() {
    return this.#dateTime < new Date();
  }

  get id() { return this.#id; }
  get phoneNumber() { return this.#phoneNumber; }
  get customerName() { return this.#customerName; }
  get serviceType() { return this.#serviceType; }
  get dateTime() { return this.#dateTime; }
  get status() { return this.#status; }
  get createdAt() { return this.#createdAt; }

  toJSON() {
    return {
      id: this.#id,
      phoneNumber: this.#phoneNumber,
      customerName: this.#customerName,
      serviceType: this.#serviceType,
      dateTime: this.#dateTime.toISOString(),
      status: this.#status,
      createdAt: this.#createdAt.toISOString()
    };
  }

  static fromJSON(data) {
    return new Appointment(data);
  }

  static getServiceTypeLabel(serviceType) {
    const labels = {
      [Appointment.SERVICE_TYPES.CORTE]: 'Corte de cabello',
      [Appointment.SERVICE_TYPES.BARBA]: 'Arreglo de barba',
      [Appointment.SERVICE_TYPES.CORTE_BARBA]: 'Corte + Barba'
    };
    return labels[serviceType] || serviceType;
  }
}