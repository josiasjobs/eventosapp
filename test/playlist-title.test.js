const { test } = require('node:test');
const assert = require('node:assert/strict');
const { playlistMediaTitle } = require('../playlist-title.js');

// Valores reais de um .jwlplaylist exportado pelo JW Library
test('EndAction 0 acrescenta "Continuar"', () => {
  assert.equal(
    playlistMediaTitle('João 5:28', { StartTrimOffsetTicks: null, EndTrimOffsetTicks: null, EndAction: 0 }),
    'João 5:28 - "Continuar"'
  );
});

test('corte no fim acrescenta "Editado"; EndAction padrão (2) não aparece', () => {
  assert.equal(
    playlistMediaTitle('João 5:29', { StartTrimOffsetTicks: 0, EndTrimOffsetTicks: 60300000, EndAction: 2 }),
    'João 5:29 - "Editado"'
  );
});

test('foto sem corte e com EndAction padrão fica só com o nome', () => {
  assert.equal(
    playlistMediaTitle('1102011089_univ_cnt_1.jpg', { StartTrimOffsetTicks: null, EndTrimOffsetTicks: null, EndAction: 2 }),
    '1102011089_univ_cnt_1.jpg'
  );
});

test('EndAction 1 acrescenta "Repetir"', () => {
  assert.equal(playlistMediaTitle('Vídeo', { EndAction: 1 }), 'Vídeo - "Repetir"');
});

test('editado e continuar juntos', () => {
  assert.equal(
    playlistMediaTitle('Salmo 23:1', { StartTrimOffsetTicks: 10000000, EndTrimOffsetTicks: 0, EndAction: 0 }),
    'Salmo 23:1 - "Editado" - "Continuar"'
  );
});

test('corte no início também conta como editado', () => {
  assert.equal(playlistMediaTitle('X', { StartTrimOffsetTicks: 5, EndAction: 2 }), 'X - "Editado"');
});
