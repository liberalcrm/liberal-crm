'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      cedula TEXT UNIQUE NOT NULL,
      email TEXT,
      tel TEXT,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'vendedor',
      zona TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT DEFAULT NOW()::TEXT,
      ultimo_login TEXT,
      lat REAL,
      lng REAL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS venteros (
      id SERIAL PRIMARY KEY,
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
      vendedor_id INTEGER,
      qr_code TEXT,
      observaciones TEXT,
      creado_en TEXT DEFAULT NOW()::TEXT,
      actualizado TEXT DEFAULT NOW()::TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ventas (
      id SERIAL PRIMARY KEY,
      ventero_id INTEGER NOT NULL,
      vendedor_id INTEGER,
      cajetillas INTEGER NOT NULL,
      puntos_gen INTEGER NOT NULL DEFAULT 0,
      fecha TEXT DEFAULT NOW()::TEXT,
      notas TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS premios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      icono TEXT DEFAULT '🎁',
      puntos_req INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS canjes (
      id SERIAL PRIMARY KEY,
      ventero_id INTEGER NOT NULL,
      premio_id INTEGER NOT NULL,
      puntos_usados INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha TEXT DEFAULT NOW()::TEXT,
      entregado_por INTEGER
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER,
      accion TEXT NOT NULL,
      detalle TEXT,
      ip TEXT,
      fecha TEXT DEFAULT NOW()::TEXT
    )
  `);

  const existe = await pool.query(
    "SELECT id FROM usuarios WHERE cedula = '1000000001'"
  );
  if (existe.rows.length === 0) {
    const hash = bcrypt.hashSync('Admin123', 10);
    await pool.query(
      "INSERT INTO usuarios (nombre,cedula,password,rol) VALUES ($1,$2,$3,$4)",
      ['Juan Admin', '1000000001', hash, 'admin']
    );
    console.log('Admin creado en PostgreSQL');
  }
  console.log('Base de datos PostgreSQL lista');
}

init().catch(console.error);
module.exports = pool;
