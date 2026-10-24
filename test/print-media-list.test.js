const test = require('node:test');
const assert = require('node:assert/strict');

const { escapeHtml, buildDocument } = require('../public/js/print-media-list.js');

test('escapeHtml renders untrusted values as text', () => {
  assert.equal(escapeHtml('<script>alert("x")</script> & "ok"'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;ok&quot;');
});

test('buildDocument renders the operation context and media in its original order', () => {
  const html = buildDocument({
    eventName: 'Conferência Transformados',
    dayLabel: 'Dia 1 — Abertura',
    shiftName: 'Noite',
    generatedAt: '23/10/2026, 20:40',
    item: {
      title: 'Mensagem <principal>',
      scheduled_time: '20:40',
      speaker: 'Pr. Rafael',
      medias: [
        { title: 'Vinheta', type: 'video', reference: 'Projetor principal', completed: 1 },
        { title: 'João 3:16', type: 'bible', reference: '', completed: 0 }
      ]
    }
  });

  assert.match(html, /@page/);
  assert.match(html, /Conferência Transformados/);
  assert.match(html, /Mensagem &lt;principal&gt;/);
  assert.match(html, /Pr\. Rafael/);
  assert.ok(html.indexOf('Vinheta') < html.indexOf('João 3:16'));
  assert.match(html, /Concluída/);
  assert.match(html, /Pendente/);
});

test('buildDocument renders a useful empty state and omits unavailable metadata', () => {
  const html = buildDocument({
    eventName: 'Evento',
    dayLabel: '',
    shiftName: '',
    generatedAt: '23/10/2026, 20:40',
    item: { title: 'Avisos', scheduled_time: '', speaker: '', medias: [] }
  });

  assert.match(html, /Nenhuma mídia cadastrada para esta parte\./);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /Responsável:/);
});
