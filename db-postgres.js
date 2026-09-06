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
      email TEXT UNIQUE,
      tel TEXT,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'vendedor',
      zona TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT NOW()::TEXT,
      ultimo_login TEXT,
      lat REAL,
      lng REAL
    );
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
      vendedor_id INTEGER REFERENCES usuarios(id),
      qr_code TEXT,
      observaciones TEXT,
      creado_en TEXT NOT NULL DEFAULT NOW()::TEXT,
