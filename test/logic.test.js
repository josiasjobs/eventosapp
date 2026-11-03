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
