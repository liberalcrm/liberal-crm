'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const router   = express.Router();

const db          = require('../db');
const { verificarToken, soloAdmin, adminOVendedor, audit } = require('../middleware/auth');
const { enviarSMS, enviarWhatsApp, envioMasivo }           = require('../services/mensajeria');
const { generarQR, generarQRBase64 }                       = require('../services/qr');

// ──────────────────────────────────────────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────────────────────────────────────────

/** POST /api/auth/login */
router.post('/auth/login', (req, res) => {
  const { cedula, password } = req.body;
  if (!cedula || !password) return res.status(400).json({ error: 'Cédula y contraseña requeridas' });

  const usuario = db.prepare('SELECT * FROM usuarios WHERE cedula = ? AND activo = 1').get(cedula);
  if (!usuario || !bcrypt.compareSync(password, usuario.password))
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  db.prepare("UPDATE usuarios SET ultimo_login = datetime('now','localtime') WHERE id = ?").run(usuario.id);
  db.prepare('INSERT INTO audit_log (usuario_id,accion,ip) VALUES (?,?,?)').run(usuario.id, 'login', req.ip);

  const token = jwt.sign(
    { id: usuario.id, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  res.json({
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, zona: usuario.zona }
  });
});

/** POST /api/auth/logout */
router.post('/auth/logout', verificarToken, (req, res) => {
  db.prepare('INSERT INTO audit_log (usuario_id,accion,ip) VALUES (?,?,?)').run(req.usuario.id, 'logout', req.ip);
  res.json({ ok: true });
});

/** GET /api/auth/me */
router.get('/auth/me', verificarToken, (req, res) => res.json(req.usuario));

// ──────────────────────────────────────────────────────────────────────────────
// VENTEROS
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/venteros  — con filtros opcionales */
router.get('/venteros', verificarToken, (req, res) => {
  const { zona, estado, vendedor_id, q } = req.query;

  let sql = `
    SELECT v.*, u.nombre AS vendedor_nombre
    FROM venteros v
    LEFT JOIN usuarios u ON v.vendedor_id = u.id
    WHERE 1=1
  `;
  const params = [];

  // Los vendedores solo ven sus propios venteros
  if (req.usuario.rol === 'vendedor') {
    sql += ' AND v.vendedor_id = ?'; params.push(req.usuario.id);
  } else {
    if (vendedor_id) { sql += ' AND v.vendedor_id = ?'; params.push(vendedor_id); }
  }
  if (zona)   { sql += ' AND v.zona = ?';    params.push(zona); }
  if (estado) { sql += ' AND v.estado = ?';  params.push(estado); }
  if (q)      { sql += ' AND (v.nombre LIKE ? OR v.cedula LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  sql += ' ORDER BY v.puntos DESC';
  res.json(db.prepare(sql).all(...params));
});

/** GET /api/venteros/:id */
router.get('/venteros/:id', verificarToken, (req, res) => {
  const v = db.prepare(`
    SELECT v.*, u.nombre AS vendedor_nombre
    FROM venteros v LEFT JOIN usuarios u ON v.vendedor_id = u.id
    WHERE v.id = ?
  `).get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Ventero no encontrado' });
  res.json(v);
});

/** POST /api/venteros — crear */
router.post('/venteros', verificarToken, adminOVendedor, audit('crear_ventero'), async (req, res) => {
  const { nombre, cedula, tel, whatsapp, zona, tipo, direccion, lat, lng,
          vendedor_id, cajetillas, observaciones } = req.body;

  if (!nombre || !cedula || !tel || !zona)
    return res.status(400).json({ error: 'nombre, cedula, tel y zona son requeridos' });

  const existente = db.prepare('SELECT id FROM venteros WHERE cedula = ?').get(cedula);
  if (existente) return res.status(409).json({ error: 'Ya existe un ventero con esa cédula' });

  const asignadoA = req.usuario.rol === 'vendedor' ? req.usuario.id : (vendedor_id || null);

  const result = db.prepare(`
    INSERT INTO venteros (nombre,cedula,tel,whatsapp,zona,tipo,direccion,lat,lng,vendedor_id,cajetillas,observaciones)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(nombre, cedula, tel, whatsapp||null, zona, tipo||'Ambulante',
         direccion||null, lat||null, lng||null, asignadoA, cajetillas||0, observaciones||null);

  const id = result.lastInsertRowid;

  // Generar QR
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const qrPath  = await generarQR(id, baseUrl);
    db.prepare('UPDATE venteros SET qr_code = ? WHERE id = ?').run(qrPath, id);
  } catch (e) { console.error('QR error:', e.message); }

  const ventero = db.prepare('SELECT * FROM venteros WHERE id = ?').get(id);

  // Mensaje de bienvenida por WhatsApp (si tiene número)
  if (tel) {
    enviarWhatsApp(whatsapp || tel,
      `¡Hola ${nombre.split(' ')[0]}! 🎉 Ya eres parte de la red LIBERAL. Cada cajetilla vendida suma 10 puntos para ganar premios. Tu código de ventero es #${id}. ¡Mucho éxito!`
    ).catch(e => console.warn('WA bienvenida:', e.message));
  }

  res.status(201).json(ventero);
});

/** PATCH /api/venteros/:id — actualizar */
router.patch('/venteros/:id', verificarToken, adminOVendedor, audit('actualizar_ventero'), (req, res) => {
  const v = db.prepare('SELECT * FROM venteros WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Ventero no encontrado' });

  const campos = ['nombre','tel','whatsapp','zona','tipo','direccion','lat','lng',
                  'vendedor_id','estado','cajetillas','observaciones'];
  const updates = [];
  const vals    = [];

  campos.forEach(c => {
    if (req.body[c] !== undefined) { updates.push(`${c} = ?`); vals.push(req.body[c]); }
  });
  if (!updates.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

  updates.push("actualizado = datetime('now','localtime')");
  vals.push(req.params.id);

  db.prepare(`UPDATE venteros SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM venteros WHERE id = ?').get(req.params.id));
});

/** DELETE /api/venteros/:id — desactivar (soft delete) */
router.delete('/venteros/:id', verificarToken, soloAdmin, audit('desactivar_ventero'), (req, res) => {
  db.prepare("UPDATE venteros SET estado = 'inactivo', actualizado = datetime('now','localtime') WHERE id = ?")
    .run(req.params.id);
  res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// CHECK-IN (geolocalización en campo)
// ──────────────────────────────────────────────────────────────────────────────

/** POST /api/checkin — el vendedor registra presencia + coordenadas del ventero */
router.post('/checkin', verificarToken, adminOVendedor, (req, res) => {
  const { ventero_id, lat, lng, cajetillas } = req.body;
  if (!ventero_id || !lat || !lng) return res.status(400).json({ error: 'ventero_id, lat y lng requeridos' });

  db.prepare('INSERT INTO checkins (ventero_id,lat,lng,cajetillas) VALUES (?,?,?,?)')
    .run(ventero_id, lat, lng, cajetillas || 0);

  // Actualizar coords del ventero
  db.prepare("UPDATE venteros SET lat=?,lng=?,actualizado=datetime('now','localtime') WHERE id=?")
    .run(lat, lng, ventero_id);

  res.json({ ok: true, mensaje: 'Check-in registrado' });
});

/** GET /api/checkins/:ventero_id — historial de ubicaciones */
router.get('/checkins/:ventero_id', verificarToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM checkins WHERE ventero_id = ? ORDER BY fecha DESC LIMIT 50')
    .all(req.params.ventero_id);
  res.json(rows);
});

// ──────────────────────────────────────────────────────────────────────────────
// VENTAS Y PUNTOS
// ──────────────────────────────────────────────────────────────────────────────

/** POST /api/ventas — registrar venta y sumar puntos */
router.post('/ventas', verificarToken, adminOVendedor, (req, res) => {
  const { ventero_id, cajetillas, notas } = req.body;
  if (!ventero_id || !cajetillas || cajetillas < 1)
    return res.status(400).json({ error: 'ventero_id y cajetillas requeridos' });

  const puntos = cajetillas * 10;

  db.prepare('INSERT INTO ventas (ventero_id,vendedor_id,cajetillas,puntos_gen,notas) VALUES (?,?,?,?,?)')
    .run(ventero_id, req.usuario.id, cajetillas, puntos, notas || null);

  db.prepare("UPDATE venteros SET puntos = puntos + ?, cajetillas = cajetillas + ?, actualizado = datetime('now','localtime') WHERE id = ?")
    .run(puntos, cajetillas, ventero_id);

  const ventero = db.prepare('SELECT nombre,puntos,tel,whatsapp FROM venteros WHERE id = ?').get(ventero_id);

  // Notificación WhatsApp al ventero
  const tel = ventero.whatsapp || ventero.tel;
  if (tel) {
    enviarWhatsApp(tel,
      `¡Hola ${ventero.nombre.split(' ')[0]}! 🎉 Registramos ${cajetillas} cajetillas. Ganaste ${puntos} pts. Total acumulado: ${ventero.puntos} pts. ¡Sigue así!`
    ).catch(() => {});
  }

  res.json({ ok: true, puntos_ganados: puntos, total_puntos: ventero.puntos });
});

/** GET /api/ventas — historial */
router.get('/ventas', verificarToken, (req, res) => {
  const { ventero_id, desde, hasta } = req.query;
  let sql = `SELECT ven.*, v.nombre AS ventero_nombre, u.nombre AS vendedor_nombre
             FROM ventas ven
             JOIN venteros v ON ven.ventero_id = v.id
             LEFT JOIN usuarios u ON ven.vendedor_id = u.id
             WHERE 1=1`;
  const p = [];
  if (ventero_id) { sql += ' AND ven.ventero_id = ?'; p.push(ventero_id); }
  if (desde)      { sql += ' AND ven.fecha >= ?';      p.push(desde); }
  if (hasta)      { sql += ' AND ven.fecha <= ?';      p.push(hasta); }
  sql += ' ORDER BY ven.fecha DESC LIMIT 200';
  res.json(db.prepare(sql).all(...p));
});

// ──────────────────────────────────────────────────────────────────────────────
// PREMIOS Y CANJES
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/premios */
router.get('/premios', verificarToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM premios WHERE activo = 1 ORDER BY puntos_req ASC').all());
});

/** POST /api/premios — crear premio (admin) */
router.post('/premios', verificarToken, soloAdmin, (req, res) => {
  const { nombre, descripcion, icono, puntos_req, stock } = req.body;
  if (!nombre || !puntos_req) return res.status(400).json({ error: 'nombre y puntos_req requeridos' });
  const r = db.prepare('INSERT INTO premios (nombre,descripcion,icono,puntos_req,stock) VALUES (?,?,?,?,?)')
    .run(nombre, descripcion||null, icono||'🎁', puntos_req, stock||0);
  res.status(201).json(db.prepare('SELECT * FROM premios WHERE id = ?').get(r.lastInsertRowid));
});

/** POST /api/canjes — solicitar canje */
router.post('/canjes', verificarToken, adminOVendedor, (req, res) => {
  const { ventero_id, premio_id } = req.body;
  if (!ventero_id || !premio_id) return res.status(400).json({ error: 'ventero_id y premio_id requeridos' });

  const premio  = db.prepare('SELECT * FROM premios WHERE id = ? AND activo = 1').get(premio_id);
  const ventero = db.prepare('SELECT * FROM venteros WHERE id = ?').get(ventero_id);

  if (!premio)  return res.status(404).json({ error: 'Premio no encontrado' });
  if (!ventero) return res.status(404).json({ error: 'Ventero no encontrado' });
  if (premio.stock < 1) return res.status(409).json({ error: 'Sin stock disponible' });
  if (ventero.puntos < premio.puntos_req) return res.status(400).json({ error: `Puntos insuficientes. Tiene ${ventero.puntos}, necesita ${premio.puntos_req}` });

  // Descontar puntos y stock
  db.prepare('UPDATE venteros SET puntos = puntos - ? WHERE id = ?').run(premio.puntos_req, ventero_id);
  db.prepare('UPDATE premios SET stock = stock - 1 WHERE id = ?').run(premio_id);
  const r = db.prepare('INSERT INTO canjes (ventero_id,premio_id,puntos_usados,entregado_por) VALUES (?,?,?,?)')
    .run(ventero_id, premio_id, premio.puntos_req, req.usuario.id);

  // Notificar al ventero
  const tel = ventero.whatsapp || ventero.tel;
  if (tel) {
    enviarWhatsApp(tel,
      `🏆 ¡Felicitaciones ${ventero.nombre.split(' ')[0]}! Tu premio "${premio.nombre}" fue solicitado. Un vendedor LIBERAL te lo entregará pronto.`
    ).catch(() => {});
  }

  res.status(201).json({ ok: true, canje_id: r.lastInsertRowid });
});

/** PATCH /api/canjes/:id/entregar */
router.patch('/canjes/:id/entregar', verificarToken, adminOVendedor, (req, res) => {
  db.prepare("UPDATE canjes SET estado = 'entregado', entregado_por = ? WHERE id = ?")
    .run(req.usuario.id, req.params.id);
  res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// MENSAJERÍA MASIVA
// ──────────────────────────────────────────────────────────────────────────────

/** POST /api/mensajes/masivo */
router.post('/mensajes/masivo', verificarToken, adminOVendedor, async (req, res) => {
  const { mensaje, zona, canal = 'whatsapp', ventero_ids } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'mensaje requerido' });

  let sql = 'SELECT id, nombre, tel, whatsapp FROM venteros WHERE estado = \'activo\'';
  const p = [];
  if (zona) { sql += ' AND zona = ?'; p.push(zona); }
  if (ventero_ids?.length) { sql += ` AND id IN (${ventero_ids.map(()=>'?').join(',')})` ; p.push(...ventero_ids); }

  const lista = db.prepare(sql).all(...p);
  if (!lista.length) return res.status(400).json({ error: 'Sin destinatarios' });

  // Guardar registro del envío
  db.prepare('INSERT INTO mensajes_ws (ventero_id,zona,mensaje,tipo,enviados) VALUES (?,?,?,?,?)')
    .run(null, zona||null, mensaje, 'promo', lista.length);

  // Envío en background
  res.json({ ok: true, destinatarios: lista.length, mensaje: 'Envío en progreso...' });
  envioMasivo(lista, mensaje, canal)
    .then(r => console.log(`Mensajes enviados: ${r.filter(x=>x.status!=='error').length}/${lista.length}`))
    .catch(console.error);
});

/** POST /api/mensajes/sms-otp — OTP para 2FA */
router.post('/mensajes/sms-otp', async (req, res) => {
  const { tel } = req.body;
  if (!tel) return res.status(400).json({ error: 'tel requerido' });
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  // En producción guardar OTP en Redis/DB con TTL 5 min
  await enviarSMS(tel, `LIBERAL CRM: Tu código de verificación es ${otp}. Válido 5 minutos.`);
  // Solo en desarrollo devolvemos el OTP
  const resp = { ok: true };
  if (process.env.NODE_ENV !== 'production') resp.dev_otp = otp;
  res.json(resp);
});

// ──────────────────────────────────────────────────────────────────────────────
// QR / CHECK-IN PÚBLICO
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/qr/:ventero_id — obtener QR en base64 */
router.get('/qr/:ventero_id', verificarToken, async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const b64 = await generarQRBase64(req.params.ventero_id, baseUrl);
  res.json({ qr: b64 });
});

// ──────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN CSV
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/export/venteros?pin=XXXX */
router.get('/export/venteros', verificarToken, soloAdmin, (req, res) => {
  if (req.query.pin !== process.env.EXPORT_PIN)
    return res.status(403).json({ error: 'PIN de exportación incorrecto' });

  db.prepare('INSERT INTO audit_log (usuario_id,accion,ip) VALUES (?,?,?)').run(req.usuario.id, 'export_csv', req.ip);

  const venteros = db.prepare(`
    SELECT v.id,v.nombre,v.cedula,v.tel,v.whatsapp,v.zona,v.tipo,v.direccion,
           v.lat,v.lng,v.puntos,v.cajetillas,v.estado,v.creado_en,
           u.nombre AS vendedor
    FROM venteros v LEFT JOIN usuarios u ON v.vendedor_id = u.id
    ORDER BY v.zona, v.nombre
  `).all();

  const cols = ['id','nombre','cedula','tel','whatsapp','zona','tipo','direccion','lat','lng','puntos','cajetillas','estado','creado_en','vendedor'];
  const csv  = [cols.join(','), ...venteros.map(v => cols.map(c => `"${(v[c]??'').toString().replace(/"/g,'""')}"`).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="liberal-venteros-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('\uFEFF' + csv);
});

// ──────────────────────────────────────────────────────────────────────────────
// USUARIOS / VENDEDORES INTERNOS
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/usuarios */
router.get('/usuarios', verificarToken, soloAdmin, (req, res) => {
  res.json(db.prepare('SELECT id,nombre,cedula,email,tel,rol,zona,activo,ultimo_login FROM usuarios ORDER BY rol,nombre').all());
});

/** POST /api/usuarios — crear vendedor/visor */
router.post('/usuarios', verificarToken, soloAdmin, audit('crear_usuario'), async (req, res) => {
  const { nombre, cedula, email, tel, password, rol, zona } = req.body;
  if (!nombre || !cedula || !password) return res.status(400).json({ error: 'nombre, cedula y password requeridos' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO usuarios (nombre,cedula,email,tel,password,rol,zona) VALUES (?,?,?,?,?,?,?)')
    .run(nombre, cedula, email||null, tel||null, hash, rol||'vendedor', zona||null);

  if (tel) {
    enviarSMS(tel, `LIBERAL CRM: Tu cuenta fue creada. Usuario: ${cedula} | Contraseña: ${password}. Cambia tu clave al ingresar.`).catch(()=>{});
  }
  res.status(201).json({ id: r.lastInsertRowid, nombre, rol });
});

/** PATCH /api/usuarios/:id/password */
router.patch('/usuarios/:id/password', verificarToken, (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  if (!esAdmin && req.usuario.id !== Number(req.params.id))
    return res.status(403).json({ error: 'Sin permisos' });
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Mínimo 8 caracteres' });
  db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// DASHBOARD KPIs
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/dashboard */
router.get('/dashboard', verificarToken, (req, res) => {
  const esAdmin    = req.usuario.rol === 'admin';
  const ventFilter = esAdmin ? '' : `WHERE vendedor_id = ${req.usuario.id}`;

  const kpis = {
    total_venteros:  db.prepare(`SELECT COUNT(*) AS n FROM venteros ${ventFilter}`).get().n,
    activos:         db.prepare(`SELECT COUNT(*) AS n FROM venteros ${ventFilter ? ventFilter + " AND estado='activo'" : "WHERE estado='activo'"}`).get().n,
    total_cajetillas: db.prepare(`SELECT COALESCE(SUM(cajetillas),0) AS n FROM venteros ${ventFilter}`).get().n,
    total_puntos:    db.prepare(`SELECT COALESCE(SUM(puntos),0) AS n FROM venteros ${ventFilter}`).get().n,
    zonas:           db.prepare(`SELECT COUNT(DISTINCT zona) AS n FROM venteros ${ventFilter}`).get().n,
    canjes_pendientes: db.prepare("SELECT COUNT(*) AS n FROM canjes WHERE estado = 'pendiente'").get().n,
  };

  const top_venteros = db.prepare(`
    SELECT v.id,v.nombre,v.zona,v.puntos,v.cajetillas,v.estado
    FROM venteros v ${ventFilter} ORDER BY v.puntos DESC LIMIT 10
  `).all();

  const por_zona = db.prepare(`
    SELECT zona, COUNT(*) AS cantidad, SUM(cajetillas) AS cajetillas, SUM(puntos) AS puntos
    FROM venteros ${ventFilter} GROUP BY zona ORDER BY cantidad DESC
  `).all();

  const ventas_recientes = db.prepare(`
    SELECT ven.fecha, ven.cajetillas, ven.puntos_gen, v.nombre AS ventero, u.nombre AS vendedor
    FROM ventas ven
    JOIN venteros v ON ven.ventero_id = v.id
    LEFT JOIN usuarios u ON ven.vendedor_id = u.id
    ORDER BY ven.fecha DESC LIMIT 10
  `).all();

  const audit_log = db.prepare(`
    SELECT al.fecha, al.accion, u.nombre AS usuario, al.ip
    FROM audit_log al LEFT JOIN usuarios u ON al.usuario_id = u.id
    ORDER BY al.fecha DESC LIMIT 20
  `).all();

  res.json({ kpis, top_venteros, por_zona, ventas_recientes, audit_log });
});

// ──────────────────────────────────────────────────────────────────────────────
// UBICACIÓN EN TIEMPO REAL (vendedor reporta su propia posición)
// ──────────────────────────────────────────────────────────────────────────────

/** POST /api/ubicacion — vendedor actualiza su ubicación */
router.post('/ubicacion', verificarToken, adminOVendedor, (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat y lng requeridos' });
  db.prepare('UPDATE usuarios SET lat=?,lng=? WHERE id=?').run(lat, lng, req.usuario.id);
  res.json({ ok: true });
});

/** GET /api/ubicaciones — posiciones de todos los vendedores (admin) */
router.get('/ubicaciones', verificarToken, soloAdmin, (req, res) => {
  res.json(db.prepare("SELECT id,nombre,rol,zona,lat,lng,ultimo_login FROM usuarios WHERE lat IS NOT NULL AND rol IN ('admin','vendedor')").all());
});

module.exports = router;
