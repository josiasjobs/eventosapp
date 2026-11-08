/**
 * EventosAPP - Database Layer
 * Local SQLite persistence using native Node.js DatabaseSync (Node.js 22.5+)
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { checkCameraPlan, parsePositiveInt } = require('./public/js/logic.js');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// EVENTOS_DB_PATH lets tests and dev runs use a throwaway database
const dbPath = process.env.EVENTOS_DB_PATH || path.join(dataDir, 'eventos.db');
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
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- Catálogo de planos de câmera
    CREATE TABLE IF NOT EXISTS camera_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sigla TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      camera INTEGER NOT NULL,
      preset INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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

  // Safe migration for existing databases
  try {
    db.prepare('ALTER TABLE items ADD COLUMN completed INTEGER NOT NULL DEFAULT 0').run();
  } catch (e) {
    // Column already exists
  }
  try {
    // Talk number (Discurso): NULL when the part is not a talk; unique per event (checked in server.js)
    db.prepare('ALTER TABLE items ADD COLUMN talk_number INTEGER').run();
  } catch (e) {
    // Column already exists
  }
  // Sentinela: cameras per part (which person each one films), question steps per media
  for (const sql of [
    'ALTER TABLE items ADD COLUMN cam_left INTEGER',
    'ALTER TABLE items ADD COLUMN cam_right INTEGER',
    'ALTER TABLE items ADD COLUMN cam_speaker INTEGER',
    'ALTER TABLE items ADD COLUMN plan_in_id INTEGER REFERENCES camera_plans(id) ON DELETE SET NULL',
    'ALTER TABLE items ADD COLUMN plan_out_id INTEGER REFERENCES camera_plans(id) ON DELETE SET NULL',
    'ALTER TABLE medias ADD COLUMN paragraph INTEGER',
    "ALTER TABLE medias ADD COLUMN side TEXT DEFAULT ''",
    "ALTER TABLE medias ADD COLUMN person TEXT DEFAULT ''",
    "ALTER TABLE medias ADD COLUMN photo TEXT DEFAULT ''"
  ]) {
    try {
      db.prepare(sql).run();
    } catch (e) {
      // Column already exists
    }
  }
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

  // Camera plans catalog
  listCameraPlans() {
    return db.prepare(`
      SELECT p.id, p.sigla, p.name, p.camera, p.preset,
             (SELECT COUNT(*) FROM items i WHERE i.plan_in_id = p.id OR i.plan_out_id = p.id) AS usage
      FROM camera_plans p
      ORDER BY p.sigla COLLATE NOCASE ASC
    `).all();
  },

  getCameraPlan(id) {
    return db.prepare('SELECT * FROM camera_plans WHERE id = ?').get(id);
  },

  getCameraPlanBySigla(sigla) {
    return db.prepare('SELECT * FROM camera_plans WHERE sigla = ? COLLATE NOCASE').get(String(sigla ?? '').trim());
  },

  createCameraPlan({ sigla, name, camera, preset }) {
    const res = db.prepare('INSERT INTO camera_plans (sigla, name, camera, preset) VALUES (?, ?, ?, ?)')
      .run(String(sigla).trim(), String(name).trim(), parsePositiveInt(camera), parsePositiveInt(preset));
    return Number(res.lastInsertRowid);
  },

  updateCameraPlan(id, { sigla, name, camera, preset }) {
    return db.prepare('UPDATE camera_plans SET sigla = ?, name = ?, camera = ?, preset = ? WHERE id = ?')
      .run(String(sigla).trim(), String(name).trim(), parsePositiveInt(camera), parsePositiveInt(preset), id);
  },

  deleteCameraPlan(id) {
    return db.prepare('DELETE FROM camera_plans WHERE id = ?').run(id);
  },

  // Items
  getItemsByShift(shiftId) {
    return db.prepare('SELECT * FROM items WHERE shift_id = ? ORDER BY order_num ASC, id ASC').all(shiftId);
  },

  getItem(id) {
    return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  },

  createItem(shiftId, title, scheduledTime, description, speaker, activityType, orderNum, talkNumber = null, cams = {}, plans = {}) {
    const res = db.prepare(`
      INSERT INTO items (shift_id, title, scheduled_time, description, speaker, activity_type, order_num, talk_number,
                         cam_left, cam_right, cam_speaker, plan_in_id, plan_out_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(shiftId, title, scheduledTime, description || '', speaker || '', activityType || '', orderNum, talkNumber,
      cams.left ?? null, cams.right ?? null, cams.speaker ?? null, plans.inId ?? null, plans.outId ?? null);
    return res.lastInsertRowid;
  },

  updateItem(id, title, scheduledTime, description, speaker, activityType, talkNumber = null, cams = {}, plans = {}) {
    return db.prepare(`
      UPDATE items
      SET title = ?, scheduled_time = ?, description = ?, speaker = ?, activity_type = ?, talk_number = ?,
          cam_left = ?, cam_right = ?, cam_speaker = ?, plan_in_id = ?, plan_out_id = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title, scheduledTime, description || '', speaker || '', activityType || '', talkNumber,
      cams.left ?? null, cams.right ?? null, cams.speaker ?? null, plans.inId ?? null, plans.outId ?? null, id);
  },

  // Another part of the same event (the shift's event) that already uses this talk number
  findItemWithTalkNumber(shiftId, talkNumber, excludeItemId = null) {
    return db.prepare(`
      SELECT i.id, i.title FROM items i
      JOIN shifts s ON s.id = i.shift_id
      JOIN days d ON d.id = s.day_id
      WHERE i.talk_number = ? AND i.id IS NOT ?
        AND d.event_id = (SELECT d2.event_id FROM shifts s2 JOIN days d2 ON d2.id = s2.day_id WHERE s2.id = ?)
    `).get(talkNumber, excludeItemId, shiftId);
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

  toggleItemCompleted(id, completed) {
    return db.prepare(`
      UPDATE items
      SET completed = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(completed ? 1 : 0, id);
  },

  // Medias
  getMediasByItem(itemId) {
    return db.prepare('SELECT * FROM medias WHERE item_id = ? ORDER BY order_num ASC, id ASC').all(itemId);
  },

  getMedia(id) {
    return db.prepare('SELECT * FROM medias WHERE id = ?').get(id);
  },

  createMedia(itemId, title, type, reference, orderNum, step = {}) {
    const res = db.prepare(`
      INSERT INTO medias (item_id, title, type, reference, order_num, completed, paragraph, side, person, photo)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(itemId, title, type, reference || '', orderNum, step.paragraph ?? null, step.side || '', step.person || '', step.photo || '');
    return res.lastInsertRowid;
  },

  // Inserts right after the anchor step (same item) and shifts later steps; unknown anchor appends. One transaction.
  createMediaAfter(itemId, afterId, title, type, reference, step = {}) {
    db.exec('BEGIN TRANSACTION;');
    try {
      const anchor = afterId ? this.getMedia(Number(afterId)) : null;
      const valid = anchor && anchor.item_id === Number(itemId);
      let orderNum;
      if (valid) {
        orderNum = anchor.order_num + 1;
        db.prepare('UPDATE medias SET order_num = order_num + 1 WHERE item_id = ? AND order_num >= ?').run(itemId, orderNum);
      } else {
        orderNum = this.getMediasByItem(itemId).length + 1;
      }
      const id = this.createMedia(itemId, title, type, reference, orderNum, step);
      db.exec('COMMIT;');
      return id;
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  updateMedia(id, title, type, reference, step = {}) {
    return db.prepare(`
      UPDATE medias
      SET title = ?, type = ?, reference = ?, paragraph = ?, side = ?, person = ?, photo = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title, type, reference || '', step.paragraph ?? null, step.side || '', step.person || '', step.photo || '', id);
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

  // Playlist import: replace=true swaps the item's non-question medias for the imported ones
  // (questions stay, renumbered 1..n), otherwise they go after the last media. One transaction, so a failure keeps the old list.
  importMedias(itemId, medias, replace) {
    db.exec('BEGIN TRANSACTION;');
    try {
      if (replace) {
        db.prepare("DELETE FROM medias WHERE item_id = ? AND type != 'question'").run(itemId);
        this.getMediasByItem(itemId).forEach((m, i) => this.updateMediaOrder(m.id, i + 1));
      }
      let orderNum = this.getMediasByItem(itemId).length + 1;
      for (const m of medias) {
        this.createMedia(itemId, m.title, m.type, m.reference, orderNum++);
      }
      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  // Creates one part per playlist (appended after the shift's last part, or replacing them all). One transaction.
  importPlaylistsAsParts(shiftId, playlists, replace, scheduledTime) {
    db.exec('BEGIN TRANSACTION;');
    try {
      if (replace) {
        db.prepare('UPDATE shifts SET current_item_id = NULL WHERE id = ?').run(shiftId);
        db.prepare('DELETE FROM items WHERE shift_id = ?').run(shiftId);
      }
      let itemOrder = db.prepare('SELECT COALESCE(MAX(order_num), 0) AS max FROM items WHERE shift_id = ?').get(shiftId).max + 1;
      let mediasCount = 0;
      playlists.forEach((playlist, index) => {
        const title = (playlist.name || '').trim() || `Playlist ${index + 1}`;
        const itemId = this.createItem(shiftId, title, scheduledTime, '', '', '', itemOrder++);
        let mediaOrder = 1;
        for (const m of playlist.medias) {
          this.createMedia(itemId, m.title, m.type, m.reference, mediaOrder++);
          mediasCount++;
        }
      });
      db.exec('COMMIT;');
      return { partsCount: playlists.length, mediasCount };
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  // Sessions
  createSession(token, role, ipAddress, expiresAt) {
    return db.prepare('INSERT INTO sessions (token, role, ip_address, expires_at) VALUES (?, ?, ?, ?)').run(token, role, ipAddress, expiresAt);
  },

  getSession(token) {
    // expires_at is an ISO string in UTC: compare as dates, not as text against local time
    return db.prepare("SELECT * FROM sessions WHERE token = ? AND datetime(expires_at) > datetime('now')").get(token);
  },

  deleteSession(token) {
    return db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },

  cleanExpiredSessions() {
    return db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run();
  },

  // Ends every session but the given one (used when the PINs change)
  deleteSessionsExcept(token) {
    return db.prepare('DELETE FROM sessions WHERE token IS NOT ?').run(token ?? null);
  },

  // Full tree getter for a shift (items with their medias)
  getFullShiftData(shiftId) {
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
    if (!shift) return null;

    const items = db.prepare('SELECT * FROM items WHERE shift_id = ? ORDER BY order_num ASC, id ASC').all(shiftId);
    const plansById = new Map(this.listCameraPlans().map(p => [p.id, {
      id: p.id, sigla: p.sigla, name: p.name, camera: p.camera, preset: p.preset
    }]));
    for (const item of items) {
      item.plan_in = plansById.get(item.plan_in_id) || null;
      item.plan_out = plansById.get(item.plan_out_id) || null;
      item.medias = db.prepare('SELECT * FROM medias WHERE item_id = ? ORDER BY order_num ASC, id ASC').all(item.id);
    }

    return {
      shift,
      items
    };
  },

  // Full Event Backup & Restore
  getFullEventBackup() {
    const event = this.getActiveEvent();
    if (!event) return null;

    const days = this.getDaysByEvent(event.id);
    const backupData = {
      app: 'EventosAPP',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      event: {
        name: event.name,
        category: event.category || '',
        director_pin_hash: event.director_pin_hash,
        admin_pin_hash: event.admin_pin_hash
      },
      camera_plans: [],
      days: []
    };
    const usedPlans = new Map();
    const planSigla = (planId) => {
      const plan = planId == null ? null : this.getCameraPlan(planId);
      if (!plan) return null;
      usedPlans.set(plan.id, { sigla: plan.sigla, name: plan.name, camera: plan.camera, preset: plan.preset });
      return plan.sigla;
    };

    for (const day of days) {
      const dayObj = {
        date: day.date,
        label: day.label,
        order_num: day.order_num,
        shifts: []
      };

      const shifts = this.getShiftsByDay(day.id);
      for (const shift of shifts) {
        const shiftObj = {
          name: shift.name,
          start_time: shift.start_time || '',
          end_time: shift.end_time || '',
          order_num: shift.order_num,
          items: []
        };

        const items = this.getItemsByShift(shift.id);
        for (const item of items) {
          const itemObj = {
            title: item.title,
            scheduled_time: item.scheduled_time,
            description: item.description || '',
            speaker: item.speaker || '',
            activity_type: item.activity_type || '',
            talk_number: item.talk_number ?? null,
            cam_left: item.cam_left ?? null,
            cam_right: item.cam_right ?? null,
            cam_speaker: item.cam_speaker ?? null,
            plan_in: planSigla(item.plan_in_id),
            plan_out: planSigla(item.plan_out_id),
            order_num: item.order_num,
            completed: item.completed ? 1 : 0,
            medias: []
          };

          const medias = this.getMediasByItem(item.id);
          for (const media of medias) {
            itemObj.medias.push({
              title: media.title,
              type: media.type || 'other',
              reference: media.reference || '',
              order_num: media.order_num,
              completed: media.completed ? 1 : 0,
              paragraph: media.paragraph ?? null,
              side: media.side || '',
              person: media.person || '',
              photo: media.photo || ''
            });
          }

          shiftObj.items.push(itemObj);
        }

        dayObj.shifts.push(shiftObj);
      }

      backupData.days.push(dayObj);
    }

    backupData.camera_plans = [...usedPlans.values()];
    return backupData;
  },

  restoreEventBackup(backupData, keepCurrentPins = false) {
    if (!backupData || !backupData.event || !backupData.event.name) {
      throw new Error('Arquivo de backup inválido: dados do evento não encontrados.');
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      const activeEvent = this.getActiveEvent();
      let directorPinHash = backupData.event.director_pin_hash;
      let adminPinHash = backupData.event.admin_pin_hash;

      if (keepCurrentPins && activeEvent) {
        directorPinHash = activeEvent.director_pin_hash;
        adminPinHash = activeEvent.admin_pin_hash;
      }

      if (!directorPinHash || !adminPinHash) {
        if (activeEvent) {
          directorPinHash = activeEvent.director_pin_hash;
          adminPinHash = activeEvent.admin_pin_hash;
        } else {
          throw new Error('O backup não contém hashes de PIN válidos.');
        }
      }

      // Desativa eventos anteriores
      db.prepare('UPDATE events SET is_active = 0').run();

      // Cria novo evento ativo restaurado
      const eventRes = db.prepare(`
        INSERT INTO events (name, category, is_active, director_pin_hash, admin_pin_hash)
        VALUES (?, ?, 1, ?, ?)
      `).run(
        backupData.event.name.trim(),
        (backupData.event.category || '').trim(),
        directorPinHash,
        adminPinHash
      );
      const newEventId = eventRes.lastInsertRowid;

      // Plans: use the local catalog when the sigla exists, create what is missing, never update
      const backupPlans = Array.isArray(backupData.camera_plans) ? backupData.camera_plans : [];
      for (const plan of backupPlans) {
        if (!plan || checkCameraPlan(plan) !== null) continue;
        if (!this.getCameraPlanBySigla(plan.sigla)) this.createCameraPlan(plan);
      }

      const days = Array.isArray(backupData.days) ? backupData.days : [];
      for (const day of days) {
        const dayRes = db.prepare(`
          INSERT INTO days (event_id, date, label, order_num)
          VALUES (?, ?, ?, ?)
        `).run(newEventId, day.date || '', day.label || '', day.order_num || 1);
        const newDayId = dayRes.lastInsertRowid;

        const shifts = Array.isArray(day.shifts) ? day.shifts : [];
        for (const shift of shifts) {
          const shiftRes = db.prepare(`
            INSERT INTO shifts (day_id, name, start_time, end_time, order_num)
            VALUES (?, ?, ?, ?, ?)
          `).run(newDayId, shift.name || '', shift.start_time || '', shift.end_time || '', shift.order_num || 1);
          const newShiftId = shiftRes.lastInsertRowid;

          const items = Array.isArray(shift.items) ? shift.items : [];
          for (const item of items) {
            const itemRes = db.prepare(`
              INSERT INTO items (shift_id, title, scheduled_time, description, speaker, activity_type, order_num, completed, talk_number,
                                 cam_left, cam_right, cam_speaker, plan_in_id, plan_out_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newShiftId,
              item.title || '',
              item.scheduled_time || '',
              item.description || '',
              item.speaker || '',
              item.activity_type || '',
              item.order_num || 1,
              item.completed ? 1 : 0,
              item.talk_number ?? null,
              item.cam_left ?? null,
              item.cam_right ?? null,
              item.cam_speaker ?? null,
              this.getCameraPlanBySigla(item.plan_in)?.id ?? null,
              this.getCameraPlanBySigla(item.plan_out)?.id ?? null
            );
            const newItemId = itemRes.lastInsertRowid;

            const medias = Array.isArray(item.medias) ? item.medias : [];
            for (const media of medias) {
              db.prepare(`
                INSERT INTO medias (item_id, title, type, reference, order_num, completed, paragraph, side, person, photo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                newItemId,
                media.title || '',
                media.type || 'other',
                media.reference || '',
                media.order_num || 1,
                media.completed ? 1 : 0,
                media.paragraph ?? null,
                media.side || '',
                media.person || '',
                media.photo || ''
              );
            }
          }
        }
      }

      db.exec('COMMIT;');
      return { success: true, eventId: newEventId };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
};

module.exports = {
  db,
  queries
};
