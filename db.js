'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './data/liberal.db';
const db = new Database(path.resolve(DB_PATH));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cedula TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    tel TEXT,
    password TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'vendedor',
    zona TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ultimo_login TEXT,
    lat REAL,
    lng REAL
  );
  CREATE TABLE IF NOT EXISTS venteros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cedula TEXT UNIQUE NOT NULL,
    tel TEXT NOT NULL,
    whatsapp TEXT,
    zona TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'Ambulante',
    direccion TEXT,
    lat REAL,
    lng REAL,
    puntos INTEGER NOT NULL DEFAULT 0,
    cajetillas INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    vendedor_id INTEGER REFERENCES usuarios(id),
    qr_code TEXT,
    observaciones TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    actualizado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ventero_id INTEGER NOT NULL REFERENCES venteros(id),
    vendedor_id INTEGER REFERENCES usuarios(id),
    cajetillas INTEGER NOT NULL,
    puntos_gen INTEGER NOT NULL DEFAULT 0,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    notas TEXT
  );
  CREATE TABLE IF NOT EXISTS premios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    icono TEXT DEFAULT '🎁',
    puntos_req INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS canjes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ventero_id INTEGER NOT NULL REFERENCES venteros(id),
    premio_id INTEGER NOT NULL REFERENCES premios(id),
    puntos_usados INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    entregado_por INTEGER REFERENCES usuarios(id)
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    accion TEXT NOT NULL,
    detalle TEXT,
    ip TEXT,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

function seed() {
  const adminExiste = db.prepare("SELECT id FROM usuarios WHERE cedula = '1000000001'").get();
  if (adminExiste) return;
  const hash = bcrypt.hashSync('Admin123', 10);
  db.prepare("INSERT INTO usuarios (nombre,cedula,password,rol) VALUES (?,?,?,?)")
    .run('Juan Admin', '1000000001', hash, 'admin');
  console.log('✓ Admin creado');
}

seed();
module.exports = db;
