/**
 * Main Entry Point - Composition Root
 * Wires all dependencies following Dependency Injection pattern
 *
 * Architecture: Clean Architecture with DDD
 * - Domain Layer: Entities, Value Objects, Ports
 * - Application Layer: Use Cases, Services
 * - Infrastructure Layer: Repositories, External Services
 */
import { readFileSync, existsSync } from 'fs';

// Load .env file manually (no external dependency)
function loadEnv() {
  const envPath = './.env';
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// Infrastructure Layer
import { PostgreSQLAppointmentRepository } from './infrastructure/persistence/PostgreSQLAppointmentRepository.js';
import { WhatsAppService } from './infrastructure/messaging/WhatsAppService.js';
import { HashService } from './infrastructure/security/HashService.js';
import { WebhookHandler } from './infrastructure/http/WebhookHandler.js';
import { HttpServer } from './infrastructure/http/HttpServer.js';

// Application Layer - Use Cases
import { ScheduleAppointment } from './application/usecases/ScheduleAppointment.js';
import { CancelAppointment } from './application/usecases/CancelAppointment.js';
import { ListAppointments } from './application/usecases/ListAppointments.js';

// Application Layer - Admin Use Cases
import { AuthenticateBarber } from './application/usecases/admin/AuthenticateBarber.js';
import { GetTodayAppointments } from './application/usecases/admin/GetTodayAppointments.js';
import { GetWeekAppointments } from './application/usecases/admin/GetWeekAppointments.js';
import { CancelAppointmentByBarber } from './application/usecases/admin/CancelAppointmentByBarber.js';
import { BlockTimeSlot } from './application/usecases/admin/BlockTimeSlot.js';
import { UnblockTimeSlot } from './application/usecases/admin/UnblockTimeSlot.js';
import { CompleteAppointment } from './application/usecases/admin/CompleteAppointment.js';
import { AddClientNote } from './application/usecases/admin/AddClientNote.js';
import { GetBarberStats } from './application/usecases/admin/GetBarberStats.js';

// Application Layer - Services
import { AdminPanelHandler } from './application/services/AdminPanelHandler.js';

// Configuration from environment
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  databaseUrl: process.env.DATABASE_URL || '',
  baseImageUrl: process.env.BASE_IMAGE_URL || ''
};

// Validate required configuration
if (!config.accessToken || !config.phoneNumberId) {
  console.warn('Warning: WhatsApp credentials not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
}

if (!config.databaseUrl) {
  console.error('Error: DATABASE_URL is required. Set your Supabase connection string.');
  process.exit(1);
}

async function main() {
  // Infrastructure Layer - Security Service
  const hashService = new HashService();

  // Infrastructure Layer - Initialize PostgreSQL repository with hash service
  console.log('Connecting to database...');
  const appointmentRepository = new PostgreSQLAppointmentRepository(config.databaseUrl, hashService);
  await appointmentRepository.initialize();
  console.log('Database connected successfully');

  const messagingService = new WhatsAppService({
    accessToken: config.accessToken,
    phoneNumberId: config.phoneNumberId,
    baseImageUrl: config.baseImageUrl
  });

  // Application Layer - Customer Use Cases
  const scheduleAppointment = new ScheduleAppointment({
    appointmentRepository,
    messagingService
  });

  const cancelAppointment = new CancelAppointment({
    appointmentRepository,
    messagingService
  });

  const listAppointments = new ListAppointments({
    appointmentRepository
  });

  // Application Layer - Admin Use Cases
  const authenticateBarber = new AuthenticateBarber({
    barberRepository: appointmentRepository, // Repository implements both interfaces
    hashService
  });

  const getTodayAppointments = new GetTodayAppointments({
    appointmentRepository
  });

  const getWeekAppointments = new GetWeekAppointments({
    appointmentRepository
  });

  const cancelAppointmentByBarber = new CancelAppointmentByBarber({
    appointmentRepository,
    messagingService
  });

  const blockTimeSlot = new BlockTimeSlot({
    blockedSlotRepository: appointmentRepository,
    barberRepository: appointmentRepository
  });

  const unblockTimeSlot = new UnblockTimeSlot({
    blockedSlotRepository: appointmentRepository
  });

  const completeAppointment = new CompleteAppointment({
    appointmentRepository
  });

  const addClientNote = new AddClientNote({
    clientNoteRepository: appointmentRepository,
    appointmentRepository
  });

  const getBarberStats = new GetBarberStats({
    appointmentRepository
  });

  // Application Layer - Admin Panel Handler (Facade)
  const adminPanelHandler = new AdminPanelHandler({
    authenticateBarber,
    getTodayAppointments,
    getWeekAppointments,
    cancelAppointmentByBarber,
    blockTimeSlot,
    unblockTimeSlot,
    completeAppointment,
    addClientNote,
    getBarberStats,
    messagingService,
    barberRepository: appointmentRepository,
    appointmentRepository
  });

  // Webhook Handler with Admin Panel
  const webhookHandler = new WebhookHandler({
    scheduleAppointment,
    cancelAppointment,
    listAppointments,
    messagingService,
    appointmentRepository,
    adminPanelHandler
  });

  // HTTP Server
  const server = new HttpServer({
    webhookHandler,
    verifyToken: config.verifyToken,
    port: config.port
  });

  // Background task: Process expired appointments every 5 minutes
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  const cleanupInterval = setInterval(async () => {
    try {
      const processed = await appointmentRepository.processExpiredAppointments();
      if (processed > 0) {
        console.log(`Processed ${processed} expired appointment(s) to history`);
      }
    } catch (error) {
      console.error('Error processing expired appointments:', error.message);
    }
  }, CLEANUP_INTERVAL);

  // Run initial cleanup
  try {
    const processed = await appointmentRepository.processExpiredAppointments();
    if (processed > 0) {
      console.log(`Initial cleanup: processed ${processed} expired appointment(s)`);
    }
  } catch (error) {
    console.error('Error in initial cleanup:', error.message);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    clearInterval(cleanupInterval);
    server.stop();
    await appointmentRepository.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  server.start();

  // Log barbers on startup
  const barbers = await appointmentRepository.findAllBarbers();
  console.log(`Loaded ${barbers.length} barbers: ${barbers.map(b => b.name).join(', ')}`);

  console.log(`
╔════════════════════════════════════════════════════════════╗
║     Big Brother Barber Shop - Appointment System           ║
╠════════════════════════════════════════════════════════════╣
║  Database:    Supabase PostgreSQL                          ║
║  Webhook URL: http://localhost:${config.port}/webhook              ║
║  Health:      http://localhost:${config.port}/health               ║
║  Barbers:     ${barbers.length} active                                 ║
╠════════════════════════════════════════════════════════════╣
║  Admin Panel: Enabled                                      ║
║  Command:     admin <alias> <pin> [action]                 ║
╚════════════════════════════════════════════════════════════╝
`);

  // Log barber aliases for admin reference (without sensitive data)
  console.log('Barber aliases for admin access:');
  for (const barber of barbers) {
    console.log(`  - ${barber.name}: "${barber.alias}"`);
  }
  console.log('\nNote: Default PIN is "1234" - Change in production!\n');
}

main().catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});