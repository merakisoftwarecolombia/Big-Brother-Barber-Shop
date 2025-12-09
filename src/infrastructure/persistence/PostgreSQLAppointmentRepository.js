import pg from 'pg';
import { Appointment } from '../../domain/entities/Appointment.js';
import { Barber, DEFAULT_BARBERS } from '../../domain/entities/Barber.js';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository.js';

const { Pool } = pg;

/**
 * PostgreSQL Repository - Infrastructure Layer
 * Implements persistence using Supabase PostgreSQL
 * 
 * Schema:
 * - barbers: Barber information
 * - appointments: Active appointments (one per phone number)
 * - appointment_history: Past appointments
 */
export class PostgreSQLAppointmentRepository extends AppointmentRepository {
  #pool;

  constructor(connectionString) {
    super();
    this.#pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }

  async initialize() {
    await this.#createTables();
    await this.#seedBarbers();
    return this;
  }

  async #createTables() {
    const client = await this.#pool.connect();
    try {
      // Barbers table
      await client.query(`
        CREATE TABLE IF NOT EXISTS barbers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          working_hours_start INTEGER NOT NULL DEFAULT 9,
          working_hours_end INTEGER NOT NULL DEFAULT 19,
          slot_duration INTEGER NOT NULL DEFAULT 60
        )
      `);

      // Appointments table - phone_number is unique
      await client.query(`
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          phone_number TEXT NOT NULL UNIQUE,
          customer_name TEXT NOT NULL,
          barber_id TEXT NOT NULL REFERENCES barbers(id),
          service_type TEXT NOT NULL,
          date_time TIMESTAMPTZ NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // History table
      await client.query(`
        CREATE TABLE IF NOT EXISTS appointment_history (
          id TEXT PRIMARY KEY,
          phone_number TEXT NOT NULL UNIQUE,
          customer_name TEXT NOT NULL,
          barber_id TEXT NOT NULL,
          service_type TEXT NOT NULL,
          date_time TIMESTAMPTZ NOT NULL,
          status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Indexes
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone_number)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_barber ON appointments(barber_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(date_time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_barber_date ON appointments(barber_id, date_time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_history_phone ON appointment_history(phone_number)`);
    } finally {
      client.release();
    }
  }

  async #seedBarbers() {
    const client = await this.#pool.connect();
    try {
      for (const barberData of DEFAULT_BARBERS) {
        await client.query(`
          INSERT INTO barbers (id, name, is_active)
          VALUES ($1, $2, true)
          ON CONFLICT (id) DO NOTHING
        `, [barberData.id, barberData.name]);
      }
    } finally {
      client.release();
    }
  }

  // ==================== BARBER METHODS ====================

  async findAllBarbers() {
    const result = await this.#pool.query(`
      SELECT * FROM barbers WHERE is_active = true ORDER BY name
    `);
    return result.rows.map(row => this.#rowToBarber(row));
  }

  async findBarberById(id) {
    const result = await this.#pool.query(
      `SELECT * FROM barbers WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToBarber(result.rows[0]);
  }

  #rowToBarber(row) {
    return Barber.fromJSON({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
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
    const client = await this.#pool.connect();
    
    try {
      // Check if appointment exists by ID
      const existing = await client.query(
        `SELECT id FROM appointments WHERE id = $1`,
        [data.id]
      );
      
      if (existing.rows.length > 0) {
        // Update
        await client.query(`
          UPDATE appointments SET
            phone_number = $1,
            customer_name = $2,
            barber_id = $3,
            service_type = $4,
            date_time = $5,
            status = $6
          WHERE id = $7
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
        const existingByPhone = await client.query(
          `SELECT id FROM appointments WHERE phone_number = $1`,
          [data.phoneNumber]
        );
        
        if (existingByPhone.rows.length > 0) {
          await client.query(
            `DELETE FROM appointments WHERE id = $1`,
            [existingByPhone.rows[0].id]
          );
        }
        
        // Insert
        await client.query(`
          INSERT INTO appointments (id, phone_number, customer_name, barber_id, service_type, date_time, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    } finally {
      client.release();
    }

    return appointment;
  }

  async findById(id) {
    const result = await this.#pool.query(
      `SELECT * FROM appointments WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToAppointment(result.rows[0]);
  }

  async findByPhone(phoneNumber) {
    const result = await this.#pool.query(`
      SELECT * FROM appointments 
      WHERE phone_number = $1
      AND status != 'cancelled'
      LIMIT 1
    `, [phoneNumber]);
    
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToAppointment(result.rows[0]);
  }

  async findByBarberAndDate(barberId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const result = await this.#pool.query(`
      SELECT * FROM appointments 
      WHERE barber_id = $1
      AND date_time >= $2
      AND date_time <= $3
      AND status != 'cancelled'
      ORDER BY date_time ASC
    `, [barberId, startOfDay.toISOString(), endOfDay.toISOString()]);
    
    return result.rows.map(row => this.#rowToAppointment(row));
  }

  async findByDateRange(startDate, endDate) {
    const result = await this.#pool.query(`
      SELECT * FROM appointments 
      WHERE date_time BETWEEN $1 AND $2
      AND status != 'cancelled'
      ORDER BY date_time ASC
    `, [startDate.toISOString(), endDate.toISOString()]);
    
    return result.rows.map(row => this.#rowToAppointment(row));
  }

  async delete(id) {
    await this.#pool.query(`DELETE FROM appointments WHERE id = $1`, [id]);
  }

  async hasActiveAppointment(phoneNumber) {
    const appointment = await this.findByPhone(phoneNumber);
    return appointment !== null && !appointment.isPast() && appointment.status !== 'cancelled';
  }

  async isSlotAvailable(barberId, dateTime) {
    const slotStart = new Date(dateTime);
    const slotEnd = new Date(dateTime);
    slotEnd.setMinutes(slotEnd.getMinutes() + Appointment.DURATION_MINUTES);
    
    const result = await this.#pool.query(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE barber_id = $1
      AND status != 'cancelled'
      AND (
        (date_time >= $2 AND date_time < $3)
        OR (date_time + interval '60 minutes' > $2 AND date_time < $2)
      )
    `, [barberId, slotStart.toISOString(), slotEnd.toISOString()]);
    
    return parseInt(result.rows[0].count) === 0;
  }

  async getBookedSlots(barberId, date) {
    const appointments = await this.findByBarberAndDate(barberId, date);
    return appointments.map(apt => apt.dateTime);
  }

  async getHistory(phoneNumber) {
    const result = await this.#pool.query(`
      SELECT * FROM appointment_history 
      WHERE phone_number = $1
      LIMIT 1
    `, [phoneNumber]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
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
    const client = await this.#pool.connect();
    let processedCount = 0;
    
    try {
      // Find expired appointments
      const expiredResult = await client.query(`
        SELECT * FROM appointments 
        WHERE date_time < NOW() AND status != 'cancelled'
      `);
      
      for (const row of expiredResult.rows) {
        // Delete existing history for this phone number
        await client.query(`
          DELETE FROM appointment_history 
          WHERE phone_number = $1
        `, [row.phone_number]);
        
        // Move to history
        await client.query(`
          INSERT INTO appointment_history 
          (id, phone_number, customer_name, barber_id, service_type, date_time, status, created_at, archived_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, NOW())
        `, [
          row.id,
          row.phone_number,
          row.customer_name,
          row.barber_id,
          row.service_type,
          row.date_time,
          row.created_at
        ]);
        
        // Delete from active appointments
        await client.query(`DELETE FROM appointments WHERE id = $1`, [row.id]);
        
        processedCount++;
      }
    } finally {
      client.release();
    }
    
    return processedCount;
  }

  async countAppointmentsByDates(barberId, dates) {
    const counts = new Map();
    
    for (const date of dates) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const result = await this.#pool.query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE barber_id = $1
        AND date_time >= $2
        AND date_time <= $3
        AND status != 'cancelled'
      `, [barberId, startOfDay.toISOString(), endOfDay.toISOString()]);
      
      const count = parseInt(result.rows[0].count);
      const dateKey = date.toISOString().split('T')[0];
      counts.set(dateKey, count);
    }
    
    return counts;
  }

  async getAvailableSlots(barberId, date) {
    const barber = await this.findBarberById(barberId);
    if (!barber) {
      return [];
    }

    const allSlots = barber.generateTimeSlots(date);
    const bookedSlots = await this.getBookedSlots(barberId, date);
    
    const bookedTimes = new Set(bookedSlots.map(d => d.getTime()));
    
    return allSlots.filter(slot => !bookedTimes.has(slot.dateTime.getTime()));
  }

  #rowToAppointment(row) {
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

  async close() {
    await this.#pool.end();
  }
}