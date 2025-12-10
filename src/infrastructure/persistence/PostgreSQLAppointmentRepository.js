import pg from 'pg';
import { Appointment } from '../../domain/entities/Appointment.js';
import { Barber, DEFAULT_BARBERS } from '../../domain/entities/Barber.js';
import { BlockedSlot } from '../../domain/entities/BlockedSlot.js';
import { ClientNote } from '../../domain/entities/ClientNote.js';
import { Client } from '../../domain/entities/Client.js';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository.js';

const { Pool } = pg;

/**
 * PostgreSQL Repository - Infrastructure Layer
 * Implements persistence using Supabase PostgreSQL
 *
 * IMPORTANT: All date operations use Colombia timezone (UTC-5)
 * The database stores timestamps in UTC, but queries and comparisons
 * are done using Colombia time for consistency.
 *
 * Schema:
 * - barbers: Barber information with admin credentials
 * - appointments: Active appointments (one per phone number)
 * - appointment_history: Past appointments
 * - blocked_slots: Blocked time slots for barbers
 * - client_notes: Notes about clients
 * - clients: Client information (auto-registered)
 */
export class PostgreSQLAppointmentRepository extends AppointmentRepository {
  #pool;
  #hashService;

  constructor(connectionString, hashService = null) {
    super();
    this.#pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    this.#hashService = hashService;
  }

  async initialize() {
    await this.#createTables();
    await this.#seedBarbers();
    return this;
  }

  async #createTables() {
    const client = await this.#pool.connect();
    try {
      // Barbers table with admin credentials
      await client.query(`
        CREATE TABLE IF NOT EXISTS barbers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          alias TEXT UNIQUE,
          pin_hash TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          working_hours_start INTEGER NOT NULL DEFAULT 9,
          working_hours_end INTEGER NOT NULL DEFAULT 19,
          slot_duration INTEGER NOT NULL DEFAULT 60
        )
      `);

      // Add alias and pin_hash columns if they don't exist (migration)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='barbers' AND column_name='alias') THEN
            ALTER TABLE barbers ADD COLUMN alias TEXT UNIQUE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='barbers' AND column_name='pin_hash') THEN
            ALTER TABLE barbers ADD COLUMN pin_hash TEXT;
          END IF;
        END $$;
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

      // Blocked slots table
      await client.query(`
        CREATE TABLE IF NOT EXISTS blocked_slots (
          id TEXT PRIMARY KEY,
          barber_id TEXT NOT NULL REFERENCES barbers(id),
          date DATE,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          reason TEXT DEFAULT 'otro',
          is_recurring BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Client notes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS client_notes (
          id TEXT PRIMARY KEY,
          phone_number TEXT NOT NULL,
          barber_id TEXT NOT NULL REFERENCES barbers(id),
          appointment_id TEXT,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Clients table - auto-registered when booking
      await client.query(`
        CREATE TABLE IF NOT EXISTS clients (
          phone_number TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          total_appointments INTEGER NOT NULL DEFAULT 0,
          last_appointment_date TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Indexes
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone_number)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_barber ON appointments(barber_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(date_time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_barber_date ON appointments(barber_id, date_time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_history_phone ON appointment_history(phone_number)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_barbers_alias ON barbers(alias)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_blocked_slots_barber ON blocked_slots(barber_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_blocked_slots_barber_date ON blocked_slots(barber_id, date)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_client_notes_phone ON client_notes(phone_number)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_client_notes_barber ON client_notes(barber_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)`);
    } finally {
      client.release();
    }
  }

  async #seedBarbers() {
    const client = await this.#pool.connect();
    try {
      for (const barberData of DEFAULT_BARBERS) {
        // Generate default PIN hash if hash service is available
        let pinHash = null;
        if (this.#hashService) {
          // Default PIN is "1234" - MUST be changed in production
          pinHash = await this.#hashService.hash('1234');
        }

        await client.query(`
          INSERT INTO barbers (id, name, alias, pin_hash, is_active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (id) DO UPDATE SET
            alias = COALESCE(barbers.alias, EXCLUDED.alias),
            pin_hash = COALESCE(barbers.pin_hash, EXCLUDED.pin_hash)
        `, [barberData.id, barberData.name, barberData.alias, pinHash]);
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

  async findByAlias(alias) {
    if (!alias) return null;
    const result = await this.#pool.query(
      `SELECT * FROM barbers WHERE alias = $1 AND is_active = true`,
      [alias.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToBarber(result.rows[0]);
  }

  async updatePinHash(barberId, pinHash) {
    await this.#pool.query(
      `UPDATE barbers SET pin_hash = $1 WHERE id = $2`,
      [pinHash, barberId]
    );
  }

  async hasPin(barberId) {
    const result = await this.#pool.query(
      `SELECT pin_hash FROM barbers WHERE id = $1`,
      [barberId]
    );
    return result.rows.length > 0 && result.rows[0].pin_hash !== null;
  }

  #rowToBarber(row) {
    return Barber.fromJSON({
      id: row.id,
      name: row.name,
      alias: row.alias,
      pinHash: row.pin_hash,
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
    // Use Colombia timezone for date boundaries
    const colombiaDate = new Date(date.toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
    
    const startOfDay = new Date(colombiaDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(colombiaDate);
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
      // Find expired appointments using Colombia timezone
      // NOW() AT TIME ZONE 'America/Bogota' ensures we compare with Colombia time
      const expiredResult = await client.query(`
        SELECT * FROM appointments
        WHERE date_time < (NOW() AT TIME ZONE 'America/Bogota') AND status != 'cancelled'
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
      // Use Colombia timezone for date boundaries
      const colombiaDate = new Date(date.toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
      
      const startOfDay = new Date(colombiaDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(colombiaDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const result = await this.#pool.query(`
        SELECT COUNT(*) as count FROM appointments
        WHERE barber_id = $1
        AND date_time >= $2
        AND date_time <= $3
        AND status != 'cancelled'
      `, [barberId, startOfDay.toISOString(), endOfDay.toISOString()]);
      
      const count = parseInt(result.rows[0].count);
      
      // Format date key using Colombia timezone
      const year = colombiaDate.getFullYear();
      const month = String(colombiaDate.getMonth() + 1).padStart(2, '0');
      const day = String(colombiaDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
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
    const blockedSlots = await this.findBlockedSlotsByBarberAndDate(barberId, date);
    
    const bookedTimes = new Set(bookedSlots.map(d => d.getTime()));
    
    // Filter out booked and blocked slots
    return allSlots.filter(slot => {
      if (bookedTimes.has(slot.dateTime.getTime())) {
        return false;
      }
      // Check if slot conflicts with any blocked slot
      for (const blocked of blockedSlots) {
        if (blocked.conflictsWith(slot.dateTime)) {
          return false;
        }
      }
      return true;
    });
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

  // ==================== BLOCKED SLOT METHODS ====================

  async saveBlockedSlot(blockedSlot) {
    const data = blockedSlot.toJSON();
    await this.#pool.query(`
      INSERT INTO blocked_slots (id, barber_id, date, start_time, end_time, reason, is_recurring, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        reason = EXCLUDED.reason
    `, [
      data.id,
      data.barberId,
      data.date ? new Date(data.date).toISOString().split('T')[0] : null,
      data.startTime,
      data.endTime,
      data.reason,
      data.isRecurring,
      data.createdAt
    ]);
    return blockedSlot;
  }

  async findBlockedSlotById(id) {
    const result = await this.#pool.query(
      `SELECT * FROM blocked_slots WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToBlockedSlot(result.rows[0]);
  }

  async findBlockedSlotsByBarberId(barberId) {
    const result = await this.#pool.query(
      `SELECT * FROM blocked_slots WHERE barber_id = $1 ORDER BY date, start_time`,
      [barberId]
    );
    return result.rows.map(row => this.#rowToBlockedSlot(row));
  }

  async findBlockedSlotsByBarberAndDate(barberId, date) {
    // Use Colombia timezone for date string
    const colombiaDate = new Date(date.toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
    const year = colombiaDate.getFullYear();
    const month = String(colombiaDate.getMonth() + 1).padStart(2, '0');
    const day = String(colombiaDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const result = await this.#pool.query(`
      SELECT * FROM blocked_slots
      WHERE barber_id = $1
      AND (date = $2 OR is_recurring = true)
      ORDER BY start_time
    `, [barberId, dateStr]);
    return result.rows.map(row => this.#rowToBlockedSlot(row));
  }

  async isTimeBlocked(barberId, dateTime) {
    const blockedSlots = await this.findBlockedSlotsByBarberAndDate(barberId, dateTime);
    return blockedSlots.some(slot => slot.conflictsWith(dateTime));
  }

  async deleteBlockedSlot(id) {
    await this.#pool.query(`DELETE FROM blocked_slots WHERE id = $1`, [id]);
  }

  async deleteBlockedSlotByBarberDateTime(barberId, date, startTime) {
    // Use Colombia timezone for date string
    const colombiaDate = new Date(date.toLocaleString('en-US', { timeZone: Barber.COLOMBIA_TIMEZONE }));
    const year = colombiaDate.getFullYear();
    const month = String(colombiaDate.getMonth() + 1).padStart(2, '0');
    const day = String(colombiaDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const result = await this.#pool.query(`
      DELETE FROM blocked_slots
      WHERE barber_id = $1 AND date = $2 AND start_time = $3
      RETURNING id
    `, [barberId, dateStr, startTime]);
    return result.rowCount > 0;
  }

  #rowToBlockedSlot(row) {
    return BlockedSlot.fromJSON({
      id: row.id,
      barberId: row.barber_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      reason: row.reason,
      isRecurring: row.is_recurring,
      createdAt: row.created_at
    });
  }

  // ==================== CLIENT NOTE METHODS ====================

  async saveClientNote(note) {
    const data = note.toJSON();
    const existing = await this.#pool.query(
      `SELECT id FROM client_notes WHERE id = $1`,
      [data.id]
    );

    if (existing.rows.length > 0) {
      await this.#pool.query(`
        UPDATE client_notes SET
          content = $1,
          updated_at = $2
        WHERE id = $3
      `, [data.content, data.updatedAt, data.id]);
    } else {
      await this.#pool.query(`
        INSERT INTO client_notes (id, phone_number, barber_id, appointment_id, content, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        data.id,
        data.phoneNumber,
        data.barberId,
        data.appointmentId,
        data.content,
        data.createdAt,
        data.updatedAt
      ]);
    }
    return note;
  }

  async findClientNoteById(id) {
    const result = await this.#pool.query(
      `SELECT * FROM client_notes WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToClientNote(result.rows[0]);
  }

  async findClientNotesByPhoneNumber(phoneNumber) {
    const result = await this.#pool.query(
      `SELECT * FROM client_notes WHERE phone_number = $1 ORDER BY created_at DESC`,
      [phoneNumber]
    );
    return result.rows.map(row => this.#rowToClientNote(row));
  }

  async findClientNotesByBarberId(barberId) {
    const result = await this.#pool.query(
      `SELECT * FROM client_notes WHERE barber_id = $1 ORDER BY created_at DESC`,
      [barberId]
    );
    return result.rows.map(row => this.#rowToClientNote(row));
  }

  async findClientNotesByPhoneAndBarber(phoneNumber, barberId) {
    const result = await this.#pool.query(
      `SELECT * FROM client_notes WHERE phone_number = $1 AND barber_id = $2 ORDER BY created_at DESC`,
      [phoneNumber, barberId]
    );
    return result.rows.map(row => this.#rowToClientNote(row));
  }

  async findClientNoteByAppointmentId(appointmentId) {
    const result = await this.#pool.query(
      `SELECT * FROM client_notes WHERE appointment_id = $1`,
      [appointmentId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToClientNote(result.rows[0]);
  }

  async deleteClientNote(id) {
    await this.#pool.query(`DELETE FROM client_notes WHERE id = $1`, [id]);
  }

  async findLatestClientNoteByPhone(phoneNumber) {
    const result = await this.#pool.query(
      `SELECT * FROM client_notes WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1`,
      [phoneNumber]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToClientNote(result.rows[0]);
  }

  #rowToClientNote(row) {
    return ClientNote.fromJSON({
      id: row.id,
      phoneNumber: row.phone_number,
      barberId: row.barber_id,
      appointmentId: row.appointment_id,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  // ==================== CLIENT METHODS ====================

  /**
   * Save or update a client
   * @param {Client} client
   * @returns {Promise<Client>}
   */
  async saveClient(client) {
    const data = client.toJSON();
    await this.#pool.query(`
      INSERT INTO clients (phone_number, name, total_appointments, last_appointment_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (phone_number) DO UPDATE SET
        name = EXCLUDED.name,
        total_appointments = EXCLUDED.total_appointments,
        last_appointment_date = EXCLUDED.last_appointment_date,
        updated_at = EXCLUDED.updated_at
    `, [
      data.phoneNumber,
      data.name,
      data.totalAppointments,
      data.lastAppointmentDate,
      data.createdAt,
      data.updatedAt
    ]);
    return client;
  }

  /**
   * Find a client by phone number
   * @param {string} phoneNumber
   * @returns {Promise<Client|null>}
   */
  async findClientByPhone(phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const result = await this.#pool.query(
      `SELECT * FROM clients WHERE phone_number = $1`,
      [cleanPhone]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.#rowToClient(result.rows[0]);
  }

  /**
   * Find or create a client - used when booking appointments
   * If client exists, updates name and increments appointment count
   * If client doesn't exist, creates new client
   * @param {string} phoneNumber
   * @param {string} name
   * @returns {Promise<Client>}
   */
  async findOrCreateClient(phoneNumber, name) {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Try to find existing client
    let client = await this.findClientByPhone(cleanPhone);
    
    if (client) {
      // Update existing client
      client.updateName(name);
      client.recordAppointment();
      await this.saveClient(client);
      console.log(`[Client] Updated existing client: ${cleanPhone} - ${name}`);
    } else {
      // Create new client
      client = new Client({
        phoneNumber: cleanPhone,
        name,
        totalAppointments: 1,
        lastAppointmentDate: new Date()
      });
      await this.saveClient(client);
      console.log(`[Client] Created new client: ${cleanPhone} - ${name}`);
    }
    
    return client;
  }

  /**
   * Get all clients
   * @returns {Promise<Client[]>}
   */
  async findAllClients() {
    const result = await this.#pool.query(
      `SELECT * FROM clients ORDER BY name ASC`
    );
    return result.rows.map(row => this.#rowToClient(row));
  }

  /**
   * Get total number of clients
   * @returns {Promise<number>}
   */
  async countClients() {
    const result = await this.#pool.query(`SELECT COUNT(*) as count FROM clients`);
    return parseInt(result.rows[0].count);
  }

  /**
   * Delete a client
   * @param {string} phoneNumber
   * @returns {Promise<void>}
   */
  async deleteClient(phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    await this.#pool.query(`DELETE FROM clients WHERE phone_number = $1`, [cleanPhone]);
  }

  #rowToClient(row) {
    return Client.fromJSON({
      phoneNumber: row.phone_number,
      name: row.name,
      totalAppointments: row.total_appointments,
      lastAppointmentDate: row.last_appointment_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  async close() {
    await this.#pool.end();
  }
}