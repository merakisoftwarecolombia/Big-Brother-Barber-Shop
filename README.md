# WhatsApp Appointment Scheduling System

Sistema minimalista de agendamiento de citas vía WhatsApp, construido con Clean Architecture y principios SOLID.

## 🏗️ Arquitectura

```
src/
├── domain/           # Capa de Dominio (Entidades, Puertos)
│   ├── entities/     # Entidades de negocio
│   └── ports/        # Interfaces/Contratos
├── application/      # Capa de Aplicación (Casos de Uso)
│   └── usecases/     # Lógica de negocio
└── infrastructure/   # Capa de Infraestructura
    ├── http/         # Servidor HTTP y Webhooks
    ├── messaging/    # Integración WhatsApp
    └── persistence/  # Base de datos SQLite
```

## 🚀 Inicio Rápido

### Requisitos Previos
- Node.js 20+
- Cuenta de Meta Developer con WhatsApp Business API
- ngrok o túnel similar para desarrollo local

### Configuración

1. **Clonar y configurar:**
```bash
cd whatsapp-appointments
cp .env.example .env
# Editar .env con tus credenciales
```

2. **Obtener credenciales de WhatsApp:**
   - Ir a [Meta Developer Portal](https://developers.facebook.com/)
   - Crear una app de tipo "Business"
   - Agregar el producto "WhatsApp"
   - Copiar `Access Token` y `Phone Number ID`

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

## 💬 Uso

Los usuarios interactúan enviando mensajes a tu número de WhatsApp:

| Comando | Acción |
|---------|--------|
| `hola` / `menu` | Ver menú principal |
| `1` / `agendar` | Iniciar agendamiento |
| `2` / `mis citas` | Ver citas programadas |
| `cancelar [ID]` | Cancelar una cita |

### Flujo de Agendamiento
1. Usuario envía "agendar"
2. Sistema solicita nombre
3. Sistema solicita fecha (DD/MM/YYYY)
4. Sistema solicita hora (HH:MM)
5. Cita confirmada con ID

## 🔒 Seguridad

- Validación estricta de entrada
- Sanitización de datos
- Sin exposición de credenciales
- Principio de mínimo privilegio en Docker
- Health checks configurados

## 📁 Estructura de Archivos

```
whatsapp-appointments/
├── docker-compose.yml    # Orquestación de contenedores
├── Dockerfile            # Imagen de producción
├── package.json          # Dependencias
├── .env.example          # Plantilla de configuración
├── .gitignore            # Archivos ignorados
└── src/
    ├── main.js           # Punto de entrada
    ├── domain/
    │   ├── entities/
    │   │   └── Appointment.js
    │   └── ports/
    │       ├── AppointmentRepository.js
    │       └── MessagingService.js
    ├── application/
    │   └── usecases/
    │       ├── ScheduleAppointment.js
    │       ├── CancelAppointment.js
    │       └── ListAppointments.js
    └── infrastructure/
        ├── http/
        │   ├── HttpServer.js
        │   └── WebhookHandler.js
        ├── messaging/
        │   └── WhatsAppService.js
        └── persistence/
            └── SQLiteAppointmentRepository.js
```

## 🛠️ Desarrollo

```bash
# Modo desarrollo con hot-reload
npm run dev

# Ver logs de Docker
docker-compose logs -f
```

## 📝 Licencia

MIT