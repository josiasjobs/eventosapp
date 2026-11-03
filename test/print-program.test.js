const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProgramHtml } = require('../public/js/print-program.js');

const data = {
  eventName: 'Congresso 2026',
  dayLabel: 'Sábado',
  shiftName: 'Manhã',
  generatedAt: new Date(2026, 10, 3, 9, 5),
  items: [
    {
      scheduled_time: '09:30', title: 'Cântico e oração', speaker: '', description: '',
      medias: [{ type: 'video', title: 'Cântico 1', reference: '' }]
    },
    {
      scheduled_time: '09:50', title: 'Discurso principal', speaker: 'João Silva', description: 'Com vídeo',
      medias: [
        { type: 'bible', title: 'João 5:28 - "Continuar"', reference: '' },
        { type: 'image', title: 'Mapa', reference: 'Projetor 2' }
      ]
    },
    { scheduled_time: '10:20', title: 'Entrevista', speaker: '', description: '', medias: [] }
  ]
};

test('cabeçalho traz evento, dia · turno e data de emissão', () => {
  const html = buildProgramHtml(data);
  assert.match(html, /Congresso 2026/);
  assert.match(html, /Sábado · Manhã/);
  assert.match(html, /03\/11\/2026 09:05/);
});

test('partes saem na ordem, numeradas, com horário', () => {
  const html = buildProgramHtml(data);
  const a = html.indexOf('Cântico e oração');
  const b = html.indexOf('Discurso principal');
  const c = html.indexOf('Entrevista');
  assert.ok(a > 0 && a < b && b < c);
  assert.match(html, /09:50/);
});

test('uma caixinha vazia por mídia, nunca marcada', () => {
  const html = buildProgramHtml(data);
  assert.equal((html.match(/class="box"/g) || []).length, 3);
  assert.doesNotMatch(html, /☑|✓/);
});

test('tipo da mídia em texto, observações e orador aparecem', () => {
  const html = buildProgramHtml(data);
  assert.match(html, /Bíblia/);
  assert.match(html, /Imagem/);
  assert.match(html, /Projetor 2/);
  assert.match(html, /João Silva/);
  assert.match(html, /Com vídeo/);
});

test('parte sem mídias mostra "Sem mídias"', () => {
  assert.match(buildProgramHtml(data), /Sem mídias/);
});

test('texto do banco é escapado', () => {
  const html = buildProgramHtml({
    ...data,
    eventName: '<script>x</script>',
    items: [{ scheduled_time: '08:00', title: `Dia D'Ávila <b>`, speaker: '', description: '',
      medias: [{ type: 'other', title: 'A & "B"', reference: '' }] }]
  });
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /&lt;script&gt;x/);
  assert.match(html, /Dia D&#39;Ávila &lt;b&gt;/);
  assert.match(html, /A &amp; &quot;B&quot;/);
});

test('documento é uma página completa para impressão A4', () => {
  const html = buildProgramHtml(data);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /@page\s*{\s*size:\s*A4/);
});

test('usa os ícones do app quando fornecidos (marca e tipo da mídia)', () => {
  const icon = (name) => `<i data-icon="${name}"></i>`;
  const typeIcons = { bible: 'book', video: 'video', image: 'image', interview: 'mic', theater: 'drama', other: 'file' };
  const html = buildProgramHtml(data, { icon, typeIcons });
  assert.match(html, /data-icon="play"/);
  assert.match(html, /data-icon="book"/);
  assert.match(html, /data-icon="image"/);
  assert.match(html, /data-icon="user"/);
});

test('cores do app são preservadas na impressão', () => {
  const html = buildProgramHtml(data);
  assert.match(html, /#f26a1b/i);
  assert.match(html, /print-color-adjust:\s*exact/);
});

test('roteiro não mostra o nome interno de arquivo de importações antigas', () => {
  const html = buildProgramHtml({ ...data, items: [{ scheduled_time: '08:00', title: 'P', speaker: '', description: '',
    medias: [{ type: 'image', title: 'FOTO-01.jpg', reference: '95c33726-1d91-4df6-9f0e-517cb885724f.jpg' }] }] });
  assert.doesNotMatch(html, /95c33726/);
});

test('roteiro mostra o número do discurso e não a sequência das partes', () => {
  const html = buildProgramHtml({ ...data, items: [
    { scheduled_time: '09:00', title: 'Abertura', speaker: '', description: '', medias: [] },
    { scheduled_time: '09:20', title: 'Discurso A', speaker: '', description: '', talk_number: 12, medias: [] }
  ] });
  assert.match(html, /Nº 12/);
  assert.doesNotMatch(html, /class="num">\s*1\s*</);
  assert.doesNotMatch(html, /class="num">\s*2\s*</);
});
