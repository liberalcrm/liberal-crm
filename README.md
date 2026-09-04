# LIBERAL CRM — Red de Venteros Ambulantes

Sistema completo de gestión, georreferenciación, puntos y mensajería para la red de venteros de la marca LIBERAL.

---

## 🚀 Instalación rápida

### 1. Requisitos
- Node.js v18 o superior
- Conexión a internet (para WhatsApp/SMS necesitas cuenta Twilio)

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```
Edita `.env` y completa:
- `JWT_SECRET` — cadena aleatoria larga (mín. 32 caracteres)
- `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` — desde https://console.twilio.com
- `TWILIO_PHONE_FROM` — número Twilio para SMS
- `TWILIO_WHATSAPP_FROM` — número sandbox WhatsApp de Twilio
- `EXPORT_PIN` — PIN para proteger exportaciones CSV

### 4. Iniciar el servidor
```bash
npm start
```

Abre el navegador en **http://localhost:3000**

### Credenciales iniciales
| Usuario | Cédula | Contraseña | Rol |
|---------|--------|-----------|-----|
| Admin | 1000000001 | Liberal2025! | Administrador total |
| Carlos Reyes | 1000000002 | Liberal2025! | Vendedor (Zona Sur) |
| Diana Mora | 1000000003 | Liberal2025! | Vendedora (Zona Norte) |
| Andrés Ríos | 1000000004 | Liberal2025! | Vendedor (Zona Centro) |
| Ana Vélez | 1000000005 | Liberal2025! | Visor (solo lectura) |

> **IMPORTANTE:** Cambia las contraseñas después del primer ingreso.

---

## 📱 Módulos del sistema

### Dashboard
- KPIs en tiempo real: venteros activos, puntos totales, cajetillas/mes, canjes pendientes
- Ranking top venteros por puntos
- Distribución geográfica por zona
- Historial de ventas recientes

### 🗺 Mapa en vivo
- Georreferenciación de todos los venteros (puntos de colores por estado)
- Ubicación en tiempo real de los vendedores internos (rastreo GPS automático)
- Filtro de búsqueda por nombre o zona
- Popups con información completa al hacer clic

### 👥 Venteros
- Registro completo con datos personales, zona, tipo de punto, GPS
- Captura automática de coordenadas GPS desde el dispositivo
- Generación de QR único de check-in por ventero
- Búsqueda y filtro por zona, nombre o cédula
- Acceso directo a WhatsApp del ventero
- Solicitud de canjes directamente desde el perfil

### 📦 Registro de ventas
- Registro de cajetillas vendidas por ventero
- Suma automática de puntos (10 pts por cajetilla)
- Notificación automática por WhatsApp al ventero
- Historial completo de ventas

### 🏆 Premios & Puntos
- Catálogo de premios configurable
- Sistema de puntos: 10 pts/cajetilla, 500 pts por referido
- Canje de premios con descuento automático de puntos y stock
- Notificación al ventero por WhatsApp al confirmar canje

### 📲 WhatsApp / SMS masivo
- Envío de mensajes promocionales a toda la red o por zona
- Personalización con `{{nombre}}` del ventero
- Soporte para WhatsApp y SMS
- Registro de todos los envíos

### 👔 Vendedores internos
- Gestión del equipo de vendedores
- Asignación de zonas
- Estadísticas de rendimiento por vendedor
- Creación de cuentas con envío de credenciales por SMS

### 🔐 Seguridad
- Autenticación JWT con expiración configurable
- Roles: Admin / Vendedor / Visor
- Registro de auditoría de todas las acciones
- Rate limiting en endpoints críticos
- PIN protegido para exportación de datos
- Cambio de contraseña desde la interfaz

### ⬇ Exportación
- CSV completo de venteros con coordenadas GPS
- Protegido por PIN configurable
- Registro en auditoría de cada exportación

---

## 📁 Estructura del proyecto

```
liberal-crm/
├── server.js           # Servidor Express principal
├── db.js               # Base de datos SQLite + schema + semilla
├── .env                # Variables de entorno (NO subir a git)
├── .env.example        # Plantilla de configuración
├── middleware/
│   └── auth.js         # JWT, roles, auditoría
├── routes/
│   └── api.js          # Todos los endpoints REST
├── services/
│   ├── mensajeria.js   # Twilio: WhatsApp + SMS
│   └── qr.js           # Generación de códigos QR
├── public/
│   ├── index.html      # App web (SPA)
│   └── qr/             # QRs generados (auto)
└── data/
    └── liberal.db      # Base de datos SQLite (auto)
```

---

## 🔌 API REST — Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/dashboard` | KPIs y resumen |
| GET | `/api/venteros` | Listar venteros (filtros: zona, estado, q) |
| POST | `/api/venteros` | Registrar nuevo ventero |
| PATCH | `/api/venteros/:id` | Actualizar ventero |
| POST | `/api/checkin` | Check-in con GPS del vendedor |
| POST | `/api/ventas` | Registrar venta + sumar puntos |
| GET | `/api/premios` | Catálogo de premios |
| POST | `/api/canjes` | Solicitar canje de premio |
| POST | `/api/mensajes/masivo` | Envío masivo WhatsApp/SMS |
| GET | `/api/qr/:id` | QR de check-in (base64) |
| GET | `/api/export/venteros?pin=XXX` | Exportar CSV |
| GET | `/api/ubicaciones` | Posiciones de vendedores (admin) |
| POST | `/api/ubicacion` | Actualizar posición del vendedor |

---

## ☁ Despliegue en producción

### Opción 1: VPS (recomendado para Colombia)
```bash
# En servidor Ubuntu/Debian
npm install -g pm2
pm2 start server.js --name liberal-crm
pm2 startup
pm2 save
```

### Opción 2: Railway / Render (gratis para empezar)
1. Sube el proyecto a GitHub
2. Conecta en railway.app o render.com
3. Configura las variables de entorno en el dashboard
4. Deploy automático

### Dominio propio
Configura Nginx como proxy inverso hacia el puerto 3000.
Instala SSL gratuito con Certbot (Let's Encrypt).

---

## 📞 Soporte Twilio para Colombia

1. Crea cuenta en https://twilio.com (prueba gratuita incluye $15 USD)
2. Activa el sandbox de WhatsApp en la consola
3. Los venteros deben enviar el código de activación al número sandbox una vez
4. En producción se requiere aprobación de plantillas de WhatsApp Business

---

## 🔒 Seguridad recomendada para producción

- Cambia `JWT_SECRET` por una cadena aleatoria de 64+ caracteres
- Cambia `EXPORT_PIN` por un PIN de 6 dígitos
- Usa HTTPS obligatorio (SSL)
- Haz backup diario de `data/liberal.db`
- Activa 2FA SMS para el administrador
