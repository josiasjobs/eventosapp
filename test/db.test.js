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

test('passo guarda e atualiza a foto; backup leva a foto', () => {
  // earlier tests restored the event, so the original shiftId no longer exists: use the current one
  const currentShiftId = queries.getShiftsByDay(queries.getDaysByEvent(queries.getActiveEvent().id)[0].id)[0].id;
  const itemId = queries.createItem(currentShiftId, 'Foto', '16:00', '', '', 'sentinela', 99, 77);
  const photo = 'data:image/webp;base64,UklGRg==';
  const id = queries.createMedia(itemId, '?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'Ana', photo });
  assert.equal(queries.getMedia(id).photo, photo);
  queries.updateMedia(id, '?', 'question', '', { paragraph: 1, side: 'left', person: 'Ana', photo: '' });
  assert.equal(queries.getMedia(id).photo, '');
  queries.updateMedia(id, '?', 'question', '', { paragraph: 1, side: 'left', person: 'Ana', photo });
  const backup = queries.getFullEventBackup();
  const steps = backup.days.flatMap(d => d.shifts).flatMap(s => s.items).find(i => i.title === 'Foto').medias;
  assert.equal(steps[0].photo, photo);
});

// Turno novo a cada teste: testes anteriores restauram o evento
function freshShift() {
  const ev = queries.getActiveEvent();
  const day = queries.createDay(ev.id, '2026-11-03', 'Dia parte', 99);
  return queries.createShift(day, 'Turno parte', '09:00', '12:00', 1);
}

test('importPlaylistsAsParts acrescenta partes no fim do turno', () => {
  const sid = freshShift(); // cria dia + turno no evento ativo
  queries.createItem(sid, 'Existente', '09:00', '', '', '', 1);
  const r = queries.importPlaylistsAsParts(sid, [
    { name: 'A', medias: [{ title: 'm1', type: 'bible', reference: '' }, { title: 'm2', type: 'image', reference: '' }] },
    { name: 'B', medias: [{ title: 'm3', type: 'video', reference: '' }] }
  ], false, '09:00');
  assert.deepEqual(r, { partsCount: 2, mediasCount: 3 });
  const items = queries.getItemsByShift(sid);
  assert.deepEqual(items.map(i => [i.title, i.scheduled_time, i.order_num]), [['Existente', '09:00', 1], ['A', '09:00', 2], ['B', '09:00', 3]]);
  assert.deepEqual(queries.getMediasByItem(items[1].id).map(m => [m.title, m.order_num]), [['m1', 1], ['m2', 2]]);
});

test('importPlaylistsAsParts substitui as partes do turno', () => {
  const sid = freshShift();
  const old = queries.createItem(sid, 'Velha', '08:00', '', '', 'sentinela', 1, 901);
  queries.createMedia(old, '?', 'question', '', 1, { paragraph: 1, side: 'left', person: 'X' });
  queries.setShiftCurrentItem(sid, old);
  queries.importPlaylistsAsParts(sid, [{ name: 'Nova', medias: [{ title: 'm', type: 'other', reference: '' }] }], true, '10:00');
  assert.deepEqual(queries.getItemsByShift(sid).map(i => i.title), ['Nova']);
  assert.equal(queries.getMediasByItem(old).length, 0);
  assert.equal(queries.getShift(sid).current_item_id, null);
});

test('importPlaylistsAsParts não muda nada se falhar no meio', () => {
  const sid = freshShift();
  queries.createItem(sid, 'Fica', '08:00', '', '', '', 1);
  assert.throws(() => queries.importPlaylistsAsParts(sid, [{ name: 'X', medias: [{ title: null, type: 'other', reference: '' }] }], true, '10:00'));
  assert.deepEqual(queries.getItemsByShift(sid).map(i => i.title), ['Fica']);
});

test('plano: cria, sigla única sem diferenciar maiúsculas, uso e exclusão', () => {
  const pp = queries.createCameraPlan({ sigla: 'PP', name: 'Plano presidente', camera: 2, preset: 4 });
  assert.throws(() => queries.createCameraPlan({ sigla: 'pp', name: 'Outro', camera: 1, preset: 1 }));
  assert.equal(queries.getCameraPlanBySigla(' pp ').id, pp);
  const itemId = queries.createItem(shiftId, 'Presidente', '09:00', '', '', 'presidente', 50, null, {}, { inId: pp, outId: pp });
  assert.equal(queries.listCameraPlans().find(p => p.id === pp).usage, 1);
  const part = queries.getFullShiftData(shiftId).items.find(i => i.id === itemId);
  assert.deepEqual(part.plan_in, { id: pp, sigla: 'PP', name: 'Plano presidente', camera: 2, preset: 4 });
  queries.deleteCameraPlan(pp);
  const after = queries.getItem(itemId);
  assert.equal(after.plan_in_id, null);
  assert.equal(after.plan_out_id, null);
});

test('backup leva os planos usados; restauração usa o local e cria o que falta', () => {
  const pa = queries.createCameraPlan({ sigla: 'PA', name: 'Plano aberto', camera: 1, preset: 1 });
  const sd = queries.createCameraPlan({ sigla: 'SD', name: 'Série discurso', camera: 3, preset: 1 });
  queries.createCameraPlan({ sigla: 'XX', name: 'Sem uso', camera: 9, preset: 9 });
  // Earlier tests restored backups, so the active event is a copy: add the part there
  const activeShift = queries.getShiftsByDay(queries.getDaysByEvent(queries.getActiveEvent().id)[0].id)[0];
  queries.createItem(activeShift.id, 'Discurso', '10:00', '', 'João', '', 51, null, {}, { inId: pa, outId: sd });
  const backup = queries.getFullEventBackup();
  assert.deepEqual(backup.camera_plans.map(p => p.sigla).sort(), ['PA', 'SD']);
  const part = backup.days[0].shifts[0].items.find(i => i.title === 'Discurso');
  assert.deepEqual([part.plan_in, part.plan_out], ['PA', 'SD']);

  // On this machine PA has another preset and SD does not exist
  queries.updateCameraPlan(pa, { sigla: 'PA', name: 'Plano aberto', camera: 1, preset: 7 });
  queries.deleteCameraPlan(sd);
  queries.restoreEventBackup(backup, true);
  assert.equal(queries.getCameraPlanBySigla('PA').preset, 7);
  assert.equal(queries.getCameraPlanBySigla('SD').camera, 3);
});

test('sessão vencida não é aceita, mesmo vencida no mesmo dia', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600e3).toISOString();
  queries.createSession('vencida', 'admin', '', twoHoursAgo);
  assert.equal(queries.getSession('vencida'), undefined);
  const inOneHour = new Date(Date.now() + 3600e3).toISOString();
  queries.createSession('valida', 'admin', '', inOneHour);
  assert.ok(queries.getSession('valida'));
});

test('restauração: sigla desconhecida fica sem plano; backup antigo sem planos restaura', () => {
  const shift = queries.getShiftsByDay(queries.getDaysByEvent(queries.getActiveEvent().id)[0].id)[0];
  const known = queries.createCameraPlan({ sigla: 'KN', name: 'Conhecido', camera: 2, preset: 2 });
  queries.createItem(shift.id, 'ComPlano', '11:00', '', '', '', 99, null, {}, { inId: known, outId: null });
  const backup = queries.getFullEventBackup();
  const part = backup.days[0].shifts[0].items.find(i => i.title === 'ComPlano');
  assert.equal(part.plan_in, 'KN');
  part.plan_in = 'NAOEXISTE';
  delete backup.camera_plans;
  queries.restoreEventBackup(backup, true);
  const newShift = queries.getShiftsByDay(queries.getDaysByEvent(queries.getActiveEvent().id)[0].id)[0];
  const restored = queries.getFullShiftData(newShift.id).items.find(i => i.title === 'ComPlano');
  assert.equal(restored.plan_in, null);
});

test('modelo inicial importa a programação completa sem credenciais', () => {
  const templatePath = path.join(__dirname, '..', 'seed', 'default-event.json');
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  assert.equal('event' in template, false);
  assert.equal('director_pin_hash' in template, false);
  assert.equal('admin_pin_hash' in template, false);

  const seededEventId = queries.createEvent('Evento configurado', '', 'hash-diretor-da-configuracao', 'hash-admin-da-configuracao');
  queries.populateEventFromTemplate(seededEventId, template);

  const days = queries.getDaysByEvent(seededEventId);
  const shifts = days.flatMap(day => queries.getShiftsByDay(day.id));
  const items = shifts.flatMap(shift => queries.getItemsByShift(shift.id));
  const medias = items.flatMap(item => queries.getMediasByItem(item.id));
  assert.deepEqual([days.length, shifts.length, items.length, medias.length], [1, 1, 5, 8]);
  assert.equal(medias.filter(media => media.photo).length, 3);
  assert.equal(queries.listCameraPlans().length >= 2, true);
});

test('backup não exporta nem restaura hashes de PIN', () => {
  const before = queries.getActiveEvent();
  const backup = queries.getFullEventBackup();
  assert.equal('director_pin_hash' in backup.event, false);
  assert.equal('admin_pin_hash' in backup.event, false);

  backup.event.director_pin_hash = 'hash-malicioso-diretor';
  backup.event.admin_pin_hash = 'hash-malicioso-admin';
  queries.restoreEventBackup(backup);

  const restored = queries.getActiveEvent();
  assert.equal(restored.director_pin_hash, before.director_pin_hash);
  assert.equal(restored.admin_pin_hash, before.admin_pin_hash);
});

test('enquadramento: preset do orador é salvo, atualizado e vai no backup', () => {
  const event = queries.getActiveEvent();
  const shift = queries.getShiftsByDay(queries.getDaysByEvent(event.id)[0].id)[0].id;
  const itemId = queries.createItem(shift, 'Enquadrada', '10:00', '', 'João', '', 90, null, { speaker: 2, preset: 5 });
  assert.deepEqual([queries.getItem(itemId).cam_speaker, queries.getItem(itemId).preset_speaker], [2, 5]);
  queries.updateItem(itemId, 'Enquadrada', '10:00', '', 'João', '', null, { speaker: 3, preset: 7 });
  assert.deepEqual([queries.getItem(itemId).cam_speaker, queries.getItem(itemId).preset_speaker], [3, 7]);
  const backup = queries.getFullEventBackup();
  const saved = backup.days[0].shifts[0].items.find(i => i.title === 'Enquadrada');
  assert.equal(saved.preset_speaker, 7);
  queries.restoreEventBackup(backup);
  const restored = queries.getFullEventBackup().days[0].shifts[0].items.find(i => i.title === 'Enquadrada');
  assert.deepEqual([restored.cam_speaker, restored.preset_speaker], [3, 7]);
});

test('CAM padrão do enquadramento por papel', () => {
  assert.deepEqual(queries.getFramingDefaults(), { speaker: null, president: null });
  queries.setFramingDefaults({ speaker: 2, president: 1 });
  assert.deepEqual(queries.getFramingDefaults(), { speaker: 2, president: 1 });
  queries.setFramingDefaults({ speaker: null, president: 4 });
  assert.deepEqual(queries.getFramingDefaults(), { speaker: null, president: 4 });
});
