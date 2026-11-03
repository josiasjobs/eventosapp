/**
 * EventosAPP - Roteiro impresso do turno
 * Monta um documento A4 com todas as partes do turno e suas mídias (cada uma com ☐ para
 * marcar à caneta) e abre o diálogo de impressão do navegador ("Salvar como PDF").
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

  function mediaHtml(m) {
    return `
      <li class="media">
        <span class="box"></span>
        <span class="type">${esc(TYPE_LABELS[m.type] || TYPE_LABELS.other)}</span>
        <span class="media-text">
          <span class="media-title">${esc(m.title)}</span>
          ${m.reference ? `<span class="notes">${esc(m.reference)}</span>` : ''}
        </span>
      </li>`;
  }

  function partHtml(item, index) {
    const medias = item.medias || [];
    return `
      <section class="part">
        <div class="part-head">
          <span class="num">${index + 1}</span>
          <span class="time">${esc(item.scheduled_time)}</span>
          <span class="part-title">${esc(item.title)}</span>
        </div>
        ${item.speaker ? `<div class="meta">${esc(item.speaker)}</div>` : ''}
        ${item.description ? `<div class="meta notes">${esc(item.description)}</div>` : ''}
        ${medias.length
          ? `<ul class="medias">${medias.map(mediaHtml).join('')}</ul>`
          : '<div class="empty">Sem mídias</div>'}
      </section>`;
  }

  // data: { eventName, dayLabel, shiftName, generatedAt: Date, items: [{ scheduled_time, title, speaker, description, medias: [{ type, title, reference }] }] }
  function buildProgramHtml(data) {
    const context = [data.dayLabel, data.shiftName].filter(Boolean).join(' · ');
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(`Roteiro - ${data.eventName || ''} - ${context}`)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; background: #fff; font: 11pt/1.35 system-ui, "Noto Sans", Roboto, "Segoe UI", sans-serif; }
  header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 16pt; margin: 0; }
  .context { font-size: 12pt; font-weight: 600; }
  .generated { font-size: 9pt; color: #444; }
  .part { break-inside: avoid; page-break-inside: avoid; padding: 8px 0; border-bottom: 1px solid #999; }
  .part-head { display: flex; gap: 8px; align-items: baseline; font-weight: 700; font-size: 12pt; }
  .num { min-width: 1.6em; }
  .time { font-variant-numeric: tabular-nums; }
  .meta { margin-left: 1.6em; font-size: 10pt; }
  .notes { color: #444; font-size: 9.5pt; }
  .medias { list-style: none; margin: 6px 0 0 1.6em; padding: 0; }
  .media { display: flex; gap: 8px; align-items: flex-start; padding: 3px 0; }
  .box { flex: none; width: 12px; height: 12px; margin-top: 3px; border: 1.5px solid #000; }
  .type { flex: none; width: 5.5em; font-size: 9.5pt; color: #333; }
  .media-text { display: flex; flex-direction: column; }
  .empty { margin: 4px 0 0 1.6em; font-size: 10pt; color: #444; font-style: italic; }
</style>
</head>
<body>
  <header>
    <h1>${esc(data.eventName)}</h1>
    <div class="context">${esc(context)}</div>
    <div class="generated">Gerado em ${esc(formatDateTime(data.generatedAt))}</div>
  </header>
  ${(data.items || []).map(partHtml).join('')}
</body>
</html>`;
  }

  // Abre o roteiro numa aba nova e chama a impressão. Retorna false se o navegador bloqueou a aba.
  function printProgram(data) {
    const win = window.open('', '_blank');
    if (!win) return false;
    win.document.open();
    win.document.write(buildProgramHtml(data));
    win.document.close();
    win.focus();
    win.onafterprint = () => win.close();
    // Espera o layout antes de imprimir (alguns navegadores imprimem a página em branco sem isso)
    win.setTimeout(() => win.print(), 300);
    return true;
  }

  return { buildProgramHtml, printProgram };
});
