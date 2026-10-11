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

const { queries } = require('./db');
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
app.use(express.json());
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
      return res.status(400).json({ error: 'O PIN do Diretor deve ter de 4 a 8 dígitos numéricos.' });
    }
    if (!isValidPin(adminPin)) {
      return res.status(400).json({ error: 'O PIN de Edição/Admin deve ter de 4 a 8 dígitos numéricos.' });
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
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome do evento não pode ser vazio.' });
  }
  queries.updateEvent(req.params.id, name.trim(), category ? category.trim() : '');
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
      if (!isValidPin(directorPin)) return res.status(400).json({ error: 'O PIN do Diretor deve ter de 4 a 8 dígitos.' });
      dirHash = await hashPin(directorPin);
    }
    if (adminPin) {
      if (!isValidPin(adminPin)) return res.status(400).json({ error: 'O PIN de Administrador deve ter de 4 a 8 dígitos.' });
      admHash = await hashPin(adminPin);
    }

    queries.updateEventPins(req.params.id, dirHash, admHash);
    res.json({ success: true, message: 'PINs atualizados com sucesso.' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar PINs: ' + e.message });
  }
});

// 11. Days Management (Admin only)
app.post('/api/days', authenticate('admin'), (req, res) => {
  const { eventId, date, label } = req.body;
  if (!label || !date) return res.status(400).json({ error: 'Data e Rótulo são obrigatórios.' });

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
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do turno é obrigatório.' });

  const currentShifts = queries.getShiftsByDay(dayId);
  const nextOrder = currentShifts.length + 1;
  const shiftId = queries.createShift(dayId, name.trim(), startTime || '', endTime || '', nextOrder);

  const day = queries.getDay(dayId);
  broadcast('EVENT_UPDATED', { eventId: day ? day.event_id : null });
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
  }

  queries.setShiftCurrentItem(shift.id, currentItemId ? Number(currentItemId) : null);

  broadcast('CURRENT_ITEM_CHANGED', {
    shiftId: shift.id,
    currentItemId: currentItemId ? Number(currentItemId) : null,
    item
  });

  res.json({ success: true, shiftId: shift.id, currentItemId });
});

// 15. Items CRUD & Reordering (Admin only) - RF-06
app.post('/api/items', authenticate('admin'), (req, res) => {
  const { shiftId, title, scheduledTime, description, speaker, activityType } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título do item é obrigatório.' });
  if (!scheduledTime) return res.status(400).json({ error: 'Horário previsto é obrigatório.' });

  const currentItems = queries.getItemsByShift(shiftId);
  const nextOrder = currentItems.length + 1;

  const itemId = queries.createItem(
    shiftId,
    title.trim(),
    scheduledTime.trim(),
    description ? description.trim() : '',
    speaker ? speaker.trim() : '',
    activityType ? activityType.trim() : '',
    nextOrder
  );

  // If shift had no current item, automatically set this first item
  const shift = queries.getShift(shiftId);
  if (shift && !shift.current_item_id) {
    queries.setShiftCurrentItem(shiftId, itemId);
  }

  broadcast('PROGRAM_UPDATED', { shiftId });
  res.json({ success: true, itemId });
});

app.put('/api/items/:id', authenticate('admin'), (req, res) => {
  const { title, scheduledTime, description, speaker, activityType } = req.body;
  const item = queries.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  queries.updateItem(
    item.id,
    title ? title.trim() : item.title,
    scheduledTime ? scheduledTime.trim() : item.scheduled_time,
    description !== undefined ? description.trim() : item.description,
    speaker !== undefined ? speaker.trim() : item.speaker,
    activityType !== undefined ? activityType.trim() : item.activity_type
  );

  broadcast('PROGRAM_UPDATED', { shiftId: item.shift_id });
  res.json({ success: true });
});

app.put('/api/items/reorder', authenticate('admin'), (req, res) => {
  const { shiftId, orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds deve ser um array de IDs.' });

  orderedIds.forEach((id, index) => {
    queries.updateItemOrder(id, index + 1);
  });

  broadcast('PROGRAM_UPDATED', { shiftId });
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

// 16. Medias CRUD, Reordering, and Progress Toggle - RF-07, RF-08
app.post('/api/medias', authenticate('admin'), (req, res) => {
  const { itemId, title, type, reference } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título da mídia é obrigatório.' });

  const validTypes = ['bible', 'image', 'video', 'interview', 'theater', 'other'];
  const mediaType = validTypes.includes(type) ? type : 'other';

  const currentMedias = queries.getMediasByItem(itemId);
  const nextOrder = currentMedias.length + 1;

  const mediaId = queries.createMedia(itemId, title.trim(), mediaType, reference ? reference.trim() : '', nextOrder);

  const item = queries.getItem(itemId);
  broadcast('PROGRAM_UPDATED', { shiftId: item ? item.shift_id : null, itemId });
  res.json({ success: true, mediaId });
});

app.put('/api/medias/:id', authenticate('admin'), (req, res) => {
  const { title, type, reference } = req.body;
  const media = queries.getMedia(req.params.id);
  if (!media) return res.status(404).json({ error: 'Mídia não encontrada' });

  const validTypes = ['bible', 'image', 'video', 'interview', 'theater', 'other'];
  const mediaType = validTypes.includes(type) ? type : media.type;

  queries.updateMedia(
    media.id,
    title ? title.trim() : media.title,
    mediaType,
    reference !== undefined ? reference.trim() : media.reference
  );

  const item = queries.getItem(media.item_id);
  broadcast('PROGRAM_UPDATED', { shiftId: item ? item.shift_id : null, itemId: media.item_id });
  res.json({ success: true });
});

app.put('/api/medias/reorder', authenticate('admin'), (req, res) => {
  const { itemId, orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds deve ser um array de IDs.' });

  orderedIds.forEach((id, index) => {
    queries.updateMediaOrder(id, index + 1);
  });

  const item = queries.getItem(itemId);
  broadcast('PROGRAM_UPDATED', { shiftId: item ? item.shift_id : null, itemId });
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

// Fallback to SPA index.html for navigation (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
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
