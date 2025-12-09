import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Appointment } from '../../domain/entities/Appointment.js';
import { Barber, DEFAULT_BARBERS } from '../../domain/entities/Barber.js';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository.js';
import { BarberRepository } from '../../domain/ports/BarberRepository.js';

/**
 * SQLite Repository - Infrastructure Layer
 * Implements persistence for appointments and barbers
 * 
 * Schema:
 * - barbers: Barber information
 * - appointments: Active appointments (one per phone number)
 * - appointment_history: Past appointments
 */
export class SQLiteAppointmentRepository extends AppointmentRepository {
  #db;
  #dbPath;
  #SQL;

  constructor(dbPath = './data/appointments.db') {
    super();
    this.#dbPath = dbPath;
  }

  async initialize() {
    this.#SQL = await initSqlJs();
    
    const dir = dirname(this.#dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(this.#dbPath)) {
      const fileBuffer = readFileSync(this.#dbPath);
      this.#db = new this.#SQL.Database(fileBuffer);
    } else {
      this.#db = new this.#SQL.Database();
    }

    this.#createTables();
    await this.#seedBarbers();
    return this;
  }

  #createTables() {
    // Barbers table
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS barbers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        working_hours_start INTEGER NOT NULL DEFAULT 9,
        working_hours_end INTEGER NOT NULL DEFAULT 19,
        slot_duration INTEGER NOT NULL DEFAULT 60
      )
    `);

    // Appointments table - phone_number is unique (one active appointment per customer)
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        barber_id TEXT NOT NULL,
        service_type TEXT NOT NULL,
        date_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (barber_id) REFERENCES barbers(id)
      )
    `);

    // History table
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS appointment_history (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        barber_id TEXT NOT NULL,
        service_type TEXT NOT NULL,
        date_time TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Indexes
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone_number)`);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_barber ON appointments(barber_id)`);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(date_time)`);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_barber_date ON appointments(barber_id, date_time)`);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_history_phone ON appointment_history(phone_number)`);
    
    this.#persist();
  }

  async #seedBarbers() {
    for (const barberData of DEFAULT_BARBERS) {
      const existing = this.#db.exec(
        `SELECT id FROM barbers WHERE id = '${this.#escapeString(barberData.id)}'`
      );
      
      if (existing.length === 0 || existing[0].values.length === 0) {
        this.#db.run(`
          INSERT INTO barbers (id, name, is_active)
          VALUES (?, ?, 1)
        `, [barberData.id, barberData.name]);
      }
    }
    this.#persist();
  }

  #persist() {
    const data = this.#db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.#dbPath, buffer);
  }

  #escapeString(str) {
    if (str === null || str === undefined) return 'NULL';
    return str.replace(/'/g, "''");
  }

  // ==================== BARBER METHODS ====================

  async findAllBarbers() {
    const result = this.#db.exec(`
      SELECT * FROM barbers WHERE is_active = 1 ORDER BY name
    `);
    
    if (result.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => this.#rowToBarber(result[0].columns, row));
  }

  async findBarberById(id) {
    const result = this.#db.exec(
      `SELECT * FROM barbers WHERE id = '${this.#escapeString(id)}'`
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    return this.#rowToBarber(result[0].columns, result[0].values[0]);
  }

  #rowToBarber(columns, values) {
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    
    return Barber.fromJSON({
      id: row.id,
      name: row.name,
      isActive: row.is_active === 1,
      workingHours: {
        start: row.working_hours_start,
        end: row.working_hours_end,
        slotDuration: row.slot_duration
      }
    });
  }

  // ==================== APPOINTMENT METHODS ====================

  async save(appointment) {
    const data = appointment.toJSON();
    
    const existingById = this.#db.exec(
      `SELECT id FROM appointments WHERE id = '${this.#escapeString(data.id)}'`
    );
    
    if (existingById.length > 0 && existingById[0].values.length > 0) {
      this.#db.run(`
        UPDATE appointments SET
          phone_number = ?,
          customer_name = ?,
          barber_id = ?,
          service_type = ?,
          date_time = ?,
          status = ?
        WHERE id = ?
      `, [
        data.phoneNumber,
        data.customerName,
        data.barberId,
        data.serviceType,
        data.dateTime,
        data.status,
        data.id
      ]);
    } else {
      // Check if phone number already has an appointment
      const existingByPhone = this.#db.exec(
        `SELECT id FROM appointments WHERE phone_number = '${this.#escapeString(data.phoneNumber)}'`
      );
      
      if (existingByPhone.length > 0 && existingByPhone[0].values.length > 0) {
        const existingId = existingByPhone[0].values[0][0];
        await this.delete(existingId);
      }
      
      this.#db.run(`
        INSERT INTO appointments (id, phone_number, customer_name, barber_id, service_type, date_time, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.id,
        data.phoneNumber,
        data.customerName,
        data.barberId,
        data.serviceType,
        data.dateTime,
        data.status,
        data.createdAt
      ]);
    }

    this.#persist();
    return appointment;
  }

  async findById(id) {
    const result = this.#db.exec(
      `SELECT * FROM appointments WHERE id = '${this.#escapeString(id)}'`
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    return this.#rowToAppointment(result[0].columns, result[0].values[0]);
  }

  async findByPhone(phoneNumber) {
    const sanitizedPhone = this.#escapeString(phoneNumber);
    const result = this.#db.exec(`
      SELECT * FROM appointments 
      WHERE phone_number = '${sanitizedPhone}'
      AND status != 'cancelled'
      LIMIT 1
    `);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    return this.#rowToAppointment(result[0].columns, result[0].values[0]);
  }

  async findByBarberAndDate(barberId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const result = this.#db.exec(`
      SELECT * FROM appointments 
      WHERE barber_id = '${this.#escapeString(barberId)}'
      AND date_time >= '${startOfDay.toISOString()}'
      AND date_time <= '${endOfDay.toISOString()}'
      AND status != 'cancelled'
      ORDER BY date_time ASC
    `);
    
    if (result.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => this.#rowToAppointment(result[0].columns, row));
  }

  async findByDateRange(startDate, endDate) {
    const result = this.#db.exec(`
      SELECT * FROM appointments 
      WHERE date_time BETWEEN '${startDate.toISOString()}' AND '${endDate.toISOString()}'
      AND status != 'cancelled'
      ORDER BY date_time ASC
    `);
    
    if (result.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => this.#rowToAppointment(result[0].columns, row));
  }

  async delete(id) {
    this.#db.run(`DELETE FROM appointments WHERE id = '${this.#escapeString(id)}'`);
    this.#persist();
  }

  async hasActiveAppointment(phoneNumber) {
    const appointment = await this.findByPhone(phoneNumber);
    return appointment !== null && !appointment.isPast() && appointment.status !== 'cancelled';
  }

  async isSlotAvailable(barberId, dateTime) {
    const slotStart = new Date(dateTime);
    const slotEnd = new Date(dateTime);
    slotEnd.setMinutes(slotEnd.getMinutes() + Appointment.DURATION_MINUTES);
    
    // Check if any appointment overlaps with this slot
    const result = this.#db.exec(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE barber_id = '${this.#escapeString(barberId)}'
      AND status != 'cancelled'
      AND (
        (date_time >= '${slotStart.toISOString()}' AND date_time < '${slotEnd.toISOString()}')
        OR (datetime(date_time, '+60 minutes') > '${slotStart.toISOString()}' AND date_time < '${slotStart.toISOString()}')
      )
    `);
    
    if (result.length === 0) {
      return true;
    }
    
    const count = result[0].values[0][0];
    return count === 0;
  }

  async getBookedSlots(barberId, date) {
    const appointments = await this.findByBarberAndDate(barberId, date);
    return appointments.map(apt => apt.dateTime);
  }

  async getHistory(phoneNumber) {
    const sanitizedPhone = this.#escapeString(phoneNumber);
    const result = this.#db.exec(`
      SELECT * FROM appointment_history 
      WHERE phone_number = '${sanitizedPhone}'
      LIMIT 1
    `);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      customerName: row.customer_name,
      barberId: row.barber_id,
      serviceType: row.service_type,
      dateTime: new Date(row.date_time),
      status: row.status,
      createdAt: new Date(row.created_at),
      archivedAt: new Date(row.archived_at)
    };
  }

  async processExpiredAppointments() {
    const now = new Date().toISOString();
    
    const expiredResult = this.#db.exec(`
      SELECT * FROM appointments 
      WHERE date_time < '${now}' AND status != 'cancelled'
    `);
    
    if (expiredResult.length === 0 || expiredResult[0].values.length === 0) {
      return 0;
    }
    
    let processedCount = 0;
    
    for (const row of expiredResult[0].values) {
      const columns = expiredResult[0].columns;
      const data = {};
      columns.forEach((col, i) => {
        data[col] = row[i];
      });
      
      // Delete existing history for this phone number
      this.#db.run(`
        DELETE FROM appointment_history 
        WHERE phone_number = '${this.#escapeString(data.phone_number)}'
      `);
      
      // Move to history
      this.#db.run(`
        INSERT INTO appointment_history 
        (id, phone_number, customer_name, barber_id, service_type, date_time, status, created_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, datetime('now'))
      `, [
        data.id,
        data.phone_number,
        data.customer_name,
        data.barber_id,
        data.service_type,
        data.date_time,
        data.created_at
      ]);
      
      // Delete from active appointments
      this.#db.run(`DELETE FROM appointments WHERE id = '${this.#escapeString(data.id)}'`);
      
      processedCount++;
    }
    
    this.#persist();
    return processedCount;
  }

  async countAppointmentsByDates(barberId, dates) {
    const counts = new Map();
    
    for (const date of dates) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const result = this.#db.exec(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE barber_id = '${this.#escapeString(barberId)}'
        AND date_time >= '${startOfDay.toISOString()}'
        AND date_time <= '${endOfDay.toISOString()}'
        AND status != 'cancelled'
      `);
      
      const count = result.length > 0 ? result[0].values[0][0] : 0;
      const dateKey = date.toISOString().split('T')[0];
      counts.set(dateKey, count);
    }
    
    return counts;
  }

  /**
   * Get available slots for a barber on a specific date
   * @param {string} barberId 
   * @param {Date} date 
   * @returns {Promise<Array<{time: string, dateTime: Date}>>}
   */
  async getAvailableSlots(barberId, date) {
    const barber = await this.findBarberById(barberId);
    if (!barber) {
      return [];
    }

    const allSlots = barber.generateTimeSlots(date);
    const bookedSlots = await this.getBookedSlots(barberId, date);
    
    // Filter out booked slots
    const bookedTimes = new Set(bookedSlots.map(d => d.getTime()));
    
    return allSlots.filter(slot => !bookedTimes.has(slot.dateTime.getTime()));
  }

  #rowToAppointment(columns, values) {
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    
    return Appointment.fromJSON({
      id: row.id,
      phoneNumber: row.phone_number,
      customerName: row.customer_name,
      barberId: row.barber_id,
      serviceType: row.service_type,
      dateTime: row.date_time,
      status: row.status,
      createdAt: row.created_at
    });
  }

  close() {
    if (this.#db) {
      this.#persist();
      this.#db.close();
    }
  }
}