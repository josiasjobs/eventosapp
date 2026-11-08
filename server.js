/**
 * EventosAPP - Local HTTP & WebSocket Server
 * LAN-ready live event management with SQLite persistence
 */
const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const multer = require('multer');
const upload = multer({ dest: os.tmpdir() });
const fs = require('fs');
const util = require('util');

const { queries } = require('./db');
const { readPlaylists, extractUserDb, INVALID: JWL_INVALID } = require('./jwl-reader');
const { parseTalkNumber, parsePositiveInt, checkCameraPlan, checkQuestionStep, shiftHasSentinela, isValidPhoto } = require('./public/js/logic.js');

// Validates the talk number (Discurso) of a part: { talkNumber } or { status, error }.
// The number is optional, must be a positive integer and is unique across the event.
function checkTalkNumber(raw, shiftId, itemId = null) {
  const talkNumber = parseTalkNumber(raw);
  if (talkNumber === false) {
    return { status: 400, error: 'O número do discurso deve ser um número inteiro maior que zero.' };
  }
  if (talkNumber !== null) {
    const other = queries.findItemWithTalkNumber(shiftId, talkNumber, itemId);
    if (other) return { status: 409, error: `O discurso nº ${talkNumber} já está na parte "${other.title}".` };
  }
  return { talkNumber };
}
// Validates the Sentinela cameras of a part: { cams } or { status, error }.
// A camera absent from the body keeps the item's current value (when editing); '' clears it.
function checkCams(body, item = null) {
  const cams = {};
  for (const [key, field, col] of [['left', 'camLeft', 'cam_left'], ['right', 'camRight', 'cam_right'], ['speaker', 'camSpeaker', 'cam_speaker']]) {
    if (body[field] === undefined) { cams[key] = item ? item[col] ?? null : null; continue; }
    const n = parsePositiveInt(body[field]);
    if (n === false) return { status: 400, error: 'Câmera deve ser um número inteiro maior que zero.' };
    cams[key] = n;
  }
  return { cams };
}

// Validates the camera plans (in/out) of a part: { plans: { inId, outId } } or { status, error }.
// A plan absent from the body keeps the item's current value (when editing); '' or null clears it.
function checkPlans(body, item = null) {
  const plans = {};
  for (const [key, field, col] of [['inId', 'planInId', 'plan_in_id'], ['outId', 'planOutId', 'plan_out_id']]) {
    if (body[field] === undefined) { plans[key] = item ? item[col] ?? null : null; continue; }
    const id = parsePositiveInt(body[field]);
    if (id === false || (id !== null && !queries.getCameraPlan(id))) {
      return { status: 400, error: 'Plano de câmera não encontrado.' };
    }
    plans[key] = id;
  }
  return { plans };
}

// Validates the catalog body and stores camera/preset as integers: { plan } or { status, error }.
function checkPlanBody(body, planId = null) {
  const msg = checkCameraPlan(body);
  if (msg) return { status: 400, error: msg };
  const other = queries.getCameraPlanBySigla(body.sigla);
  if (other && other.id !== planId) {
    return { status: 409, error: `Já existe um plano com a sigla ${String(body.sigla).trim()}.` };
  }
  return { plan: { sigla: body.sigla, name: body.name, camera: parsePositiveInt(body.camera), preset: parsePositiveInt(body.preset) } };
}

// Validates the step fields of a media: { step, title(raw) } or { error }.
// Questions need a Sentinela parent; plain medias keep only the paragraph (side/person stored empty).
function checkStep(mediaType, fields, parentItem) {
  if (mediaType === 'question') {
    if (!parentItem || parentItem.activity_type !== 'sentinela') {
      return { error: 'Perguntas só podem ser adicionadas numa parte Sentinela.' };
    }
    const q = checkQuestionStep(fields);
    if (q.error) return { error: q.error };
    const photo = fields.photo == null ? '' : fields.photo;
    if (!isValidPhoto(photo)) return { error: 'Foto inválida ou grande demais.' };
    q.photo = photo;
    return { step: q, title: (raw) => (raw && String(raw).trim()) || '?' };
  }
  const paragraph = parsePositiveInt(fields.paragraph);
  if (paragraph === false) return { error: 'Informe o parágrafo (número inteiro maior que zero).' };
  return { step: { paragraph, side: '', person: '', photo: '' }, title: (raw) => String(raw).trim() };
}

// True when every id in the list is one of the given rows (items of a shift, medias of an item)
function belongsTo(ids, rows) {
  const own = new Set(rows.map(r => r.id));
  return ids.every(id => own.has(Number(id)));
}

const SENTINELA_NEEDS_TALK = 'A Sentinela precisa do número do discurso.';
const SENTINELA_ONE_PER_SHIFT = 'Este turno já tem uma Sentinela.';
const MEDIA_TYPES = ['bible', 'image', 'video', 'interview', 'theater', 'question', 'other'];

const {
  hashPin,
  comparePin,
  createSession,
  isValidPin,
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  authenticate
} = require('./auth');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Body parsing
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Detect LAN IP
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (localhost) and non-IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// WebSocket broadcast helper
function broadcast(eventType, data = {}) {
  const payload = JSON.stringify({ type: eventType, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// WebSocket Connection Management
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Send initial connection ACK
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    data: { message: 'Conectado ao servidor EventosAPP em tempo real' },
    timestamp: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (e) {
      // Ignore malformed client ping
    }
  });
});

// Periodic ping to keep LAN connections healthy
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
pingInterval.unref();

wss.on('close', () => {
  clearInterval(pingInterval);
});

// ========================
// API ROUTES
// ========================

// 1. LAN & Server Info with QR Code
app.get('/api/lan-info', async (req, res) => {
  try {
    const lanIps = getLanIps();
    const primaryIp = lanIps[0] || 'localhost';
    const lanUrl = `http://${primaryIp}:${PORT}`;
    const qrCodeDataUrl = await QRCode.toDataURL(lanUrl, {
      margin: 1,
      color: {
        dark: '#0e1424',
        light: '#ffffff'
      }
    });

    res.json({
      port: PORT,
      lanIps,
      primaryIp,
      lanUrl,
      localUrl: `http://localhost:${PORT}`,
      qrCode: qrCodeDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar informações de rede LAN' });
  }
});

// 2. Public Status (checks if setup is needed)
app.get('/api/status', (req, res) => {
  const event = queries.getActiveEvent();
  if (!event) {
    return res.json({ needsSetup: true });
  }

  const days = queries.getDaysByEvent(event.id);
  res.json({
    needsSetup: false,
    event: {
      id: event.id,
      name: event.name,
      category: event.category,
      created_at: event.created_at
    },
    daysCount: days.length
  });
});

// 3. First Setup (RF-01)
app.post('/api/setup', async (req, res) => {
  try {
    const existing = queries.getActiveEvent();
    if (existing) {
      return res.status(400).json({ error: 'O sistema já possui um evento ativo configurado.' });
    }

    const { eventName, category, directorPin, adminPin, firstDayLabel, firstDayDate, firstShiftName } = req.body;

    if (!eventName || !eventName.trim()) {
      return res.status(400).json({ error: 'O nome do evento é obrigatório.' });
    }
    if (!isValidPin(directorPin)) {
      return res.status(400).json({ error: 'O PIN do Diretor deve ter 4 dígitos.' });
    }
    if (!isValidPin(adminPin)) {
      return res.status(400).json({ error: 'O PIN de Administrador deve ter 4 dígitos.' });
    }

    const dirHash = await hashPin(directorPin);
    const adminHash = await hashPin(adminPin);

    // Create event
    const eventId = queries.createEvent(eventName.trim(), category ? category.trim() : '', dirHash, adminHash);

    // Create default Day
    const dayLabel = (firstDayLabel && firstDayLabel.trim()) || 'Dia 1';
    const dayDate = firstDayDate || new Date().toISOString().slice(0, 10);
    const dayId = queries.createDay(eventId, dayDate, dayLabel, 1);

    // Create default Shift
    const shiftName = (firstShiftName && firstShiftName.trim()) || 'Geral';
    const shiftId = queries.createShift(dayId, shiftName, '', '', 1);

    // Create default starter items for a smooth immediate experience
    const item1Id = queries.createItem(shiftId, 'Abertura & Boas-vindas', '09:00', 'Momento inicial com recepção e introdução ao tema.', 'Equipe de Abertura', 'Abertura', 1);
    queries.createMedia(item1Id, 'Vídeo de Introdução do Evento', 'video', 'Projetor Principal', 1);
    queries.createMedia(item1Id, 'Abertura Bíblica', 'bible', 'Salmos 100:1-5', 2);

    const item2Id = queries.createItem(shiftId, 'Momento de Louvor & Adoração', '09:20', 'Período congregacional de música e celebração.', 'Banda Oficial', 'Louvor', 2);
    queries.createMedia(item2Id, 'Letras das Músicas (Slides)', 'image', 'Apresentação 01', 1);

    const item3Id = queries.createItem(shiftId, 'Mensagem Principal', '10:00', 'Preleção central do período.', 'Preletor Convidado', 'Palavra', 3);
    queries.createMedia(item3Id, 'Texto Bíblico Base', 'bible', 'João 3:16', 1);
    queries.createMedia(item3Id, 'Vinheta de Transição', 'video', 'Vídeo 02', 2);

    // Set first item as current item
    queries.setShiftCurrentItem(shiftId, item1Id);

    // Create Admin session for the creator
    const ip = req.ip || req.connection.remoteAddress;
    const session = createSession('admin', ip);

    broadcast('EVENT_SETUP_COMPLETED', { eventId, dayId, shiftId });

    res.json({
      success: true,
      token: session.token,
      role: session.role,
      eventId,
      dayId,
      shiftId
    });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Erro ao configurar evento inicial: ' + err.message });
  }
});

// 4. Auth - Login by PIN (RF-02)
app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return res.status(429).json({ error: rate.message, remainingSeconds: rate.remainingSeconds });
  }

  const { pin } = req.body;
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'PIN não fornecido.' });
  }

  const event = queries.getActiveEvent();
  if (!event) {
    return res.status(400).json({ error: 'Nenhum evento ativo cadastrado. Execute o setup inicial.' });
  }

  // Check Admin PIN first
  const isAdmin = await comparePin(pin, event.admin_pin_hash);
  if (isAdmin) {
    clearFailedAttempts(ip);
    const session = createSession('admin', ip);
    return res.json({ token: session.token, role: 'admin', eventName: event.name });
  }

  // Check Director PIN
  const isDirector = await comparePin(pin, event.director_pin_hash);
  if (isDirector) {
    clearFailedAttempts(ip);
    const session = createSession('director', ip);
    return res.json({ token: session.token, role: 'director', eventName: event.name });
  }

  // Failed attempt
  recordFailedAttempt(ip);
  return res.status(401).json({ error: 'PIN incorreto. Verifique o número digitado e tente novamente.' });
});

// 5. Auth - Verify Session
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-session-token'];

  if (!token) return res.status(401).json({ valid: false });

  const session = queries.getSession(token);
  if (!session) return res.status(401).json({ valid: false });

  const event = queries.getActiveEvent();
  res.json({
    valid: true,
    role: session.role,
    eventName: event ? event.name : ''
  });
});

// 6. Auth - Upgrade to Admin PIN (when switching from Director to Edit mode)
app.post('/api/auth/upgrade', authenticate(), async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return res.status(429).json({ error: rate.message, remainingSeconds: rate.remainingSeconds });
  }

  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ error: 'PIN de Administrador não fornecido.' });
  }

  const event = queries.getActiveEvent();
  if (!event) return res.status(400).json({ error: 'Nenhum evento ativo.' });

  const isAdmin = await comparePin(pin, event.admin_pin_hash);
  if (!isAdmin) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'PIN de Administrador incorreto.' });
  }

  clearFailedAttempts(ip);
  // Invalidate old session and generate new admin session
  queries.deleteSession(req.user.token);
  const session = createSession('admin', ip);
  res.json({ token: session.token, role: 'admin' });
});

// 7. Auth - Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-session-token'];
  if (token) queries.deleteSession(token);
  res.json({ success: true });
});

// 8. Event Data Hierarchy (Authenticated as Director or Admin)
app.get('/api/events/active', authenticate(), (req, res) => {
  const event = queries.getActiveEvent();
  if (!event) return res.status(404).json({ error: 'Nenhum evento ativo' });

  const days = queries.getDaysByEvent(event.id);
  const daysWithShifts = days.map(day => {
    const shifts = queries.getShiftsByDay(day.id);
    return { ...day, shifts };
  });

  res.json({
    event: {
      id: event.id,
      name: event.name,
      category: event.category,
      created_at: event.created_at
    },
    days: daysWithShifts
  });
});

// 9. Update Event Information (Admin only)
app.put('/api/events/:id', authenticate('admin'), (req, res) => {
  const { name, category } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'O nome do evento não pode ser vazio.' });
  }
  queries.updateEvent(req.params.id, name.trim(), typeof category === 'string' ? category.trim() : '');
  broadcast('EVENT_UPDATED', { eventId: req.params.id, name: name.trim() });
  res.json({ success: true });
});

// 10. Update PINs (Admin only)
app.put('/api/events/:id/pins', authenticate('admin'), async (req, res) => {
  try {
    const { directorPin, adminPin } = req.body;
    let dirHash = null;
    let admHash = null;

    if (directorPin) {
      if (!isValidPin(directorPin)) return res.status(400).json({ error: 'O PIN do Diretor deve ter 4 dígitos.' });
      dirHash = await hashPin(directorPin);
    }
    if (adminPin) {
      if (!isValidPin(adminPin)) return res.status(400).json({ error: 'O PIN de Administrador deve ter 4 dígitos.' });
      admHash = await hashPin(adminPin);
    }

    queries.updateEventPins(req.params.id, dirHash, admHash);
    // Whoever logged in with an old PIN must log in again; the admin who changed it stays
    if (dirHash || admHash) queries.deleteSessionsExcept(req.user.token);
    res.json({ success: true, message: 'PINs atualizados com sucesso.' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar PINs: ' + e.message });
  }
});

// Backup & Restore Endpoints (Admin only)
app.get('/api/backup/export', authenticate('admin'), (req, res) => {
  try {
    const backup = queries.getFullEventBackup();
    if (!backup) {
      return res.status(404).json({ error: 'Nenhum evento ativo encontrado para exportar.' });
    }

    const safeName = (backup.event.name || 'evento')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 30);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `eventosapp-backup-${safeName}-${dateStr}.json`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar backup: ' + err.message });
  }
});

app.post('/api/backup/restore', authenticate('admin'), (req, res) => {
  try {
    const { backupData, keepPins } = req.body;
    if (!backupData || !backupData.event) {
      return res.status(400).json({ error: 'Dados do backup inválidos ou não informados.' });
    }
    if (!Array.isArray(backupData.days) || backupData.days.length === 0) {
      return res.status(400).json({ error: 'O backup não tem nenhum dia cadastrado.' });
    }

    const result = queries.restoreEventBackup(backupData, keepPins !== false);

    // Notify all connected clients to reload hierarchy and current shift
    broadcast('EVENT_UPDATED', { eventId: result.eventId });
    broadcast('EVENT_SETUP_COMPLETED', { eventId: result.eventId });
    broadcast('CAMERA_PLANS_UPDATED');

    res.json({ success: true, message: 'Evento e dados restaurados com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao restaurar backup: ' + err.message });
  }
});

// 11. Days Management (Admin only)
app.post('/api/days', authenticate('admin'), (req, res) => {
  const { eventId, date, label } = req.body;
  if (typeof label !== 'string' || !label.trim() || !date) return res.status(400).json({ error: 'Data e Rótulo são obrigatórios.' });
  const event = queries.getActiveEvent();
  if (!event || Number(eventId) !== Number(event.id)) return res.status(404).json({ error: 'Evento não encontrado' });

  const currentDays = queries.getDaysByEvent(eventId);
  const nextOrder = currentDays.length + 1;
  const dayId = queries.createDay(eventId, date, label.trim(), nextOrder);

  // Automatically create a default shift for this day so it is immediately usable
  const shiftId = queries.createShift(dayId, 'Turno Geral', '', '', 1);

  broadcast('EVENT_UPDATED', { eventId });
  res.json({ success: true, dayId, shiftId });
});

app.put('/api/days/:id', authenticate('admin'), (req, res) => {
  const { date, label, orderNum } = req.body;
  const day = queries.getDay(req.params.id);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado' });

  queries.updateDay(day.id, date || day.date, label || day.label, orderNum || day.order_num);
  broadcast('EVENT_UPDATED', { eventId: day.event_id });
  res.json({ success: true });
});

app.delete('/api/days/:id', authenticate('admin'), (req, res) => {
  const day = queries.getDay(req.params.id);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado' });

  // Ensure we don't delete the only day
  const allDays = queries.getDaysByEvent(day.event_id);
  if (allDays.length <= 1) {
    return res.status(400).json({ error: 'O evento precisa ter pelo menos um dia cadastrado.' });
  }

  queries.deleteDay(day.id);
  broadcast('EVENT_UPDATED', { eventId: day.event_id });
  res.json({ success: true });
});

// 12. Shifts Management (Admin only)
app.post('/api/shifts', authenticate('admin'), (req, res) => {
  const { dayId, name, startTime, endTime } = req.body;
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Nome do turno é obrigatório.' });
  const day = queries.getDay(dayId);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado' });

  const currentShifts = queries.getShiftsByDay(dayId);
  const nextOrder = currentShifts.length + 1;
  const shiftId = queries.createShift(dayId, name.trim(), startTime || '', endTime || '', nextOrder);

  broadcast('EVENT_UPDATED', { eventId: day.event_id });
  res.json({ success: true, shiftId });
});

app.put('/api/shifts/:id', authenticate('admin'), (req, res) => {
  const { name, startTime, endTime, orderNum } = req.body;
  const shift = queries.getShift(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Turno não encontrado' });

  queries.updateShift(shift.id, name || shift.name, startTime ?? shift.start_time, endTime ?? shift.end_time, orderNum || shift.order_num);
  const day = queries.getDay(shift.day_id);
  broadcast('EVENT_UPDATED', { eventId: day ? day.event_id : null });
  res.json({ success: true });
});

app.delete('/api/shifts/:id', authenticate('admin'), (req, res) => {
  const shift = queries.getShift(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Turno não encontrado' });

  const allShifts = queries.getShiftsByDay(shift.day_id);
  if (allShifts.length <= 1) {
    return res.status(400).json({ error: 'Cada dia precisa ter pelo menos um turno cadastrado.' });
  }

  queries.deleteShift(shift.id);
  const day = queries.getDay(shift.day_id);
  broadcast('EVENT_UPDATED', { eventId: day ? day.event_id : null });
  res.json({ success: true });
});

// 13. Full Shift Data (Items + Medias)
app.get('/api/shifts/:id/full', authenticate(), (req, res) => {
  const data = queries.getFullShiftData(req.params.id);
  if (!data) return res.status(404).json({ error: 'Turno não encontrado' });
  res.json(data);
});

// 14. Current Item Controller (Director or Admin) - RF-05
app.post('/api/shifts/:id/current-item', authenticate(), (req, res) => {
  const { currentItemId } = req.body; // can be number or null
  const shift = queries.getShift(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Turno não encontrado' });

  let item = null;
  if (currentItemId) {
    item = queries.getItem(currentItemId);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (item.shift_id !== shift.id) return res.status(400).json({ error: 'Este item não pertence ao turno.' });
  }

  queries.setShiftCurrentItem(shift.id, currentItemId ? Number(currentItemId) : null);

  broadcast('CURRENT_ITEM_CHANGED', {
    shiftId: shift.id,
    currentItemId: currentItemId ? Number(currentItemId) : null,
    item
  });

  res.json({ success: true, shiftId: shift.id, currentItemId });
});

// Camera plans catalog (Admin writes, any session reads)
app.get('/api/camera-plans', authenticate(), (req, res) => {
  res.json(queries.listCameraPlans());
});

app.post('/api/camera-plans', authenticate('admin'), (req, res) => {
  const check = checkPlanBody(req.body || {});
  if (check.error) return res.status(check.status).json({ error: check.error });
  const id = queries.createCameraPlan(check.plan);
  broadcast('CAMERA_PLANS_UPDATED');
  res.json({ success: true, id });
});

app.put('/api/camera-plans/:id', authenticate('admin'), (req, res) => {
  const existing = queries.getCameraPlan(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Plano não encontrado.' });
  const check = checkPlanBody(req.body || {}, existing.id);
  if (check.error) return res.status(check.status).json({ error: check.error });
  queries.updateCameraPlan(existing.id, check.plan);
  broadcast('CAMERA_PLANS_UPDATED');
  res.json({ success: true });
});

app.delete('/api/camera-plans/:id', authenticate('admin'), (req, res) => {
  const existing = queries.getCameraPlan(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Plano não encontrado.' });
  queries.deleteCameraPlan(existing.id);
  broadcast('CAMERA_PLANS_UPDATED');
  res.json({ success: true });
});

// 15. Items CRUD & Reordering (Admin only) - RF-06
app.post('/api/items', authenticate('admin'), (req, res) => {
  const { shiftId, title, scheduledTime, description, speaker, activityType } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título do item é obrigatório.' });
  if (!scheduledTime) return res.status(400).json({ error: 'Horário previsto é obrigatório.' });
  const talk = checkTalkNumber(req.body.talkNumber, shiftId);
  if (talk.error) return res.status(talk.status).json({ error: talk.error });
  const camsCheck = checkCams(req.body);
  if (camsCheck.error) return res.status(camsCheck.status).json({ error: camsCheck.error });
  const plansCheck = checkPlans(req.body);
  if (plansCheck.error) return res.status(plansCheck.status).json({ error: plansCheck.error });
  if ((activityType ? activityType.trim() : '') === 'sentinela' && talk.talkNumber === null) {
    return res.status(400).json({ error: SENTINELA_NEEDS_TALK });
  }

  const currentItems = queries.getItemsByShift(shiftId);
  if ((activityType ? activityType.trim() : '') === 'sentinela' && shiftHasSentinela(currentItems)) {
    return res.status(409).json({ error: SENTINELA_ONE_PER_SHIFT });
  }
  const nextOrder = currentItems.length + 1;

  const itemId = queries.createItem(
    shiftId,
    title.trim(),
    scheduledTime.trim(),
    description ? description.trim() : '',
    speaker ? speaker.trim() : '',
    activityType ? activityType.trim() : '',
    nextOrder,
    talk.talkNumber,
    camsCheck.cams,
    plansCheck.plans
  );

  // If shift had no current item, automatically set this first item
  const shift = queries.getShift(shiftId);
  if (shift && !shift.current_item_id) {
    queries.setShiftCurrentItem(shiftId, itemId);
  }

  broadcast('PROGRAM_UPDATED', { shiftId });
  res.json({ success: true, itemId });
});

app.put('/api/items/reorder', authenticate('admin'), (req, res) => {
  const { shiftId, orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds deve ser um array de IDs.' });
  if (!queries.getShift(shiftId)) return res.status(404).json({ error: 'Turno não encontrado' });
  if (!belongsTo(orderedIds, queries.getItemsByShift(shiftId))) {
    return res.status(400).json({ error: 'A lista tem partes que não são deste turno.' });
  }

  orderedIds.forEach((id, index) => {
    queries.updateItemOrder(id, index + 1);
  });

  broadcast('PROGRAM_UPDATED', { shiftId });
  res.json({ success: true });
});

app.put('/api/items/:id', authenticate('admin'), (req, res) => {
  const { title, scheduledTime, description, speaker, activityType } = req.body;
  const item = queries.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });
  // talkNumber absent keeps the current one; '' or null clears it
  const talk = req.body.talkNumber !== undefined
    ? checkTalkNumber(req.body.talkNumber, item.shift_id, item.id)
    : { talkNumber: item.talk_number };
  if (talk.error) return res.status(talk.status).json({ error: talk.error });
  const camsCheck = checkCams(req.body, item);
  if (camsCheck.error) return res.status(camsCheck.status).json({ error: camsCheck.error });
  const plansCheck = checkPlans(req.body, item);
  if (plansCheck.error) return res.status(plansCheck.status).json({ error: plansCheck.error });
  const effectiveType = activityType !== undefined ? activityType.trim() : item.activity_type;
  if (effectiveType === 'sentinela' && talk.talkNumber === null) {
    return res.status(400).json({ error: SENTINELA_NEEDS_TALK });
  }
  if (effectiveType === 'sentinela' && shiftHasSentinela(queries.getItemsByShift(item.shift_id), item.id)) {
    return res.status(409).json({ error: SENTINELA_ONE_PER_SHIFT });
  }

  queries.updateItem(
    item.id,
    title ? title.trim() : item.title,
    scheduledTime ? scheduledTime.trim() : item.scheduled_time,
    description !== undefined ? description.trim() : item.description,
    speaker !== undefined ? speaker.trim() : item.speaker,
    effectiveType,
    talk.talkNumber,
    camsCheck.cams,
    plansCheck.plans
  );

  broadcast('PROGRAM_UPDATED', { shiftId: item.shift_id });
  res.json({ success: true });
});

app.delete('/api/items/:id', authenticate('admin'), (req, res) => {
  const item = queries.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  queries.deleteItem(item.id);

  // Re-sequence remaining items
  const remaining = queries.getItemsByShift(item.shift_id);
  remaining.forEach((remItem, idx) => {
    queries.updateItemOrder(remItem.id, idx + 1);
  });

  broadcast('PROGRAM_UPDATED', { shiftId: item.shift_id });
  res.json({ success: true });
});

// Toggle Item Progress (Allowed by Director or Admin)
app.post('/api/items/:id/toggle', authenticate(), (req, res) => {
  const item = queries.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const newStatus = item.completed ? 0 : 1;
  queries.toggleItemCompleted(item.id, newStatus);

  broadcast('ITEM_TOGGLED', {
    itemId: item.id,
    shiftId: item.shift_id,
    completed: Boolean(newStatus)
  });

  res.json({ success: true, itemId: item.id, completed: Boolean(newStatus) });
});

// 16. Medias CRUD, Reordering, and Progress Toggle - RF-07, RF-08
app.post('/api/medias', authenticate('admin'), (req, res) => {
  const { itemId, title, type, reference } = req.body;
  const mediaType = MEDIA_TYPES.includes(type) ? type : 'other';
  if (mediaType !== 'question' && (!title || !title.trim())) return res.status(400).json({ error: 'Título da mídia é obrigatório.' });

  const parentItem = queries.getItem(itemId);
  if (!parentItem) return res.status(404).json({ error: 'Item não encontrado' });
  const stepCheck = checkStep(mediaType, req.body, parentItem);
  if (stepCheck.error) return res.status(400).json({ error: stepCheck.error });

  const currentMedias = queries.getMediasByItem(itemId);
  const nextOrder = currentMedias.length + 1;

  const afterId = Number(req.body.afterId);
  const mediaId = Number.isInteger(afterId) && afterId > 0
    ? queries.createMediaAfter(itemId, afterId, stepCheck.title(title), mediaType, reference ? reference.trim() : '', stepCheck.step)
    : queries.createMedia(itemId, stepCheck.title(title), mediaType, reference ? reference.trim() : '', nextOrder, stepCheck.step);

  broadcast('PROGRAM_UPDATED', { shiftId: parentItem.shift_id, itemId });
  res.json({ success: true, mediaId });
});

app.put('/api/medias/reorder', authenticate('admin'), (req, res) => {
  const { itemId, orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds deve ser um array de IDs.' });
  if (!queries.getItem(itemId)) return res.status(404).json({ error: 'Item não encontrado' });
  if (!belongsTo(orderedIds, queries.getMediasByItem(itemId))) {
    return res.status(400).json({ error: 'A lista tem mídias que não são desta parte.' });
  }

  orderedIds.forEach((id, index) => {
    queries.updateMediaOrder(id, index + 1);
  });

  const item = queries.getItem(itemId);
  broadcast('PROGRAM_UPDATED', { shiftId: item ? item.shift_id : null, itemId });
  res.json({ success: true });
});

app.put('/api/medias/:id', authenticate('admin'), (req, res) => {
  const { title, type, reference } = req.body;
  const media = queries.getMedia(req.params.id);
  if (!media) return res.status(404).json({ error: 'Mídia não encontrada' });

  const mediaType = MEDIA_TYPES.includes(type) ? type : media.type;
  const item = queries.getItem(media.item_id);
  // absent paragraph/side/person keep the current values
  const merged = {
    paragraph: req.body.paragraph !== undefined ? req.body.paragraph : media.paragraph,
    side: req.body.side !== undefined ? req.body.side : media.side,
    person: req.body.person !== undefined ? req.body.person : media.person,
    photo: req.body.photo !== undefined ? req.body.photo : media.photo
  };
  const stepCheck = checkStep(mediaType, merged, item);
  if (stepCheck.error) return res.status(400).json({ error: stepCheck.error });

  queries.updateMedia(
    media.id,
    title && title.trim() ? title.trim() : (mediaType === 'question' && !media.title ? '?' : media.title),
    mediaType,
    reference !== undefined ? reference.trim() : media.reference,
    stepCheck.step
  );

  broadcast('PROGRAM_UPDATED', { shiftId: item ? item.shift_id : null, itemId: media.item_id });
  res.json({ success: true });
});

// Toggle Media Progress (Allowed by Director or Admin! - RF-08)
app.post('/api/medias/:id/toggle', authenticate(), (req, res) => {
  const media = queries.getMedia(req.params.id);
  if (!media) return res.status(404).json({ error: 'Mídia não encontrada' });

  const newStatus = media.completed ? 0 : 1;
  queries.toggleMediaCompleted(media.id, newStatus);

  const item = queries.getItem(media.item_id);

  broadcast('MEDIA_TOGGLED', {
    mediaId: media.id,
    itemId: media.item_id,
    shiftId: item ? item.shift_id : null,
    completed: Boolean(newStatus)
  });

  res.json({ success: true, mediaId: media.id, completed: Boolean(newStatus) });
});

app.delete('/api/medias/:id', authenticate('admin'), (req, res) => {
  const media = queries.getMedia(req.params.id);
  if (!media) return res.status(404).json({ error: 'Mídia não encontrada' });

  queries.deleteMedia(media.id);

  // Re-sequence
  const remaining = queries.getMediasByItem(media.item_id);
  remaining.forEach((remMedia, idx) => {
    queries.updateMediaOrder(remMedia.id, idx + 1);
  });

  const item = queries.getItem(media.item_id);
  broadcast('PROGRAM_UPDATED', { shiftId: item ? item.shift_id : null, itemId: media.item_id });
  res.json({ success: true });
});

// Import JW Library playlist (.jwlplaylist) for a shift item
app.post('/api/items/:itemId/import-playlist', authenticate('admin'), upload.single('playlist'), async (req, res) => {
  const { itemId } = req.params;
  const file = req.file;
  console.log('[IMPORT] Requisicao: itemId', itemId, 'arquivo', file?.originalname);

  if (!file) return res.status(400).json({ error: 'Arquivo .jwlplaylist nao fornecido' });
  const item = queries.getItem(itemId);
  if (!item) {
    try { await fs.promises.unlink(file.path); } catch (_) {}
    return res.status(404).json({ error: 'Item não encontrado' });
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jwlplaylist-'));
  try {
    const dbPath = await extractUserDb(file.path, tmpDir);
    const playlists = readPlaylists(dbPath);
    const medias = playlists.flatMap(p => p.medias);

    // mode=replace apaga as mídias atuais da parte; qualquer outro valor adiciona abaixo da última
    const replace = req.body.mode === 'replace';
    // Arquivo sem itens é recusado antes de qualquer mudança: nunca apaga as mídias existentes
    if (medias.length === 0) return res.status(400).json({ error: 'Nenhuma playlist com itens neste arquivo.' });
    queries.importMedias(Number(itemId), medias, replace);

    broadcast('PROGRAM_UPDATED', { shiftId: item.shift_id, itemId: Number(itemId) });
    return res.json({ success: true, importedCount: medias.length });

  } catch (err) {
    if (err.message === JWL_INVALID) return res.status(400).json({ error: err.message });
    console.error('[IMPORT] Erro:', err);
    return res.status(500).json({ error: 'Erro ao importar: ' + err.message });
  } finally {
    try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try { await fs.promises.unlink(file.path); } catch (_) {}
  }
});

// Import a JW Library backup: one part per playlist, into the chosen shift
app.post('/api/shifts/:id/import-jwlibrary', authenticate('admin'), upload.single('file'), async (req, res) => {
  const file = req.file;
  let tmpDir = null;
  try {
    const shiftId = Number(req.params.id);
    const shift = queries.getShift(shiftId);
    if (!shift) return res.status(404).json({ error: 'Turno não encontrado.' });
    if (!file) return res.status(400).json({ error: 'Arquivo .jwlibrary não fornecido.' });

    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jwlibrary-'));
    let playlists;
    try {
      const dbPath = await extractUserDb(file.path, tmpDir);
      playlists = readPlaylists(dbPath);
    } catch (err) {
      if (err.message === JWL_INVALID) return res.status(400).json({ error: err.message });
      throw err;
    }
    if (playlists.length === 0) return res.status(400).json({ error: 'Nenhuma playlist com itens neste arquivo.' });

    const replace = req.body.mode === 'replace';
    const existing = replace ? [] : queries.getItemsByShift(shiftId);
    const lastPart = existing[existing.length - 1];
    const time = lastPart?.scheduled_time || shift.start_time || '00:00';

    const result = queries.importPlaylistsAsParts(shiftId, playlists, replace, time);
    broadcast('PROGRAM_UPDATED', { shiftId });
    return res.json({ success: true, partsCount: result.partsCount, mediasCount: result.mediasCount });
  } catch (err) {
    console.error('[IMPORT-JWLIBRARY] Erro:', err);
    return res.status(500).json({ error: 'Erro ao importar: ' + err.message });
  } finally {
    if (tmpDir) { try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch (_) {} }
    if (file) { try { await fs.promises.unlink(file.path); } catch (_) {} }
  }
});

// Fallback to SPA index.html for navigation (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Errors answer in JSON, like every other API response, and never expose the stack
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[ERRO]', req.method, req.originalUrl, err);
  const message = status === 400 && err.type === 'entity.parse.failed' ? 'Dados enviados em formato inválido.'
    : status === 413 ? 'Os dados enviados são grandes demais.'
    : status < 500 ? (err.message || 'Requisição inválida.')
    : 'Erro interno do servidor.';
  if (res.headersSent) return next(err);
  res.status(status).json({ error: message });
});

module.exports = { app, server };

// Start Server (only when run directly, so tests can require this file)
if (require.main === module) server.listen(PORT, '0.0.0.0', () => {
  const lanIps = getLanIps();
  console.log(`\n======================================================`);
  console.log(`  🚀 EventosAPP v1.0 (MVP) - Servidor Local Ativo`);
  console.log(`  Local:     http://localhost:${PORT}`);
  if (lanIps.length > 0) {
    lanIps.forEach(ip => {
      console.log(`  Rede LAN:  http://${ip}:${PORT}`);
    });
  } else {
    console.log(`  Rede LAN:  Nenhum adaptador externo detectado`);
  }
  console.log(`  Banco:     SQLite com WAL ativado (local)`);
  console.log(`======================================================\n`);
});
