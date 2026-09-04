'use strict';
const jwt = require('jsonwebtoken');
const db  = require('../db');

function verificarToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = db.prepare('SELECT id,nombre,rol,zona,activo FROM usuarios WHERE id = ?').get(payload.id);
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Sesión inválida' });
    req.usuario = usuario;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token expirado o inválido' });
  }
}

function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

function adminOVendedor(req, res, next) {
  if (!['admin','vendedor'].includes(req.usuario.rol)) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

function audit(accion) {
  return (req, res, next) => {
    const detalle = JSON.stringify({ body: req.body, params: req.params });
    db.prepare('INSERT INTO audit_log (usuario_id,accion,detalle,ip) VALUES (?,?,?,?)').run(
      req.usuario?.id ?? null, accion, detalle, req.ip
    );
    next();
  };
}

module.exports = { verificarToken, soloAdmin, adminOVendedor, audit };
