const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/js/logic.js');

test('marcar a última mídia conclui a parte', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1},{completed:1}], false, true), true);
});
test('marcar com mídias pendentes não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1},{completed:0}], false, true), null);
});
test('marcar a última com a parte já concluída não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1}], true, true), null);
});
test('desmarcar mídia de parte concluída reabre', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:0},{completed:1}], true, false), false);
});
test('desmarcar mídia de parte pendente não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:0}], false, false), null);
});
test('parte concluída manualmente continua concluída ao marcar mídia pendente', () => {
  assert.equal(L.itemCompletionAfterToggle([{completed:1},{completed:0}], true, true), null);
});
test('sem mídias não altera', () => {
  assert.equal(L.itemCompletionAfterToggle([], false, true), null);
});

const days = [{id:1, shifts:[{id:10},{id:11}]}, {id:2, shifts:[{id:20}]}];
test('usa o turno salvo quando existe', () => {
  assert.deepEqual(L.pickInitialShift(days, 20), {dayId:2, shiftId:20});
});
test('turno salvo inexistente cai no primeiro', () => {
  assert.deepEqual(L.pickInitialShift(days, 999), {dayId:1, shiftId:10});
});
test('sem turno salvo cai no primeiro', () => {
  assert.deepEqual(L.pickInitialShift(days, null), {dayId:1, shiftId:10});
});
test('primeiro dia sem turnos usa o próximo dia com turno', () => {
  assert.deepEqual(L.pickInitialShift([{id:1, shifts:[]}, ...days.slice(1)], null), {dayId:2, shiftId:20});
});
test('sem dias retorna null', () => {
  assert.equal(L.pickInitialShift([], 10), null);
});

test('itemStatus', () => {
  assert.equal(L.itemStatus({completed:1, medias:[]}), 'done');
  assert.equal(L.itemStatus({completed:0, medias:[{completed:1},{completed:0}]}), 'partial');
  assert.equal(L.itemStatus({completed:0, medias:[{completed:0}]}), 'empty');
  assert.equal(L.itemStatus({completed:0}), 'empty');
});

test('escapeHtml', () => {
  assert.equal(L.escapeHtml(`Dia D'Ávila <b>"x"</b> & y`),
    'Dia D&#39;Ávila &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y');
  assert.equal(L.escapeHtml(null), '');
  assert.equal(L.escapeHtml(12), '12');
});

test('escapeHtml(undefined) retorna string vazia', () => {
  assert.equal(L.escapeHtml(undefined), '');
});
test('pickInitialShift tolera dia sem chave shifts', () => {
  assert.deepEqual(L.pickInitialShift([{id:1}, {id:2, shifts:[{id:20}]}], null), {dayId:2, shiftId:20});
  assert.deepEqual(L.pickInitialShift([{id:1}, {id:2, shifts:[{id:20}]}], 20), {dayId:2, shiftId:20});
  assert.equal(L.pickInitialShift([{id:1}], null), null);
});
test('pickInitialShift com days null retorna null', () => {
  assert.equal(L.pickInitialShift(null, 10), null);
});

test('moveId move para frente, para trás e limita o índice', () => {
  assert.deepEqual(L.moveId([1,2,3,4], 1, 2), [2,3,1,4]);
  assert.deepEqual(L.moveId([1,2,3,4], 4, 0), [4,1,2,3]);
  assert.deepEqual(L.moveId([1,2,3], 2, 99), [1,3,2]);
  assert.deepEqual(L.moveId([1,2,3], 2, -5), [2,1,3]);
});
test('moveId com id inexistente devolve cópia sem alterar', () => {
  const ids = [1,2,3];
  const out = L.moveId(ids, 9, 0);
  assert.deepEqual(out, [1,2,3]);
  assert.notEqual(out, ids);
});
test('moveId não altera o array original', () => {
  const ids = [1,2,3];
  L.moveId(ids, 3, 0);
  assert.deepEqual(ids, [1,2,3]);
});

test('dropIndex conta quantos centros estão acima de y', () => {
  const c = [10, 30, 50];
  assert.equal(L.dropIndex(c, 0), 0);
  assert.equal(L.dropIndex(c, 20), 1);
  assert.equal(L.dropIndex(c, 40), 2);
  assert.equal(L.dropIndex(c, 100), 3);
  assert.equal(L.dropIndex(c, 30), 1); // empate: centro igual a y não conta
  assert.equal(L.dropIndex([], 5), 0);
});

test('sortByIds ordena pela lista e mantém desconhecidos no fim na ordem original', () => {
  const list = [{id:'a'}, {id:'x'}, {id:'b'}, {id:'y'}, {id:'c'}];
  assert.deepEqual(L.sortByIds(list, ['c','a','b']).map(e => e.id), ['c','a','b','x','y']);
});
test('sortByIds ignora ids sobrando e não altera a lista original', () => {
  const list = [{id:1}, {id:2}];
  assert.deepEqual(L.sortByIds(list, [2, 99, 1]).map(e => e.id), [2, 1]);
  assert.deepEqual(list.map(e => e.id), [1, 2]);
  assert.deepEqual(L.sortByIds([], [1]), []);
});

test('menuPosition abre abaixo e alinhado à direita da âncora', () => {
  const a = {left: 300, right: 340, top: 100, bottom: 140};
  assert.deepEqual(L.menuPosition(a, 160, 100, 400, 800), {left: 180, top: 144});
});
test('menuPosition inverte para cima quando não cabe embaixo', () => {
  const a = {left: 300, right: 340, top: 700, bottom: 740};
  assert.deepEqual(L.menuPosition(a, 160, 100, 400, 800), {left: 180, top: 596});
});
test('menuPosition limita dentro da viewport', () => {
  const a = {left: 0, right: 20, top: 100, bottom: 140};
  assert.equal(L.menuPosition(a, 160, 100, 400, 800).left, 8);
  const b = {left: 380, right: 600, top: 100, bottom: 140};
  assert.equal(L.menuPosition(b, 160, 100, 400, 800).left, 400 - 160 - 8);
  const c = {left: 300, right: 340, top: 5, bottom: 780};
  const p = L.menuPosition(c, 160, 100, 400, 800);
  assert.ok(p.top >= 8 && p.top <= 800 - 100 - 8);
});

test('localDateISO usa a data local (não UTC)', () => {
  assert.equal(L.localDateISO(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  assert.equal(L.localDateISO(new Date(2026, 10, 3, 0, 5)), '2026-11-03');
});

const parts = [{ id: 7 }, { id: 8 }, { id: 9 }];
test('pickInitialItem usa a parte salva no aparelho quando ela existe', () => {
  assert.equal(L.pickInitialItem(parts, 9, 8), 9);
});
test('pickInitialItem cai na parte atual do servidor se a salva sumiu', () => {
  assert.equal(L.pickInitialItem(parts, 99, 8), 8);
});
test('pickInitialItem cai na primeira parte sem salva nem do servidor', () => {
  assert.equal(L.pickInitialItem(parts, null, null), 7);
  assert.equal(L.pickInitialItem(parts, null, 99), 7);
});
test('pickInitialItem sem partes retorna null', () => {
  assert.equal(L.pickInitialItem([], 9, 8), null);
});

test('mediaNotes ignora o nome interno de arquivo gravado por importações antigas', () => {
  assert.equal(L.mediaNotes('95c33726-1d91-4df6-9f0e-517cb885724f.jpg'), '');
  assert.equal(L.mediaNotes('6EC5639F-0CED-4478-83F2-DCEC47AF4DF3.MP4'), '');
  assert.equal(L.mediaNotes('  2abc66e5-c510-432d-9588-f9537d2c9e7f.jpg  '), '');
});
test('mediaNotes mantém observações escritas no app', () => {
  assert.equal(L.mediaNotes('Projetor 2'), 'Projetor 2');
  assert.equal(L.mediaNotes('Editado, com áudio'), 'Editado, com áudio');
  assert.equal(L.mediaNotes('ver arquivo 95c33726-1d91-4df6-9f0e-517cb885724f.jpg'), 'ver arquivo 95c33726-1d91-4df6-9f0e-517cb885724f.jpg');
  assert.equal(L.mediaNotes(''), '');
  assert.equal(L.mediaNotes(null), '');
});

test('parseTalkNumber: vazio significa "não é discurso"', () => {
  for (const v of [null, undefined, '', '  ']) assert.equal(L.parseTalkNumber(v), null);
});
test('parseTalkNumber: inteiro positivo vale', () => {
  assert.equal(L.parseTalkNumber('5'), 5);
  assert.equal(L.parseTalkNumber(12), 12);
  assert.equal(L.parseTalkNumber(' 7 '), 7);
});
test('parseTalkNumber: zero, negativo, decimal e texto são inválidos', () => {
  for (const v of ['0', 0, '-3', '2.5', 2.5, 'abc', '5a', '1e3']) assert.equal(L.parseTalkNumber(v), false, String(v));
});

const q = (id, paragraph, side, person = 'X') => ({ id, type: 'question', paragraph, side, person, title: '?' });
const m = (id, paragraph = null, completed = 0) => ({ id, type: 'bible', paragraph, completed, title: 'T' });

test('parsePositiveInt e parseTalkNumber', () => {
  assert.equal(L.parsePositiveInt(''), null);
  assert.equal(L.parsePositiveInt('3'), 3);
  assert.equal(L.parsePositiveInt('0'), false);
  assert.equal(L.parseTalkNumber('2.5'), false);
});

test('checkQuestionStep valida parágrafo, lado e nome', () => {
  assert.deepEqual(L.checkQuestionStep({ paragraph: '2', side: 'left', person: ' Ana ' }), { paragraph: 2, side: 'left', person: 'Ana' });
  assert.equal(L.checkQuestionStep({ paragraph: '2', side: 'left', person: ' ' }).error, 'Informe o nome de quem responde.');
  assert.equal(L.checkQuestionStep({ paragraph: '', side: 'left', person: 'A' }).error, 'Informe o parágrafo (número inteiro maior que zero).');
  assert.equal(L.checkQuestionStep({ paragraph: '1', side: 'meio', person: 'A' }).error, 'O lado deve ser Esquerda ou Direita.');
});

test('groupSentinelaSteps junta perguntas seguidas de mesmo § e lado', () => {
  const g = L.groupSentinelaSteps([q(1, 1, 'left'), q(2, 1, 'left'), q(3, 2, 'right'), m(4, 2), q(5, 2, 'right'), q(6, 2, 'left')]);
  assert.deepEqual(g.map(c => [c.kind, c.paragraph, c.side, c.steps.map(s => s.id)]), [
    ['question', 1, 'left', [1, 2]],
    ['question', 2, 'right', [3]],
    ['media', 2, null, [4]],
    ['question', 2, 'right', [5]],
    ['question', 2, 'left', [6]]
  ]);
  assert.deepEqual(L.groupSentinelaSteps([]), []);
});

test('stepNav anda e sai nas pontas', () => {
  assert.deepEqual(L.stepNav([1, 2, 3], 2, 'next'), { stepId: 3 });
  assert.deepEqual(L.stepNav([1, 2, 3], 2, 'prev'), { stepId: 1 });
  assert.deepEqual(L.stepNav([1, 2, 3], 3, 'next'), { leave: 'next' });
  assert.deepEqual(L.stepNav([1, 2, 3], 1, 'prev'), { leave: 'prev' });
  assert.deepEqual(L.stepNav([], null, 'next'), { leave: 'next' });
  assert.deepEqual(L.stepNav([1, 2], 99, 'next'), { stepId: 1 });
  assert.deepEqual(L.stepNav([1, 2], 99, 'prev'), { leave: 'prev' });
});

test('pickInitialStep usa o salvo se ainda existe, senão o primeiro', () => {
  assert.equal(L.pickInitialStep([1, 2], 2), 2);
  assert.equal(L.pickInitialStep([1, 2], 9), 1);
  assert.equal(L.pickInitialStep([], 9), null);
});

test('initials', () => {
  assert.equal(L.initials('Pedro'), 'PE');
  assert.equal(L.initials('ana maria silva'), 'AS');
  assert.equal(L.initials('  '), '');
});

test('perguntas não contam para status e conclusão da parte', () => {
  assert.equal(L.itemCompletionAfterToggle([q(1, 1, 'left'), m(2, null, 1)], false, true), true);
  assert.equal(L.itemCompletionAfterToggle([q(1, 1, 'left')], false, true), null);
  assert.equal(L.itemStatus({ completed: 0, medias: [q(1, 1, 'left'), m(2)] }), 'empty');
  assert.equal(L.itemStatus({ completed: 0, medias: [m(1, null, 1), m(2)] }), 'partial');
});

test('shiftHasSentinela: um turno aceita só uma Sentinela', () => {
  const items = [{ id: 1, activity_type: '' }, { id: 2, activity_type: 'sentinela' }];
  assert.equal(L.shiftHasSentinela(items), true);
  assert.equal(L.shiftHasSentinela(items, 2), false);
  assert.equal(L.shiftHasSentinela([{ id: 1, activity_type: '' }]), false);
  assert.equal(L.shiftHasSentinela(undefined), false);
});

test('notas da mídia: teatro e entrevista mostram "Camera - Preset"', () => {
  assert.equal(L.notesLabel('theater'), 'Camera - Preset');
  assert.equal(L.notesLabel('interview'), 'Camera - Preset');
  assert.equal(L.notesLabel('bible'), 'Observações');
  assert.equal(L.mediaNotesText({ type: 'theater', reference: 'CAM 2 - P4' }), 'Camera - Preset: CAM 2 - P4');
  assert.equal(L.mediaNotesText({ type: 'interview', reference: '' }), '');
  assert.equal(L.mediaNotesText({ type: 'image', reference: 'Projetor 2' }), 'Projetor 2');
});
