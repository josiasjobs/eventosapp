const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Must run before require('../db'): never touch the real data/eventos.db
process.env.EVENTOS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eventos-test-')), 'test.db');
const { queries } = require('../db');

const eventId = queries.createEvent('Teste', '', 'dir-hash', 'adm-hash');
const dayId = queries.createDay(eventId, '2026-11-03', 'Dia 1', 1);
const shiftId = queries.createShift(dayId, 'Manhã', '09:00', '12:00', 1);

test('Sentinela guarda câmeras e passos', () => {
  const itemId = queries.createItem(shiftId, 'A Sentinela', '15:00', '', '', 'sentinela', 1, 3, { left: 1, right: 3, speaker: 2 });
  const qId = queries.createMedia(itemId, 'A?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'Pedro' });
  const item = queries.getItem(itemId);
  assert.deepEqual([item.cam_left, item.cam_right, item.cam_speaker], [1, 3, 2]);
  const step = queries.getMedia(qId);
  assert.deepEqual([step.paragraph, step.side, step.person, step.photo], [1, 'left', 'Pedro', '']);
});

test('importar com Substituir mantém as perguntas', () => {
  const itemId = queries.createItem(shiftId, 'S', '15:00', '', '', 'sentinela', 2, 4);
  queries.createMedia(itemId, '?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'Ana' });
  queries.createMedia(itemId, 'Velha', 'image', '', 2);
  queries.importMedias(itemId, [{ title: 'Nova', type: 'video', reference: '' }], true);
  const steps = queries.getMediasByItem(itemId);
  assert.deepEqual(steps.map(s => [s.title, s.order_num]), [['?', 1], ['Nova', 2]]);
});

test('createMediaAfter insere logo depois do passo âncora e renumera', () => {
  const itemId = queries.createItem(shiftId, 'S2', '15:00', '', '', 'sentinela', 3, 5);
  const a = queries.createMedia(itemId, '?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'A' });
  const b = queries.createMedia(itemId, '?', 'question', '', 2, { paragraph: 1, side: 'left', person: 'B' });
  queries.createMedia(itemId, 'Vídeo', 'video', '', 3);
  const n = queries.createMediaAfter(itemId, b, '?', 'question', '', { paragraph: 1, side: 'left', person: 'N' });
  const steps = queries.getMediasByItem(itemId);
  assert.deepEqual(steps.map(s => [s.person || s.title, s.order_num]), [['A', 1], ['B', 2], ['N', 3], ['Vídeo', 4]]);
  assert.equal(steps[2].id, n);
  // foreign/unknown anchor appends
  const m = queries.createMediaAfter(itemId, 999999, '?', 'question', '', { paragraph: 2, side: 'right', person: 'M' });
  assert.equal(queries.getMedia(m).order_num, 5);
  assert.equal(a > 0, true);
});

test('backup e restauração levam os campos novos', () => {
  const backup = queries.getFullEventBackup();
  const item = backup.days[0].shifts[0].items.find(i => i.activity_type === 'sentinela');
  assert.equal(item.cam_left, 1);
  assert.equal(item.medias[0].person, 'Pedro');
  queries.restoreEventBackup(backup, true);
  const restored = queries.getFullEventBackup().days[0].shifts[0].items.find(i => i.title === 'A Sentinela');
  assert.deepEqual([restored.cam_right, restored.medias[0].side], [3, 'left']);
});

test('backup antigo, sem os campos novos, restaura com eles vazios', () => {
  const old = queries.getFullEventBackup();
  for (const d of old.days) for (const s of d.shifts) for (const i of s.items) {
    delete i.cam_left; delete i.cam_right; delete i.cam_speaker;
    for (const m of i.medias) { delete m.paragraph; delete m.side; delete m.person; delete m.photo; }
  }
  queries.restoreEventBackup(old, true);
  const i = queries.getFullEventBackup().days[0].shifts[0].items[0];
  assert.equal(i.cam_left, null);
});
