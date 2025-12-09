import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Appointment } from '../../domain/entities/Appointment.js';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository.js';

/**
 * SQLite Appointment Repository - Infrastructure Layer
 * Implements persistence using sql.js (pure JavaScript SQLite)
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
    
    // Ensure directory exists
    const dir = dirname(this.#dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Load existing database or create new one
    if (existsSync(this.#dbPath)) {
      const fileBuffer = readFileSync(this.#dbPath);
      this.#db = new this.#SQL.Database(fileBuffer);
    } else {
      this.#db = new this.#SQL.Database();
    }

    this.#createTables();
    return this;
  }

  #createTables() {
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        date_time TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_phone ON appointments(phone_number)`);
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_date ON appointments(date_time)`);
    this.#persist();
  }

  #persist() {
    const data = this.#db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.#dbPath, buffer);
  }

  async save(appointment) {
    const data = appointment.toJSON();
    
    // Check if exists
    const existing = this.#db.exec(`SELECT id FROM appointments WHERE id = '${data.id}'`);
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update
      this.#db.run(`
        UPDATE appointments SET
          phone_number = ?,
          customer_name = ?,
          date_time = ?,
          status = ?,
          created_at = ?
        WHERE id = ?
      `, [data.phoneNumber, data.customerName, data.dateTime, data.status, data.createdAt, data.id]);
    } else {
      // Insert
      this.#db.run(`
        INSERT INTO appointments (id, phone_number, customer_name, date_time, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [data.id, data.phoneNumber, data.customerName, data.dateTime, data.status, data.createdAt]);
    }

    this.#persist();
    return appointment;
  }

  async findById(id) {
    const result = this.#db.exec(`SELECT * FROM appointments WHERE id = '${id}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.#rowToAppointment(result[0].columns, result[0].values[0]);
  }

  async findByPhone(phoneNumber) {
    const result = this.#db.exec(`
      SELECT * FROM appointments 
      WHERE phone_number = '${phoneNumber}' 
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
      ORDER BY date_time ASC
    `);
    if (result.length === 0) {
      return [];
    }
    return result[0].values.map(row => this.#rowToAppointment(result[0].columns, row));
  }

  async delete(id) {
    this.#db.run(`DELETE FROM appointments WHERE id = '${id}'`);
    this.#persist();
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