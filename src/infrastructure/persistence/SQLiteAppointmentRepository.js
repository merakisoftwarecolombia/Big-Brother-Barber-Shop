import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Appointment } from '../../domain/entities/Appointment.js';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository.js';

/**
 * SQLite Appointment Repository - Infrastructure Layer
 * Implements persistence using sql.js (pure JavaScript SQLite)
 * 
 * Schema Design:
 * - appointments: Active appointments (one per phone number)
 * - appointment_history: Past appointments (one per phone number, replaced on new expiry)
 * - Trigger: Automatically moves expired appointments to history
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
    this.#createTriggers();
    return this;
  }

  #createTables() {
    // Main appointments table - phone_number is unique (one appointment per customer)
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        service_type TEXT NOT NULL,
        date_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // History table - stores last expired appointment per phone number
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS appointment_history (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        service_type TEXT NOT NULL,
        date_time TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Indexes for performance
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone_number)`);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(date_time)`);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_history_phone ON appointment_history(phone_number)`);
    
    this.#persist();
  }

  #createTriggers() {
    // Note: sql.js doesn't support triggers that execute automatically,
    // so we implement the logic in processExpiredAppointments method
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

  async save(appointment) {
    const data = appointment.toJSON();
    
    // Check if appointment exists by ID
    const existingById = this.#db.exec(
      `SELECT id FROM appointments WHERE id = '${this.#escapeString(data.id)}'`
    );
    
    if (existingById.length > 0 && existingById[0].values.length > 0) {
      // Update existing appointment
      this.#db.run(`
        UPDATE appointments SET
          phone_number = ?,
          customer_name = ?,
          service_type = ?,
          date_time = ?,
          status = ?
        WHERE id = ?
      `, [
        data.phoneNumber,
        data.customerName,
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
        // Delete existing appointment for this phone (will be replaced)
        const existingId = existingByPhone[0].values[0][0];
        await this.delete(existingId);
      }
      
      // Insert new appointment
      this.#db.run(`
        INSERT INTO appointments (id, phone_number, customer_name, service_type, date_time, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        data.id,
        data.phoneNumber,
        data.customerName,
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
      LIMIT 1
    `);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    return this.#rowToAppointment(result[0].columns, result[0].values[0]);
  }

  async findByDateRange(startDate, endDate) {
    const result = this.#db.exec(`
      SELECT * FROM appointments 
      WHERE date_time BETWEEN '${startDate.toISOString()}' AND '${endDate.toISOString()}'
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
      serviceType: row.service_type,
      dateTime: new Date(row.date_time),
      status: row.status,
      createdAt: new Date(row.created_at),
      archivedAt: new Date(row.archived_at)
    };
  }

  async processExpiredAppointments() {
    const now = new Date().toISOString();
    
    // Find expired appointments
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
      
      // Delete existing history for this phone number (only keep latest)
      this.#db.run(`
        DELETE FROM appointment_history 
        WHERE phone_number = '${this.#escapeString(data.phone_number)}'
      `);
      
      // Move to history
      this.#db.run(`
        INSERT INTO appointment_history 
        (id, phone_number, customer_name, service_type, date_time, status, created_at, archived_at)
        VALUES (?, ?, ?, ?, ?, 'completed', ?, datetime('now'))
      `, [
        data.id,
        data.phone_number,
        data.customer_name,
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

  #rowToAppointment(columns, values) {
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    
    return Appointment.fromJSON({
      id: row.id,
      phoneNumber: row.phone_number,
      customerName: row.customer_name,
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