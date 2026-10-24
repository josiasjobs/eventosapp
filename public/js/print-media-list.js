(function (root) {
  'use strict';

  const mediaLabels = {
    bible: 'Bíblia',
    image: 'Imagem',
    video: 'Vídeo',
    interview: 'Entrevista',
    theater: 'Teatro',
    other: 'Conteúdo'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function detail(label, value) {
    if (!value) return '';
    return `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function renderMedia(media, index) {
    const completed = Boolean(media.completed);
    const status = completed ? 'Concluída' : 'Pendente';
    const type = mediaLabels[media.type] || mediaLabels.other;
    return `
      <li class="media-row ${completed ? 'is-complete' : 'is-pending'}">
        <span class="order">${index + 1}</span>
        <span class="status" aria-label="${status}">${completed ? '✓' : '○'}</span>
        <div class="media-main">
          <strong>${escapeHtml(media.title || 'Mídia sem título')}</strong>
          ${media.reference ? `<span class="reference">${escapeHtml(media.reference)}</span>` : ''}
        </div>
        <span class="type">${escapeHtml(type)}</span>
        <span class="status-text">${status}</span>
      </li>`;
  }

  function buildDocument(context) {
    const safeContext = context || {};
    const item = safeContext.item || {};
    const medias = Array.isArray(item.medias) ? item.medias : [];
    const completedCount = medias.filter(media => Boolean(media.completed)).length;
    const contextLine = [safeContext.dayLabel, safeContext.shiftName].filter(Boolean).map(escapeHtml).join(' · ');
    const items = medias.length
      ? medias.map(renderMedia).join('')
      : '<li class="empty">Nenhuma mídia cadastrada para esta parte.</li>';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lista de mídias — ${escapeHtml(item.title || 'Parte')}</title>
  <style>
    @page { size: A4; margin: 16mm 15mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #18212a; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.45; }
    .document { max-width: 180mm; margin: 0 auto; }
    .topline { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-bottom:10px; border-bottom:2px solid #18212a; }
    .brand { font-size: 15pt; font-weight: 800; letter-spacing: -.4px; }
    .generated { color:#5d6873; font-size:8.5pt; text-align:right; }
    .event { margin:17px 0 3px; font-size:10pt; font-weight:700; color:#40505d; }
    .context { color:#657482; font-size:9pt; }
    h1 { margin:8px 0 14px; max-width:125mm; font-size:25pt; line-height:1.08; letter-spacing:-.7px; }
    .details { display:flex; flex-wrap:wrap; gap:8px 22px; padding:11px 13px; border:1px solid #bbc5cc; border-radius:6px; background:#f6f8f9; }
    .detail { display:flex; gap:6px; align-items:baseline; }
    .detail span { color:#64717c; font-size:8.5pt; }
    .detail strong { font-size:9.5pt; }
    .summary { display:flex; align-items:baseline; justify-content:space-between; margin:22px 0 7px; }
    .summary h2 { margin:0; font-size:13pt; }
    .summary span { color:#53616d; font-size:9pt; }
    ol { margin:0; padding:0; border-top:1px solid #9eabb4; list-style:none; }
    .media-row { display:grid; grid-template-columns:8mm 7mm minmax(0, 1fr) 24mm 23mm; gap:7px; align-items:center; padding:10px 2px; border-bottom:1px solid #cbd3d8; break-inside:avoid; }
    .order { color:#687681; font-size:8.5pt; font-weight:700; text-align:center; }
    .status { width:5mm; height:5mm; display:inline-flex; align-items:center; justify-content:center; border:1.2px solid #485661; border-radius:50%; color:#18212a; font-size:8pt; font-weight:800; }
    .is-complete .status { background:#18212a; color:#fff; }
    .media-main { min-width:0; display:flex; flex-direction:column; gap:1px; }
    .media-main strong { font-size:10.5pt; overflow-wrap:anywhere; }
    .reference { color:#5e6d78; font-size:8.5pt; overflow-wrap:anywhere; }
    .type, .status-text { color:#43515d; font-size:8.5pt; }
    .type { font-weight:700; }
    .status-text { text-align:right; }
    .empty { padding:22px 2px; color:#5d6a75; font-style:italic; border-bottom:1px solid #cbd3d8; }
    footer { display:flex; justify-content:space-between; gap:12px; margin-top:18px; padding-top:8px; border-top:1px solid #cbd3d8; color:#687681; font-size:8pt; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
  <main class="document">
    <header>
      <div class="topline"><div class="brand">EventosAPP</div><div class="generated">Emitido em ${escapeHtml(safeContext.generatedAt || '')}</div></div>
      <div class="event">${escapeHtml(safeContext.eventName || 'Evento')}</div>
      ${contextLine ? `<div class="context">${contextLine}</div>` : ''}
      <h1>${escapeHtml(item.title || 'Parte sem título')}</h1>
      <div class="details">
        ${detail('Horário previsto:', item.scheduled_time)}
        ${detail('Responsável:', item.speaker)}
        <div class="detail"><span>Progresso:</span><strong>${completedCount} de ${medias.length} concluídas</strong></div>
      </div>
    </header>
    <section>
      <div class="summary"><h2>Lista de mídias</h2><span>${medias.length} ${medias.length === 1 ? 'mídia' : 'mídias'}</span></div>
      <ol>${items}</ol>
    </section>
    <footer><span>Lista operacional de mídias</span><span>EventosAPP</span></footer>
  </main>
</body>
</html>`;
  }

  const api = { escapeHtml, buildDocument };
  root.MediaListPrint = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
