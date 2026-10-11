/**
 * EventosAPP - Database Layer
 * Local SQLite persistence using native Node.js DatabaseSync (Node.js 22.5+)
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'eventos.db');
const db = new DatabaseSync(dbPath);

// Enable Foreign Keys & Write-Ahead Logging (WAL) for high concurrency
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

function initSchema() {
  db.exec(`
    -- Evento (Apenas 1 evento ativo por vez conforme RF-03)
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      director_pin_hash TEXT NOT NULL,
      admin_pin_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- Dias do Evento
    CREATE TABLE IF NOT EXISTS days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      label TEXT NOT NULL,
      order_num INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- Turnos
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_time TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      order_num INTEGER NOT NULL DEFAULT 1,
      current_item_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- Itens da Programação
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      description TEXT DEFAULT '',
      speaker TEXT DEFAULT '',
      activity_type TEXT DEFAULT '',
      order_num INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- Mídias vinculadas ao Item
    CREATE TABLE IF NOT EXISTS medias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      reference TEXT DEFAULT '',
      order_num INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- Sessões de autenticação
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      expires_at TEXT NOT NULL
    );

    -- Índices para consultas rápidas
    CREATE INDEX IF NOT EXISTS idx_days_event ON days(event_id, order_num);
    CREATE INDEX IF NOT EXISTS idx_shifts_day ON shifts(day_id, order_num);
    CREATE INDEX IF NOT EXISTS idx_items_shift ON items(shift_id, order_num);
    CREATE INDEX IF NOT EXISTS idx_medias_item ON medias(item_id, order_num);
  `);
}

initSchema();

// Helper queries & transactions
const queries = {
  // Event
  getActiveEvent() {
    return db.prepare('SELECT * FROM events WHERE is_active = 1 LIMIT 1').get();
  },

  createEvent(name, category, directorPinHash, adminPinHash) {
    // Disable any existing active event (RF-03)
    db.prepare('UPDATE events SET is_active = 0').run();
    const stmt = db.prepare(`
      INSERT INTO events (name, category, is_active, director_pin_hash, admin_pin_hash)
      VALUES (?, ?, 1, ?, ?)
    `);
    const res = stmt.run(name, category, directorPinHash, adminPinHash);
    return res.lastInsertRowid;
  },

  updateEvent(id, name, category) {
    return db.prepare(`
      UPDATE events 
      SET name = ?, category = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(name, category, id);
  },

  updateEventPins(id, directorPinHash, adminPinHash) {
    if (directorPinHash && adminPinHash) {
      return db.prepare('UPDATE events SET director_pin_hash = ?, admin_pin_hash = ? WHERE id = ?').run(directorPinHash, adminPinHash, id);
    } else if (directorPinHash) {
      return db.prepare('UPDATE events SET director_pin_hash = ? WHERE id = ?').run(directorPinHash, id);
    } else if (adminPinHash) {
      return db.prepare('UPDATE events SET admin_pin_hash = ? WHERE id = ?').run(adminPinHash, id);
    }
  },

  // Days
  getDaysByEvent(eventId) {
    return db.prepare('SELECT * FROM days WHERE event_id = ? ORDER BY order_num ASC, id ASC').all(eventId);
  },

  getDay(id) {
    return db.prepare('SELECT * FROM days WHERE id = ?').get(id);
  },

  createDay(eventId, date, label, orderNum) {
    const res = db.prepare('INSERT INTO days (event_id, date, label, order_num) VALUES (?, ?, ?, ?)').run(eventId, date, label, orderNum);
    return res.lastInsertRowid;
  },

  updateDay(id, date, label, orderNum) {
    return db.prepare('UPDATE days SET date = ?, label = ?, order_num = ? WHERE id = ?').run(date, label, orderNum, id);
  },

  deleteDay(id) {
    return db.prepare('DELETE FROM days WHERE id = ?').run(id);
  },

  // Shifts
  getShiftsByDay(dayId) {
    return db.prepare('SELECT * FROM shifts WHERE day_id = ? ORDER BY order_num ASC, id ASC').all(dayId);
  },

  getShift(id) {
    return db.prepare('SELECT * FROM shifts WHERE id = ?').get(id);
  },

  createShift(dayId, name, startTime, endTime, orderNum) {
    const res = db.prepare('INSERT INTO shifts (day_id, name, start_time, end_time, order_num) VALUES (?, ?, ?, ?, ?)').run(dayId, name, startTime, endTime, orderNum);
    return res.lastInsertRowid;
  },

  updateShift(id, name, startTime, endTime, orderNum) {
    return db.prepare('UPDATE shifts SET name = ?, start_time = ?, end_time = ?, order_num = ? WHERE id = ?').run(name, startTime, endTime, orderNum, id);
  },

  deleteShift(id) {
    return db.prepare('DELETE FROM shifts WHERE id = ?').run(id);
  },

  setShiftCurrentItem(shiftId, currentItemId) {
    return db.prepare('UPDATE shifts SET current_item_id = ? WHERE id = ?').run(currentItemId, shiftId);
  },

  // Items
  getItemsByShift(shiftId) {
    return db.prepare('SELECT * FROM items WHERE shift_id = ? ORDER BY order_num ASC, id ASC').all(shiftId);
  },

  getItem(id) {
    return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  },

  createItem(shiftId, title, scheduledTime, description, speaker, activityType, orderNum) {
    const res = db.prepare(`
      INSERT INTO items (shift_id, title, scheduled_time, description, speaker, activity_type, order_num)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(shiftId, title, scheduledTime, description || '', speaker || '', activityType || '', orderNum);
    return res.lastInsertRowid;
  },

  updateItem(id, title, scheduledTime, description, speaker, activityType) {
    return db.prepare(`
      UPDATE items
      SET title = ?, scheduled_time = ?, description = ?, speaker = ?, activity_type = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title, scheduledTime, description || '', speaker || '', activityType || '', id);
  },

  updateItemOrder(id, orderNum) {
    return db.prepare('UPDATE items SET order_num = ? WHERE id = ?').run(orderNum, id);
  },

  deleteItem(id) {
    // If this item was current in its shift, reset current_item_id
    const item = db.prepare('SELECT shift_id FROM items WHERE id = ?').get(id);
    if (item) {
      db.prepare('UPDATE shifts SET current_item_id = NULL WHERE id = ? AND current_item_id = ?').run(item.shift_id, id);
    }
    return db.prepare('DELETE FROM items WHERE id = ?').run(id);
  },

  // Medias
  getMediasByItem(itemId) {
    return db.prepare('SELECT * FROM medias WHERE item_id = ? ORDER BY order_num ASC, id ASC').all(itemId);
  },

  getMedia(id) {
    return db.prepare('SELECT * FROM medias WHERE id = ?').get(id);
  },

  createMedia(itemId, title, type, reference, orderNum) {
    const res = db.prepare(`
      INSERT INTO medias (item_id, title, type, reference, order_num, completed)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(itemId, title, type, reference || '', orderNum);
    return res.lastInsertRowid;
  },

  updateMedia(id, title, type, reference) {
    return db.prepare(`
      UPDATE medias
      SET title = ?, type = ?, reference = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title, type, reference || '', id);
  },

  updateMediaOrder(id, orderNum) {
    return db.prepare('UPDATE medias SET order_num = ? WHERE id = ?').run(orderNum, id);
  },

  toggleMediaCompleted(id, completed) {
    return db.prepare(`
      UPDATE medias
      SET completed = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(completed ? 1 : 0, id);
  },

  deleteMedia(id) {
    return db.prepare('DELETE FROM medias WHERE id = ?').run(id);
  },

  // Sessions
  createSession(token, role, ipAddress, expiresAt) {
    return db.prepare('INSERT INTO sessions (token, role, ip_address, expires_at) VALUES (?, ?, ?, ?)').run(token, role, ipAddress, expiresAt);
  },

  getSession(token) {
    return db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now', 'localtime')").get(token);
  },

  deleteSession(token) {
    return db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },

  cleanExpiredSessions() {
    return db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now', 'localtime')").run();
  },

  // Full tree getter for a shift (items with their medias)
  getFullShiftData(shiftId) {
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
    if (!shift) return null;

    const items = db.prepare('SELECT * FROM items WHERE shift_id = ? ORDER BY order_num ASC, id ASC').all(shiftId);
    for (const item of items) {
      item.medias = db.prepare('SELECT * FROM medias WHERE item_id = ? ORDER BY order_num ASC, id ASC').all(item.id);
    }

    return {
      shift,
      items
    };
  }
};

module.exports = {
  db,
  queries
};
