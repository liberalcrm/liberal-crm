'use strict';

if (process.env.DATABASE_URL) {
  console.log('✓ Usando PostgreSQL (Supabase)');
  module.exports = require('./db-postgres');
} else {
  console.log('✓ Usando SQLite (local)');
  const Database = require('better-sqlite3');
  const path = require('path');
  const bcrypt = require('bcryptjs');
  const DB_PATH = process.env.DB_PATH || './data/liberal.db';
  const db = new Database(path.resolve(DB_PATH));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  module.exports = db;
}
