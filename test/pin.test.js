const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidPin } = require('../pin.js');
test('aceita exatamente 4 dígitos', () => {
  assert.equal(isValidPin('1234'), true);
  assert.equal(isValidPin('0000'), true);
});
test('rejeita o resto', () => {
  for (const p of ['123', '12345', '12345678', '12a4', ' 1234', '', null, 1234]) {
    assert.equal(isValidPin(p), false, String(p));
  }
});
