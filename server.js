'use strict';
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const app = express();

// ── SEGURIDAD ─────────────────────────────────────────
app.set('trust proxy', 1);app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PATCH','DELETE'] }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting global
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes, intenta en 15 minutos' }
}));

// Rate limiting estricto en login
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login' }
}));

// ── ARCHIVOS ESTÁTICOS ────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API ───────────────────────────────────────────────
app.get('/reset-db', (req, res) => {
  const db = require('./db');
  db.prepare("DELETE FROM usuarios").run();
  db.prepare("DELETE FROM venteros").run();
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('Admin123', 10);
  db.prepare("INSERT INTO usuarios (nombre,cedula,password,rol) VALUES (?,?,?,?)").run('Juan Admin','1000000001',hash,'admin');
  res.json({ok:true, mensaje:'Base de datos reseteada. Usuario: 1000000001 / Admin123'});
});app.use('/api', require('./routes/api'));

// ── CHECK-IN PÚBLICO (escaneo QR en campo) ────────────
app.get('/checkin/:id', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LIBERAL · Check-in</title>
  <style>
    body { font-family: sans-serif; background: #0D0D0D; color: #F5F5F0;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #1A1A1A; border-radius: 16px; padding: 32px; max-width: 360px;
            width: 100%; text-align: center; border: 1px solid #303030; }
    .logo { font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #C8102E; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-bottom: 24px; color: #BBB; font-weight: 400; }
    button { background: #C8102E; color: #fff; border: none; border-radius: 8px;
             padding: 14px 28px; font-size: 16px; cursor: pointer; width: 100%; margin-top: 8px; }
    button:hover { background: #FF3A55; }
    .msg { margin-top: 16px; font-size: 14px; color: #1DB954; min-height: 20px; }
    .err { color: #FF3A55; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">LIBERAL</div>
    <h2>Check-in ventero #${req.params.id}</h2>
    <p style="color:#888;font-size:13px;margin-bottom:20px">Capturando tu ubicación para registrar visita...</p>
    <button onclick="checkin()">📍 Registrar mi ubicación</button>
    <div class="msg" id="msg"></div>
  </div>
  <script>
    async function checkin() {
      const msg = document.getElementById('msg');
      msg.textContent = 'Obteniendo GPS...';
      msg.className = 'msg';
      if (!navigator.geolocation) { msg.textContent = 'GPS no disponible'; msg.className = 'msg err'; return; }
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const token = localStorage.getItem('liberal_token') || '';
          const r = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ ventero_id: ${req.params.id}, lat: pos.coords.latitude, lng: pos.coords.longitude })
          });
          const d = await r.json();
          if (r.ok) { msg.textContent = '✓ Check-in registrado exitosamente'; }
          else { msg.textContent = d.error || 'Error'; msg.className = 'msg err'; }
        } catch(e) { msg.textContent = 'Error de red'; msg.className = 'msg err'; }
      }, () => { msg.textContent = 'Sin acceso al GPS'; msg.className = 'msg err'; });
    }
  </script>
</body>
</html>`);
});

// ── SPA FALLBACK ──────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚬 LIBERAL CRM corriendo en http://localhost:${PORT}`);
  console.log(`   Admin: cédula 1000000001 | clave Liberal2025!\n`);
});
