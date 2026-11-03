/**
 * EventosAPP - Roteiro impresso do turno
 * Monta um documento A4 com todas as partes do turno e suas mídias (cada uma com ☐ para
 * marcar à caneta) e abre o diálogo de impressão do navegador ("Salvar como PDF").
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

  function formatDateTime(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // data: { eventName, dayLabel, shiftName, generatedAt: Date, items: [{ scheduled_time, title, speaker, description, medias: [{ type, title, reference }] }] }
  // opts: { icon(name, size) -> svg string, typeIcons: { [mediaType]: iconName } } — sem eles, só texto
  function buildProgramHtml(data, opts = {}) {
    const icon = opts.icon || (() => '');
    const typeIcons = opts.typeIcons || {};
    const context = [data.dayLabel, data.shiftName].filter(Boolean).join(' · ');
    const items = data.items || [];
    const mediaCount = items.reduce((n, i) => n + (i.medias || []).length, 0);

    const mediaHtml = (m) => {
      const type = TYPE_LABELS[m.type] ? m.type : 'other';
      return `
        <li class="media">
          <span class="box"></span>
          <span class="type">${icon(typeIcons[type], 16)}<span>${esc(TYPE_LABELS[type])}</span></span>
          <span class="media-text">
            <span class="media-title">${esc(m.title)}</span>
            ${m.reference ? `<span class="notes">${esc(m.reference)}</span>` : ''}
          </span>
        </li>`;
    };

    const partHtml = (item, index) => {
      const medias = item.medias || [];
      return `
        <section class="part">
          <div class="part-head">
            <span class="num">${index + 1}</span>
            <span class="time">${esc(item.scheduled_time)}</span>
            <span class="part-title">${esc(item.title)}</span>
          </div>
          ${item.speaker ? `<div class="meta">${icon('user', 14)}<span>${esc(item.speaker)}</span></div>` : ''}
          ${item.description ? `<div class="meta notes">${esc(item.description)}</div>` : ''}
          ${medias.length
            ? `<ul class="medias">${medias.map(mediaHtml).join('')}</ul>`
            : '<div class="empty">Sem mídias</div>'}
        </section>`;
    };

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(`Roteiro - ${data.eventName || ''} - ${context}`)}</title>
<style>
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
  .head-side { text-align: right; font-size: 8.5pt; color: var(--text-2); }
  .head-side strong { display: block; font-size: 10pt; color: var(--text); }

  .part { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px;
    border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius); }
  .part-head { display: flex; gap: 10px; align-items: baseline; padding: 6px 10px; background: var(--surface); }
  .num { color: var(--text-2); font-weight: 600; min-width: 1.4em; }
  .time { color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
  .part-title { font-weight: 700; font-size: 11.5pt; }
  .meta { display: flex; align-items: center; gap: 6px; padding: 4px 10px 0; font-size: 9.5pt; color: var(--text-2); }
  .notes { color: var(--text-2); font-size: 9pt; }

  .medias { list-style: none; margin: 4px 0 0; padding: 0 10px 4px; }
  .media { display: flex; gap: 10px; align-items: flex-start; padding: 5px 0; border-top: 1px solid var(--line); }
  .media:first-child { border-top: none; }
  .box { flex: none; width: 14px; height: 14px; margin-top: 2px; border: 1.5px solid var(--text-2); border-radius: 3px; }
  .type { flex: none; width: 6.4em; display: flex; align-items: center; gap: 4px; color: var(--text-2); font-size: 8.5pt; }
  .media-text { display: flex; flex-direction: column; min-width: 0; }
  .media-title { overflow-wrap: anywhere; }
  .empty { padding: 4px 10px 8px; font-size: 9.5pt; color: var(--text-2); font-style: italic; }
</style>
</head>
<body>
  <header>
    <div class="brand">${icon('play', 16)}</div>
    <div class="head-text">
      <h1>${esc(data.eventName)}</h1>
      <span class="chip">${esc(context)}</span>
    </div>
    <div class="head-side">
      <strong>${items.length} ${items.length === 1 ? 'parte' : 'partes'} · ${mediaCount} ${mediaCount === 1 ? 'mídia' : 'mídias'}</strong>
      Gerado em ${esc(formatDateTime(data.generatedAt))}
    </div>
  </header>
  ${items.map(partHtml).join('')}
</body>
</html>`;
  }

  // Abre o roteiro numa aba nova e chama a impressão. Retorna false se o navegador bloqueou a aba.
  function printProgram(data) {
    const win = window.open('', '_blank');
    if (!win) return false;
    win.document.open();
    win.document.write(buildProgramHtml(data, { icon: window.icon, typeIcons: window.MEDIA_TYPE_ICONS }));
    win.document.close();
    win.focus();
    win.onafterprint = () => win.close();
    // Espera o layout antes de imprimir (alguns navegadores imprimem a página em branco sem isso)
    win.setTimeout(() => win.print(), 300);
    return true;
  }

  return { buildProgramHtml, printProgram };
});
