/**
 * ClientNote Entity - Domain Layer
 * Represents a note/comment about a client stored by a barber
 * 
 * Business Rules:
 * - Notes are associated with a client (phone number) and a barber
 * - Notes can be linked to a specific appointment
 * - Notes have a maximum length for security
 * - Notes are sanitized to prevent injection attacks
 */
export class ClientNote {
  #id;
  #phoneNumber;
  #barberId;
  #appointmentId;
  #content;
  #createdAt;
  #updatedAt;

  static MAX_CONTENT_LENGTH = 500;

  constructor({ id, phoneNumber, barberId, appointmentId, content, createdAt, updatedAt }) {
    this.#validate({ phoneNumber, barberId, content });
    
    this.#id = id ?? crypto.randomUUID();
    this.#phoneNumber = this.#sanitizePhone(phoneNumber);
    this.#barberId = barberId;
    this.#appointmentId = appointmentId || null;
    this.#content = this.#sanitizeContent(content);
    this.#createdAt = createdAt ? new Date(createdAt) : new Date();
    this.#updatedAt = updatedAt ? new Date(updatedAt) : new Date();
  }

  #validate({ phoneNumber, barberId, content }) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error('Invalid phone number');
    }
    
    if (!barberId || typeof barberId !== 'string') {
      throw new Error('Invalid barber ID');
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Note content cannot be empty');
    }

    if (content.length > ClientNote.MAX_CONTENT_LENGTH) {
      throw new Error(`Note content exceeds maximum length of ${ClientNote.MAX_CONTENT_LENGTH} characters`);
    }
  }

  #sanitizePhone(phone) {
    return phone.replace(/[^\d+]/g, '');
  }

  #sanitizeContent(content) {
    // Remove potentially dangerous characters while preserving readability
    return content
      .trim()
      .substring(0, ClientNote.MAX_CONTENT_LENGTH)
      // Remove control characters except newlines
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Escape HTML-like content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Update the note content
   * @param {string} newContent 
   */
  updateContent(newContent) {
    if (!newContent || typeof newContent !== 'string' || newContent.trim().length === 0) {
      throw new Error('Note content cannot be empty');
    }

    if (newContent.length > ClientNote.MAX_CONTENT_LENGTH) {
      throw new Error(`Note content exceeds maximum length of ${ClientNote.MAX_CONTENT_LENGTH} characters`);
    }

    this.#content = this.#sanitizeContent(newContent);
    this.#updatedAt = new Date();
  }

  /**
   * Link this note to an appointment
   * @param {string} appointmentId 
   */
  linkToAppointment(appointmentId) {
    if (!appointmentId || typeof appointmentId !== 'string') {
      throw new Error('Invalid appointment ID');
    }
    this.#appointmentId = appointmentId;
    this.#updatedAt = new Date();
  }

  get id() { return this.#id; }
  get phoneNumber() { return this.#phoneNumber; }
  get barberId() { return this.#barberId; }
  get appointmentId() { return this.#appointmentId; }
  get content() { return this.#content; }
  get createdAt() { return new Date(this.#createdAt); }
  get updatedAt() { return new Date(this.#updatedAt); }

  /**
   * Get a preview of the note (first 50 characters)
   * @returns {string}
   */
  getPreview() {
    if (this.#content.length <= 50) {
      return this.#content;
    }
    return this.#content.substring(0, 47) + '...';
  }

  toJSON() {
    return {
      id: this.#id,
      phoneNumber: this.#phoneNumber,
      barberId: this.#barberId,
      appointmentId: this.#appointmentId,
      content: this.#content,
      createdAt: this.#createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString()
    };
  }

  static fromJSON(data) {
    return new ClientNote(data);
  }
}