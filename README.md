# Big Brother Barber Shop - WhatsApp Appointment System

Sistema de agendamiento de citas vía WhatsApp para barbería, construido con Clean Architecture, DDD y principios SOLID.

## 🏗️ Arquitectura

```
src/
├── domain/                    # Capa de Dominio (Entidades, Value Objects, Puertos)
│   ├── entities/              # Entidades de negocio
│   │   ├── Appointment.js     # Cita
│   │   ├── Barber.js          # Barbero (con PIN hasheado)
│   │   ├── BlockedSlot.js     # Horario bloqueado
│   │   └── ClientNote.js      # Notas de cliente
│   ├── value-objects/         # Objetos de valor inmutables
│   │   ├── AdminCommand.js    # Comando de administración
│   │   └── BarberPin.js       # PIN seguro
│   └── ports/                 # Interfaces/Contratos
│       ├── AppointmentRepository.js
│       ├── BarberRepository.js
│       ├── BlockedSlotRepository.js
│       ├── ClientNoteRepository.js
│       └── MessagingService.js
├── application/               # Capa de Aplicación (Casos de Uso)
│   ├── usecases/              # Casos de uso de clientes
│   │   ├── ScheduleAppointment.js
│   │   ├── CancelAppointment.js
│   │   └── ListAppointments.js
│   ├── usecases/admin/        # Casos de uso administrativos
│   │   ├── AuthenticateBarber.js
│   │   ├── GetTodayAppointments.js
│   │   ├── GetWeekAppointments.js
│   │   ├── CancelAppointmentByBarber.js
│   │   ├── BlockTimeSlot.js
│   │   ├── UnblockTimeSlot.js
│   │   ├── CompleteAppointment.js
│   │   ├── AddClientNote.js
│   │   └── GetBarberStats.js
│   └── services/              # Servicios de aplicación
│       └── AdminPanelHandler.js
└── infrastructure/            # Capa de Infraestructura
    ├── http/                  # Servidor HTTP y Webhooks
    │   ├── HttpServer.js
    │   └── WebhookHandler.js
    ├── messaging/             # Integración WhatsApp
    │   └── WhatsAppService.js
    ├── persistence/           # Base de datos PostgreSQL
    │   └── PostgreSQLAppointmentRepository.js
    └── security/              # Servicios de seguridad
        └── HashService.js     # PBKDF2 para PINs
```

## 🚀 Inicio Rápido

### Requisitos Previos
- Node.js 20+
- PostgreSQL (Supabase recomendado)
- Cuenta de Meta Developer con WhatsApp Business API
- ngrok o túnel similar para desarrollo local

### Configuración

1. **Clonar y configurar:**
```bash
cd Big-Brother-Barber-Shop
cp .env.example .env
# Editar .env con tus credenciales
```

2. **Variables de entorno requeridas:**
```env
DATABASE_URL=postgresql://user:pass@host:5432/db
WHATSAPP_ACCESS_TOKEN=tu_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=tu_verify_token
```

3. **Ejecutar con Docker:**
```bash
docker-compose up -d
```

4. **O ejecutar localmente:**
```bash
npm install
npm start
```

5. **Configurar Webhook en Meta:**
   - URL: `https://tu-dominio.com/webhook`
   - Verify Token: El valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Suscribirse a: `messages`

## 💬 Uso para Clientes

Los clientes interactúan enviando mensajes a tu número de WhatsApp:

| Comando | Acción |
|---------|--------|
| `hola` / `menu` | Ver menú principal |
| `1` / `agendar` | Iniciar agendamiento |
| `2` / `mis citas` | Ver citas programadas |
| `cancelar [ID]` | Cancelar una cita |

### Flujo de Agendamiento
1. Usuario envía "agendar"
2. Sistema solicita nombre
3. Usuario selecciona barbero (lista interactiva)
4. Usuario selecciona servicio
5. Usuario selecciona fecha disponible
6. Usuario selecciona hora disponible
7. Cita confirmada con ID

## 🔐 Panel de Administración para Barberos

### Acceso al Panel

Los barberos acceden mediante un comando secreto:

```
admin <alias> <pin> [acción] [parámetros]
```

**Ejemplo:** `admin carlos 1234 hoy`

### Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `admin carlos 1234` | Ver menú de ayuda |
| `admin carlos 1234 hoy` | Ver citas de hoy |
| `admin carlos 1234 semana` | Ver resumen semanal |
| `admin carlos 1234 cancelar abc123` | Cancelar cita (notifica al cliente) |
| `admin carlos 1234 completar abc123` | Marcar cita como completada |
| `admin carlos 1234 bloquear 14:00` | Bloquear horario (almuerzo, etc.) |
| `admin carlos 1234 desbloquear 14:00` | Desbloquear horario |
| `admin carlos 1234 nota abc123 Prefiere corte bajo` | Agregar nota al cliente |
| `admin carlos 1234 stats` | Ver estadísticas del mes |
| `admin carlos 1234 ayuda` | Ver comandos disponibles |

### Alias de Barberos por Defecto

| Barbero | Alias |
|---------|-------|
| Carlos Mendoza | `carlos` |
| Miguel Ángel | `miguel` |
| David Restrepo | `david` |
| Andrés Martínez | `andres` |
| Juan Pablo | `juan` |

### PIN por Defecto

⚠️ **IMPORTANTE:** El PIN por defecto es `1234`. **Debe cambiarse en producción.**

Para cambiar el PIN de un barbero, actualice directamente en la base de datos usando el HashService para generar el nuevo hash.

## 🔒 Seguridad

### Autenticación
- PINs hasheados con PBKDF2 (100,000 iteraciones)
- Salt aleatorio de 256 bits por PIN
- Comparación timing-safe para prevenir ataques de tiempo

### Validación
- Sanitización estricta de entrada
- Validación de formato de comandos
- Límites de longitud en notas (500 caracteres)
- Escape de caracteres HTML en notas

### Principios Aplicados
- Security-by-design
- Privacy-by-default
- Principio de mínimo privilegio
- Zero Trust (verificación en cada comando)

### Logs
- Sin exposición de PINs o datos sensibles
- Registro de intentos de autenticación (sin credenciales)
- Trazabilidad de acciones administrativas

## 📊 Funcionalidades del Panel Admin

### 1. Ver Citas del Día
- Lista ordenada por hora
- Nombre del cliente, servicio, estado
- ID corto para referencia
- Próxima cita destacada

### 2. Ver Citas de la Semana
- Resumen por día (Lun-Dom)
- Conteo de citas por día
- Indicador de día actual
- Totales de completadas/pendientes

### 3. Cancelar Cita
- Búsqueda por ID parcial
- Notificación automática al cliente
- Validación de permisos (solo sus citas)

### 4. Bloquear Horario
- Bloqueo de 1 hora
- Para almuerzo, descanso, etc.
- Validación de horario laboral

### 5. Estadísticas
- Total de citas del mes
- Servicio más solicitado
- Promedio diario
- Día más ocupado
- Horas pico
- Tasa de completado

### 6. Marcar Completada
- Confirma atención al cliente
- Actualiza estadísticas

### 7. Notas de Cliente
- Guardar preferencias
- Historial por cliente
- Vinculadas a citas

## 🛠️ Desarrollo

```bash
# Modo desarrollo con hot-reload
npm run dev

# Ver logs de Docker
docker-compose logs -f
```

## 📁 Base de Datos

### Tablas

- `barbers` - Barberos con alias y PIN hasheado
- `appointments` - Citas activas
- `appointment_history` - Historial de citas
- `blocked_slots` - Horarios bloqueados
- `client_notes` - Notas de clientes

### Migraciones

Las tablas se crean automáticamente al iniciar la aplicación. Las migraciones de columnas nuevas (alias, pin_hash) se ejecutan de forma segura con `DO $$ ... $$`.

## 🏛️ Principios de Arquitectura

### SOLID
- **S**ingle Responsibility: Cada clase tiene una única responsabilidad
- **O**pen/Closed: Extensible sin modificar código existente
- **L**iskov Substitution: Interfaces intercambiables
- **I**nterface Segregation: Puertos específicos por funcionalidad
- **D**ependency Inversion: Dependencias inyectadas

### Clean Architecture
- Capas independientes
- Dependencias hacia adentro
- Dominio sin dependencias externas

### DDD (Domain-Driven Design)
- Entidades con comportamiento
- Value Objects inmutables
- Repositorios como puertos

## 📝 Licencia

MIT