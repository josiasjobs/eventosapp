const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProgramHtml, buildSentinelaHtml, itemsFor } = require('../public/js/print-program.js');

const data = {
  eventName: 'Congresso 2026',
  dayLabel: 'Sábado',
  shiftName: 'Manhã',
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

test('cabeçalho traz evento e dia · turno, sem contagem nem data de emissão', () => {
  const html = buildProgramHtml(data);
  assert.match(html, /Congresso 2026/);
  assert.match(html, /Sábado · Manhã/);
  assert.doesNotMatch(html, /Gerado em|03\/11\/2026 09:05/);
  assert.doesNotMatch(html, /\d+ mídias?</);
});

test('observações da parte ficam na mesma linha do orador', () => {
  const html = buildProgramHtml(data);
  assert.match(html, /<div class="meta">[\s\S]*?João Silva[\s\S]*?Com vídeo[\s\S]*?<\/div>/);
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

test('roteiro só de discursos identifica isso no cabeçalho', () => {
  const html = buildProgramHtml({ ...data, mode: 'talks', items: [
    { scheduled_time: '09:20', title: 'Discurso A', speaker: '', description: '', talk_number: 12, medias: [] }
  ] });
  assert.match(html, /Somente discursos/);
});

test('roteiro completo não mostra o aviso de discursos', () => {
  assert.doesNotMatch(buildProgramHtml(data), /Somente discursos/);
});

const sentinela = {
  scheduled_time: '15:00', title: 'A Sentinela', speaker: '', description: '', talk_number: 3,
  activity_type: 'sentinela', cam_left: 1, cam_right: 3, cam_speaker: 2,
  medias: [
    { type: 'question', paragraph: 1, side: 'left', person: 'Pedro', title: 'A?' },
    { type: 'question', paragraph: 1, side: 'left', person: 'Jonas', title: 'B?' },
    { type: 'bible', paragraph: 2, title: 'Salmo 119:9', reference: '' },
    { type: 'question', paragraph: 2, side: 'right', person: 'Joana', title: '?' }
  ]
};

test('itemsFor: a Sentinela tem impressão própria, fora do roteiro e dos discursos', () => {
  const plain = { id: 1, talk_number: null, activity_type: '' };
  const talk = { id: 2, talk_number: 5, activity_type: '' };
  const sent = { id: 3, talk_number: 3, activity_type: 'sentinela' };
  const items = [plain, talk, sent];
  assert.deepEqual(itemsFor(items, 'all'), [plain, talk]);
  assert.deepEqual(itemsFor(items, 'talks'), [talk]);
  assert.deepEqual(itemsFor(items, 'sentinela'), [sent]);
  assert.deepEqual(itemsFor(undefined, 'all'), []);
});

test('Sentinela: tabela com ESQUERDA | DIREITA no cabeçalho (repete em cada página)', () => {
  const html = buildSentinelaHtml({ ...data, items: [sentinela] });
  assert.match(html, /<thead>[\s\S]*ESQUERDA[\s\S]*DIREITA[\s\S]*<\/thead>/);
  assert.match(html, /thead \{ display: table-header-group/);
  assert.match(html, /tr \{ break-inside: avoid/);
  assert.match(html, /Somente Sentinela|class="chip chip-accent">Sentinela/);
  assert.match(html, /Nº 3/);
  assert.match(html, /Orador CAM 2/);
});

test('Sentinela: pessoas no lado delas, câmera no oposto, ☐ só nas mídias', () => {
  const html = buildSentinelaHtml({ ...data, items: [sentinela] });
  assert.match(html, /§1<\/td>\s*<td[^>]*>[\s\S]*Pedro[\s\S]*A\?[\s\S]*Jonas[\s\S]*B\?[\s\S]*<\/td>\s*<td[^>]*>[\s\S]*CAM 1[\s\S]*?<\/td>/);
  assert.match(html, /<td[^>]*>[\s\S]*CAM 3[\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*Joana/);
  assert.match(html, /§2<\/td>\s*<td colspan="2">[\s\S]*Salmo 119:9/);
  assert.equal((html.match(/class="box"/g) || []).length, 1);
});

test('Sentinela: texto do banco é escapado', () => {
  const evil = { ...sentinela, medias: [{ type: 'question', paragraph: 1, side: 'left', person: '<b>X</b>', title: '"?"' }] };
  const html = buildSentinelaHtml({ ...data, items: [evil] });
  assert.doesNotMatch(html, /<b>X<\/b>/);
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt;/);
});

test('roteiro mostra "Camera - Preset" nas mídias de teatro e entrevista', () => {
  const html = buildProgramHtml({ ...data, items: [{ scheduled_time: '10:00', title: 'Drama', speaker: '', description: '',
    medias: [{ type: 'theater', title: 'Cena 1', reference: 'CAM 2 - P4' }] }] });
  assert.match(html, /Camera - Preset: CAM 2 - P4/);
});

const photo = 'data:image/webp;base64,UklGRg==';
const sentFotos = { ...sentinela, medias: [
  { type: 'question', paragraph: 1, side: 'left', person: 'Pedro', title: 'A?', photo },
  { type: 'question', paragraph: 1, side: 'left', person: 'Jonas', title: 'B?', photo: '' },
  { type: 'question', paragraph: 2, side: 'right', person: 'Joana', title: '?', photo: 'javascript:alert(1)' }
] };

test('Sentinela com fotos: <img> só para foto válida', () => {
  const html = buildSentinelaHtml({ ...data, withPhotos: true, items: [sentFotos] });
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(html, /<img [^>]*src="data:image\/webp;base64,UklGRg=="/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /width: 1\.8cm/);
});

test('Sentinela sem fotos: nenhuma <img>', () => {
  const html = buildSentinelaHtml({ ...data, withPhotos: false, items: [sentFotos] });
  assert.doesNotMatch(html, /<img /);
});

test('roteiro marca a parte do presidente', () => {
  const html = buildProgramHtml({ ...data, items: [
    { scheduled_time: '09:00', title: 'Presidente', speaker: 'Carlos', description: '', activity_type: 'presidente', medias: [] },
    { scheduled_time: '09:10', title: 'Discurso A', speaker: 'João', description: '', talk_number: 12, medias: [] }
  ] });
  assert.equal((html.match(/class="role">Presidente</g) || []).length, 1);
});
