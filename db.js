'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './data/liberal.db';
const db = new Database(path.resolve(DB_PATH));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    cedula      TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE,
    tel         TEXT,
    password    TEXT NOT NULL,
    rol         TEXT NOT NULL DEFAULT 'vendedor',  -- admin | vendedor | visor
    zona        TEXT,
    activo      INTEGER NOT NULL DEFAULT 1,
    creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ultimo_login TEXT,
    lat         REAL,
    lng         REAL
  );

  CREATE TABLE IF NOT EXISTS venteros (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT NOT NULL,
    cedula       TEXT UNIQUE NOT NULL,
    tel          TEXT NOT NULL,
    whatsapp     TEXT,
    zona         TEXT NOT NULL,
    tipo         TEXT NOT NULL DEFAULT 'Ambulante',
    direccion    TEXT,
    lat          REAL,
    lng          REAL,
    puntos       INTEGER NOT NULL DEFAULT 0,
    cajetillas   INTEGER NOT NULL DEFAULT 0,
    estado       TEXT NOT NULL DEFAULT 'nuevo',   -- activo | nuevo | inactivo
    vendedor_id  INTEGER REFERENCES usuarios(id),
    qr_code      TEXT,
    observaciones TEXT,
    creado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    actualizado  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ventero_id  INTEGER NOT NULL REFERENCES venteros(id),
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    cajetillas  INTEGER NOT NULL DEFAULT 0,
    foto        TEXT,
    fecha       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS ventas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ventero_id  INTEGER NOT NULL REFERENCES venteros(id),
    vendedor_id INTEGER REFERENCES usuarios(id),
    cajetillas  INTEGER NOT NULL,
    puntos_gen  INTEGER NOT NULL DEFAULT 0,
    fecha       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    notas       TEXT
  );

  CREATE TABLE IF NOT EXISTS premios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    icono       TEXT DEFAULT '🎁',
    puntos_req  INTEGER NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0,
    activo      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS canjes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ventero_id  INTEGER NOT NULL REFERENCES venteros(id),
    premio_id   INTEGER NOT NULL REFERENCES premios(id),
    puntos_usados INTEGER NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | entregado | cancelado
    fecha       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    entregado_por INTEGER REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS mensajes_ws (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ventero_id  INTEGER REFERENCES venteros(id),
    zona        TEXT,
    mensaje     TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'promo',   -- promo | premio | info | alerta
    enviados    INTEGER NOT NULL DEFAULT 0,
    fecha       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER REFERENCES usuarios(id),
    accion      TEXT NOT NULL,
    detalle     TEXT,
    ip          TEXT,
    fecha       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    token_hash  TEXT NOT NULL,
    ip          TEXT,
    expira      TEXT NOT NULL,
    creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── DATOS SEMILLA ─────────────────────────────────────────────────────────────
function seed() {
  const adminExiste = db.prepare("SELECT id FROM usuarios WHERE cedula = '1000000001'").get();
  if (adminExiste) return;

  const hash = bcrypt.hashSync('liberal123', 10);

  // Usuarios
  const insertUser = db.prepare(`
    INSERT INTO usuarios (nombre, cedula, email, tel, password, rol, zona)
    VALUES (@nombre, @cedula, @email, @tel, @password, @rol, @zona)
  `);

 
 
  
 

  // Premios
  const insertP = db.prepare(`INSERT INTO premios (nombre,descripcion,icono,puntos_req,stock) VALUES (@nombre,@descripcion,@icono,@puntos_req,@stock)`);
  [
    { nombre:'Minutos de celular',     descripcion:'$20.000 en recargas Claro/Movistar', icono:'📱', puntos_req:500,  stock:200 },
    { nombre:'Camiseta LIBERAL',       descripcion:'Camiseta oficial de la marca',        icono:'👕', puntos_req:800,  stock:50  },
    { nombre:'Morral publicitario',    descripcion:'Morral con logo LIBERAL',             icono:'🎒', puntos_req:1200, stock:30  },
    { nombre:'Gorra edición especial', descripcion:'Gorra bordada LIBERAL',               icono:'🧢', puntos_req:600,  stock:80  },
    { nombre:'Bono Éxito $50.000',     descripcion:'Bono redimible en Éxito/Carulla',    icono:'💳', puntos_req:2500, stock:20  },
    { nombre:'Ventero del mes',        descripcion:'Premio especial + diploma',           icono:'🏆', puntos_req:5000, stock:1   },
  ].forEach(p => insertP.run(p));

  console.log('✓ Base de datos inicializada con datos de muestra');
}

seed();
module.exports = db;
