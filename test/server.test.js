const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Must run before requiring the server: never touch the real data/eventos.db
process.env.EVENTOS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eventos-server-test-')), 'test.db');
const { server } = require('../server');
const { queries } = require('../db');

let base;
let adminToken;

async function api(method, url, { token = adminToken, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: raw !== undefined ? raw : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text };
}

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const setup = await api('POST', '/api/setup', { token: null, body: { eventName: 'Teste', directorPin: '1234', adminPin: '9999' } });
  adminToken = setup.json.token;
});

test.after(() => new Promise(resolve => server.close(resolve)));

test('mídia numa parte que não existe responde 404 em JSON', async () => {
  const r = await api('POST', '/api/medias', { body: { itemId: 99999, title: 'x', type: 'video' } });
  assert.equal(r.status, 404);
  assert.ok(r.json && r.json.error);
});

test('turno num dia que não existe responde 404 em JSON', async () => {
  const r = await api('POST', '/api/shifts', { body: { dayId: 99999, name: 'x' } });
  assert.equal(r.status, 404);
  assert.ok(r.json && r.json.error);
});

test('dia num evento que não existe responde 404 em JSON', async () => {
  const r = await api('POST', '/api/days', { body: { eventId: 99999, date: '2026-11-08', label: 'x' } });
  assert.equal(r.status, 404);
  assert.ok(r.json && r.json.error);
});

test('nome de evento que não é texto responde 400 em JSON', async () => {
  const event = queries.getActiveEvent();
  const r = await api('PUT', `/api/events/${event.id}`, { body: { name: 123 } });
  assert.equal(r.status, 400);
  assert.ok(r.json && r.json.error);
});

test('JSON malformado responde em JSON, sem expor a pilha de chamadas', async () => {
  const r = await api('POST', '/api/days', { raw: '{"label":' });
  assert.equal(r.status, 400);
  assert.ok(r.json && r.json.error);
  assert.doesNotMatch(r.text, /node_modules|\.js:\d+/);
});

test('trocar o PIN encerra as outras sessões e mantém a de quem trocou', async () => {
  const other = await api('POST', '/api/auth/login', { token: null, body: { pin: '1234' } });
  const event = queries.getActiveEvent();
  const r = await api('PUT', `/api/events/${event.id}/pins`, { body: { directorPin: '4321' } });
  assert.equal(r.status, 200);
  assert.equal((await api('GET', '/api/auth/verify', { token: other.json.token })).status, 401);
  assert.equal((await api('GET', '/api/auth/verify')).status, 200);
});

test('item atual precisa ser do próprio turno', async () => {
  const event = queries.getActiveEvent();
  const dayId = queries.getDaysByEvent(event.id)[0].id;
  const shiftA = queries.getShiftsByDay(dayId)[0].id;
  const shiftB = queries.createShift(dayId, 'Outro', '', '', 2);
  const foreign = queries.createItem(shiftB, 'De fora', '10:00', '', '', '', 1);
  const r = await api('POST', `/api/shifts/${shiftA}/current-item`, { body: { currentItemId: Number(foreign) } });
  assert.equal(r.status, 400);
  assert.notEqual(queries.getShift(shiftA).current_item_id, Number(foreign));
});

test('reordenar partes recusa IDs de outro turno', async () => {
  const event = queries.getActiveEvent();
  const dayId = queries.getDaysByEvent(event.id)[0].id;
  const shiftA = queries.getShiftsByDay(dayId)[0].id;
  const own = queries.getItemsByShift(shiftA).map(i => i.id);
  const shiftB = queries.createShift(dayId, 'Outro 2', '', '', 3);
  const foreign = Number(queries.createItem(shiftB, 'De fora', '10:00', '', '', '', 1));
  const r = await api('PUT', '/api/items/reorder', { body: { shiftId: shiftA, orderedIds: [foreign, ...own] } });
  assert.equal(r.status, 400);
  assert.equal(queries.getItem(foreign).order_num, 1);
});

test('reordenar mídias recusa IDs de outra parte', async () => {
  const event = queries.getActiveEvent();
  const shiftA = queries.getShiftsByDay(queries.getDaysByEvent(event.id)[0].id)[0].id;
  const [itemA, itemB] = queries.getItemsByShift(shiftA);
  const own = queries.getMediasByItem(itemA.id).map(m => m.id);
  const foreign = queries.getMediasByItem(itemB.id)[0];
  const r = await api('PUT', '/api/medias/reorder', { body: { itemId: itemA.id, orderedIds: [foreign.id, ...own] } });
  assert.equal(r.status, 400);
  assert.equal(queries.getMedia(foreign.id).order_num, foreign.order_num);
});

test('importar playlist numa parte que não existe responde 404', async () => {
  const form = new FormData();
  form.append('playlist', new Blob(['nada']), 'x.jwlplaylist');
  const res = await fetch(`${base}/api/items/99999/import-playlist`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form
  });
  assert.equal(res.status, 404);
});

test('restaurar backup sem dias é recusado e mantém o evento atual', async () => {
  const before = queries.getActiveEvent().id;
  const r = await api('POST', '/api/backup/restore', { body: { backupData: { event: { name: 'Vazio' }, days: [] } } });
  assert.equal(r.status, 400);
  assert.equal(queries.getActiveEvent().id, before);
});

test('rota /api desconhecida responde 404 em JSON, não a página', async () => {
  const r = await api('PUT', '/api/rota-que-nao-existe', { body: {} });
  assert.equal(r.status, 404);
});

test('CAM padrão do enquadramento: admin salva e qualquer sessão lê', async () => {
  const put = await api('PUT', '/api/framing-defaults', { body: { speaker: '3', president: '1' } });
  assert.equal(put.status, 200);
  const get = await api('GET', '/api/framing-defaults');
  assert.deepEqual(get.json, { speaker: 3, president: 1 });
  const bad = await api('PUT', '/api/framing-defaults', { body: { speaker: '0' } });
  assert.equal(bad.status, 400);
});
