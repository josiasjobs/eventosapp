/**
 * EventosAPP - Roteiro impresso do turno
 * Monta um documento A4 com todas as partes do turno e suas mídias (cada uma com ☐ para
 * marcar à caneta) e abre o diálogo de impressão do navegador ("Salvar como PDF").
 * A Sentinela tem folha própria: tabela ESQUERDA | DIREITA cujo cabeçalho repete a cada página.
 * Mesmo estilo do app (laranja, ícones de traço), sobre fundo branco.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.PrintProgram = factory(root.Logic);
})(this, function (Logic) {
  const esc = Logic.escapeHtml;

  const TYPE_LABELS = {
    bible: 'Bíblia', video: 'Vídeo', image: 'Imagem',
    interview: 'Entrevista', theater: 'Teatro', other: 'Outro'
  };

  const isSentinela = (item) => item.activity_type === 'sentinela';

  // Parts printed for each choice: the Sentinela only goes in its own sheet.
  function itemsFor(items, mode) {
    const list = items || [];
    if (mode === 'sentinela') return list.filter(isSentinela);
    const rest = list.filter(i => !isSentinela(i));
    return mode === 'talks' ? rest.filter(i => i.talk_number) : rest;
  }

  const SHARED_CSS = `
  @page { size: A4; margin: 12mm; }
  :root {
    --accent: #f26a1b; --text: #1a1a1a; --text-2: #6b6b6b;
    --line: #e2e2e2; --surface: #f4f4f4; --radius: 4px;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: var(--text); background: #fff;
    font: 10.5pt/1.4 system-ui, "Noto Sans", Roboto, "Segoe UI", sans-serif; }
  svg { flex: none; }

  header { display: flex; align-items: center; gap: 10px; padding-bottom: 8px;
    border-bottom: 2px solid var(--accent); margin-bottom: 12px; }
  .brand { width: 30px; height: 30px; border-radius: var(--radius); background: var(--accent); color: #fff;
    display: grid; place-items: center; }
  .head-text { flex: 1; min-width: 0; }
  h1 { font-size: 15pt; margin: 0; line-height: 1.2; }
  .chip { display: inline-block; margin-top: 3px; padding: 1px 8px; border: 1px solid var(--line);
    border-radius: var(--radius); font-weight: 600; font-size: 9.5pt; }
  .chip-accent { border-color: var(--accent); color: var(--accent); }

  .part-head { display: flex; gap: 10px; align-items: baseline; padding: 6px 10px; background: var(--surface); }
  .num { padding: 0 6px; border: 1px solid var(--text); border-radius: var(--radius); font-weight: 700;
    font-size: 9.5pt; white-space: nowrap; }
  .time { color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
  .part-title { font-weight: 700; font-size: 11.5pt; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; column-gap: 12px; row-gap: 2px;
    padding: 4px 10px 0; font-size: 9.5pt; color: var(--text-2); }
  .speaker { display: flex; align-items: center; gap: 6px; }
  .meta > * + * { padding-left: 12px; border-left: 1px solid var(--line); }
  .notes { color: var(--text-2); font-size: 9pt; }

  .box { flex: none; width: 14px; height: 14px; margin-top: 2px; border: 1.5px solid var(--text-2); border-radius: 3px; }
  .type { flex: none; width: 6.4em; display: flex; align-items: center; gap: 4px; color: var(--text-2); font-size: 8.5pt; }
  .media-text { display: flex; flex-direction: column; min-width: 0; }
  .media-title { overflow-wrap: anywhere; }
  .empty { padding: 4px 10px 8px; font-size: 9.5pt; color: var(--text-2); font-style: italic; }`;

  const PROGRAM_CSS = `
  .part { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px;
    border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius); }
  .medias { list-style: none; margin: 4px 0 0; padding: 0 10px 4px; }
  .media { display: flex; gap: 10px; align-items: flex-start; padding: 5px 0; border-top: 1px solid var(--line); }
  .media:first-child { border-top: none; }`;

  const SENTINELA_CSS = `
  .sent-part { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius);
    padding-bottom: 6px; margin-bottom: 10px; }
  table.sent { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { padding: 5px 4px; background: var(--surface); color: var(--text-2); font-size: 8pt;
    letter-spacing: 0.06em; border: 1px solid var(--line); }
  td { padding: 6px 4px; border: 1px solid var(--line); text-align: center; vertical-align: middle; }
  th.para, td.para { width: 2.6em; }
  td.para { font-weight: 700; color: var(--accent); font-size: 9pt; }
  .people { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; }
  .person { display: flex; flex-direction: column; align-items: center; line-height: 1.25; }
  .person span { color: var(--text-2); font-size: 9pt; }
  .cam { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; color: var(--text-2); font-size: 9pt; }
  .media-line { display: flex; gap: 10px; align-items: flex-start; text-align: left; }`;

  function pageHtml({ title, css, chips, body, icon }) {
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${SHARED_CSS}${css}
</style>
</head>
<body>
  <header>
    <div class="brand">${icon('play', 16)}</div>
    <div class="head-text">
      ${chips}
    </div>
  </header>
  ${body}
</body>
</html>`;
  }

  function makeHelpers(opts) {
    const icon = opts.icon || (() => '');
    const typeIcons = opts.typeIcons || {};
    // Box, type and title of a media (the body of a printed media row)
    const mediaInner = (m) => {
      const type = TYPE_LABELS[m.type] ? m.type : 'other';
      const notes = Logic.mediaNotesText(m);
      return `
          <span class="box"></span>
          <span class="type">${icon(typeIcons[type], 16)}<span>${esc(TYPE_LABELS[type])}</span></span>
          <span class="media-text">
            <span class="media-title">${esc(m.title)}</span>
            ${notes ? `<span class="notes">${esc(notes)}</span>` : ''}
          </span>`;
    };
    const partHeadHtml = (item, extraMeta = '') => `
          <div class="part-head">
            ${item.talk_number ? `<span class="num">Nº ${esc(item.talk_number)}</span>` : ''}
            <span class="time">${esc(item.scheduled_time)}</span>
            <span class="part-title">${esc(item.title)}</span>
          </div>
          ${item.speaker || item.description || extraMeta ? `<div class="meta">
            ${item.speaker ? `<span class="speaker">${icon('user', 14)}<span>${esc(item.speaker)}</span></span>` : ''}
            ${extraMeta}
            ${item.description ? `<span class="notes">${esc(item.description)}</span>` : ''}
          </div>` : ''}`;
    return { icon, mediaInner, partHeadHtml };
  }

  const contextOf = (data) => [data.dayLabel, data.shiftName].filter(Boolean).join(' · ');

  // data: { eventName, dayLabel, shiftName, mode?: 'all' | 'talks',
  //         items: [{ scheduled_time, title, speaker, description, talk_number, medias: [{ type, title, reference }] }] }
  // opts: { icon(name, size) -> svg string, typeIcons: { [mediaType]: iconName } } — sem eles, só texto
  function buildProgramHtml(data, opts = {}) {
    const { icon, mediaInner, partHeadHtml } = makeHelpers(opts);
    const context = contextOf(data);

    const partHtml = (item) => {
      const medias = item.medias || [];
      return `
        <section class="part">
          ${partHeadHtml(item)}
          ${medias.length
            ? `<ul class="medias">${medias.map(m => `<li class="media">${mediaInner(m)}</li>`).join('')}</ul>`
            : '<div class="empty">Sem mídias</div>'}
        </section>`;
    };

    return pageHtml({
      title: `Roteiro - ${data.eventName || ''} - ${context}`,
      css: PROGRAM_CSS,
      icon,
      chips: `<h1>${esc(data.eventName)}</h1>
      <span class="chip">${esc(context)}</span>
      ${data.mode === 'talks' ? '<span class="chip chip-accent">Somente discursos</span>' : ''}`,
      body: (data.items || []).map(partHtml).join('')
    });
  }

  // data: same as buildProgramHtml; items holds the shift's Sentinela (its steps in medias)
  function buildSentinelaHtml(data, opts = {}) {
    const { icon, mediaInner, partHeadHtml } = makeHelpers(opts);
    const context = contextOf(data);

    const rowHtml = (item, card) => {
      const para = `<td class="para">${card.paragraph ? `§${esc(card.paragraph)}` : ''}</td>`;
      if (card.kind === 'media') {
        return card.steps.map(m => `
          <tr>${para}<td colspan="2"><div class="media-line">${mediaInner(m)}</div></td></tr>`).join('');
      }
      // Same layout as the app: people on their side, the camera that films them on the opposite one
      const left = card.side === 'left';
      const cam = left ? item.cam_left : item.cam_right;
      const people = `<div class="people">${card.steps.map(s => `
            <span class="person"><strong>${esc(s.person)}</strong><span>${esc(s.title)}</span></span>`).join('')}</div>`;
      const camHtml = cam ? `<span class="cam">${icon('video', 14)}<span>CAM ${esc(cam)}</span></span>` : '';
      const [colL, colR] = left ? [people, camHtml] : [camHtml, people];
      return `
          <tr>${para}
            <td>${colL}</td>
            <td>${colR}</td>
          </tr>`;
    };

    const partHtml = (item) => {
      const steps = item.medias || [];
      return `
        <section class="sent-part">
          ${partHeadHtml(item, item.cam_speaker ? `<span class="notes">Orador CAM ${esc(item.cam_speaker)}</span>` : '')}
        </section>
        ${steps.length ? `<table class="sent">
          <thead><tr><th class="para"></th><th>ESQUERDA</th><th>DIREITA</th></tr></thead>
          <tbody>${Logic.groupSentinelaSteps(steps).map(c => rowHtml(item, c)).join('')}
          </tbody>
        </table>` : '<div class="empty">Sem passos</div>'}`;
    };

    return pageHtml({
      title: `Sentinela - ${data.eventName || ''} - ${context}`,
      css: SENTINELA_CSS,
      icon,
      chips: `<h1>${esc(data.eventName)}</h1>
      <span class="chip">${esc(context)}</span>
      <span class="chip chip-accent">Sentinela</span>`,
      body: (data.items || []).map(partHtml).join('')
    });
  }

  // Abre o roteiro numa aba nova e chama a impressão. Retorna false se o navegador bloqueou a aba.
  function printProgram(data) {
    const win = window.open('', '_blank');
    if (!win) return false;
    const opts = { icon: window.icon, typeIcons: window.MEDIA_TYPE_ICONS };
    win.document.open();
    win.document.write(data.mode === 'sentinela' ? buildSentinelaHtml(data, opts) : buildProgramHtml(data, opts));
    win.document.close();
    win.focus();
    win.onafterprint = () => win.close();
    // Espera o layout antes de imprimir (alguns navegadores imprimem a página em branco sem isso)
    win.setTimeout(() => win.print(), 300);
    return true;
  }

  return { buildProgramHtml, buildSentinelaHtml, itemsFor, printProgram };
});
