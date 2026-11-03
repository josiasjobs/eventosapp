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
