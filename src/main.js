/**
 * Main Entry Point - Composition Root
 * Wires all dependencies following Dependency Injection pattern
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

import { SQLiteAppointmentRepository } from './infrastructure/persistence/SQLiteAppointmentRepository.js';
import { WhatsAppService } from './infrastructure/messaging/WhatsAppService.js';
import { ScheduleAppointment } from './application/usecases/ScheduleAppointment.js';
import { CancelAppointment } from './application/usecases/CancelAppointment.js';
import { ListAppointments } from './application/usecases/ListAppointments.js';
import { WebhookHandler } from './infrastructure/http/WebhookHandler.js';
import { HttpServer } from './infrastructure/http/HttpServer.js';

// Configuration from environment
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  databasePath: process.env.DATABASE_PATH || './data/appointments.db',
  baseImageUrl: process.env.BASE_IMAGE_URL || ''
};

// Validate required configuration
if (!config.accessToken || !config.phoneNumberId) {
  console.warn('Warning: WhatsApp credentials not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
}

async function main() {
  // Infrastructure Layer - Initialize async repository
  const appointmentRepository = new SQLiteAppointmentRepository(config.databasePath);
  await appointmentRepository.initialize();

  const messagingService = new WhatsAppService({
    accessToken: config.accessToken,
    phoneNumberId: config.phoneNumberId,
    baseImageUrl: config.baseImageUrl
  });

  // Application Layer - Use Cases
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

  // Webhook Handler
  const webhookHandler = new WebhookHandler({
    scheduleAppointment,
    cancelAppointment,
    listAppointments,
    messagingService
  });

  // HTTP Server
  const server = new HttpServer({
    webhookHandler,
    verifyToken: config.verifyToken,
    port: config.port
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down...');
    server.stop();
    appointmentRepository.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  server.start();

  console.log(`
╔════════════════════════════════════════════════════════╗
║     WhatsApp Appointment Scheduling System             ║
╠════════════════════════════════════════════════════════╣
║  Webhook URL: http://localhost:${config.port}/webhook            ║
║  Health:      http://localhost:${config.port}/health             ║
╚════════════════════════════════════════════════════════╝
`);
}

main().catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});