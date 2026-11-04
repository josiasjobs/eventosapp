/**
 * EventosAPP - Director Mode UI Controller
 * Renders the current part, the program list and the bottom navigation bar.
 * Clicks are handled by event delegation on the containers (ids live in data-* attributes).
 */

const uiEsc = (value) => Logic.escapeHtml(value);

// Icon-only button helper (title + aria-label in Portuguese).
const uiIconButton = (iconName, label, attrs = '', extraClass = '') =>
  `<button type="button" class="icon-btn ${extraClass}" title="${uiEsc(label)}" aria-label="${uiEsc(label)}" ${attrs}>${icon(iconName)}</button>`;

const UIDirector = {
  // Foto do participante (so se valida) ou, sem ela, as iniciais
  photoHtml(step, cls) {
    if (step.photo && Logic.isValidPhoto(step.photo)) {
      return `<img class="${cls}" src="${uiEsc(step.photo)}" alt="">`;
    }
    return `<span class="${cls}" aria-hidden="true">${uiEsc(Logic.initials(step.person))}</span>`;
  },

  // Media type -> label + icon name
  getMediaTypeInfo(type) {
    const labels = {
      bible: 'Bíblia',
      image: 'Imagem',
      video: 'Vídeo',
      interview: 'Entrevista',
      theater: 'Teatro'
    };
    const known = Object.prototype.hasOwnProperty.call(labels, type);
    return {
      label: known ? labels[type] : 'Conteúdo',
      icon: (window.MEDIA_TYPE_ICONS && MEDIA_TYPE_ICONS[known ? type : 'other']) || 'file'
    };
  },

  // Render whole view
  render() {
    // A long-press drag owns the DOM rows until it ends; render once it is over.
    if (this._dragging) { this._renderPending = true; return; }
    this.bindEvents();
    this.renderShiftLabel();
    this.renderSpotlight();
    this.renderTimeline();
    this.renderNavigationToolbar();
  },

  // "Dia · Turno" label in the top bar chip
  renderShiftLabel() {
    const labelEl = document.getElementById('shift-label');
    if (!labelEl) return;
    const day = (AppState.days || []).find(d => d.id === AppState.selectedDayId);
    const shift = day && (day.shifts || []).find(s => s.id === AppState.selectedShiftId);
    labelEl.textContent = day && shift ? `${day.label} · ${shift.name}` : 'Sem turno';
  },

  // "Nº 12" before the title of a talk part
  talkBadgeHtml(item) {
    return item.talk_number ? `<span class="talk-badge">Nº ${uiEsc(item.talk_number)}</span>` : '';
  },

  // Empty state: icon + short sentence (adding is done with the floating + in edit mode)
  emptyStateHtml(iconName, text) {
    return `
      <div class="empty-state">
        <span class="empty-state-icon">${icon(iconName, 32)}</span>
        <p>${uiEsc(text)}</p>
      </div>
    `;
  },

  // 1. Current part (title, details, notes, medias)
  renderSpotlight() {
    const spotlightContainer = document.getElementById('spotlight-container');
    if (!spotlightContainer) return;

    const currentItem = AppState.getCurrentItem();
    const items = AppState.shiftData.items || [];

    if (!currentItem) {
      spotlightContainer.innerHTML = items.length === 0
        ? this.emptyStateHtml('list', 'Sem partes neste turno')
        : this.emptyStateHtml('list', 'Escolha uma parte na programação');
      return;
    }

    const medias = currentItem.medias || [];
    const status = Logic.itemStatus(currentItem);
    const itemId = Number(currentItem.id);

    const sentinela = this.isSentinelaWithSteps(currentItem);
    const stepId = sentinela ? AppState.getStepId(currentItem) : null;
    let mediasHtml;
    if (sentinela) {
      mediasHtml = AppState.mode === 'editor'
        ? this.sentinelaEditListHtml(currentItem, stepId)
        : this.sentinelaCardsHtml(currentItem, stepId);
    } else {
      mediasHtml = medias.length === 0
        ? this.emptyStateHtml('file', currentItem.activity_type === 'sentinela' ? 'Sem passos' : 'Sem mídias')
        : medias.map(media => this.mediaRowHtml(media)).join('');
    }
    const speakerCam = sentinela && this.hasCam(currentItem.cam_speaker)
      ? `<span class="meta-item">${icon('video', 16)}<span>Orador CAM ${uiEsc(currentItem.cam_speaker)}</span></span>`
      : '';

    spotlightContainer.innerHTML = `
      <article class="current-part" data-item-id="${itemId}">
        <div class="current-head">
          <h1 class="current-title" id="current-item-title">${this.talkBadgeHtml(currentItem)}${uiEsc(currentItem.title)}</h1>
          <button type="button" class="dot dot-lg is-${status}" data-action="toggle-item" data-item-id="${itemId}"
                  title="${status === 'done' ? 'Marcar parte como pendente' : 'Marcar parte como concluída'}"
                  aria-label="${status === 'done' ? 'Marcar parte como pendente' : 'Marcar parte como concluída'}"
                  aria-pressed="${status === 'done'}"></button>
        </div>

        <div class="current-meta">
          ${currentItem.scheduled_time ? `<span class="meta-item tnum">${icon('clock', 16)}<span>${uiEsc(currentItem.scheduled_time)}</span></span>` : ''}
          ${currentItem.speaker ? `<span class="meta-item">${icon('user', 16)}<span>${uiEsc(currentItem.speaker)}</span></span>` : ''}
          ${speakerCam}
        </div>

        ${currentItem.description ? `<p class="current-notes">${uiEsc(currentItem.description)}</p>` : ''}

        <div class="media-list${sentinela ? ' sent-list' : ''}" id="medias-checklist-list">
          ${mediasHtml}
        </div>
      </article>
    `;

    // Bring the current step into view only when it changed since this part was last drawn.
    if (sentinela) {
      const last = this._lastStepByItem || (this._lastStepByItem = {});
      if (last[itemId] !== stepId) {
        last[itemId] = stepId;
        const target = spotlightContainer.querySelector('.sent-card.is-current, .is-current[data-media-id]');
        if (target && target.offsetParent !== null) target.scrollIntoView({ block: 'nearest' });
      }
    }
  },

  // Media row with the manual ☐ (plain parts, Sentinela media cards and the Sentinela edit list)
  mediaRowHtml(media, extraClass = '') {
    const typeInfo = this.getMediaTypeInfo(media.type);
    const done = !!media.completed;
    const notes = Logic.mediaNotesText(media);
    return `
          <div class="media-row${done ? ' is-done' : ''}${extraClass}" data-media-id="${Number(media.id)}"
               role="button" tabindex="0" aria-pressed="${done}">
            <span class="check-circle${done ? ' is-done' : ''}">${icon('check', 16)}</span>
            <span class="media-type-icon" title="${uiEsc(typeInfo.label)}">${icon(typeInfo.icon)}</span>
            <span class="media-text">
              <span class="media-title">${uiEsc(media.title)}</span>
              ${notes ? `<span class="media-notes">${uiEsc(notes)}</span>` : ''}
            </span>
            ${uiIconButton('more', 'Ações da mídia', 'data-action="media-menu" aria-haspopup="menu" aria-expanded="false"', 'more-btn edit-only')}
          </div>
        `;
  },

  // ==========================================
  // SENTINELA: cards in director mode, flat list in edit mode
  // ==========================================
  isSentinelaWithSteps(item) {
    return !!(item && item.activity_type === 'sentinela' && (item.medias || []).length > 0);
  },

  hasCam(cam) {
    return cam !== null && cam !== undefined && String(cam).trim() !== '';
  },

  // The camera that films a side: cam_left films the left side, cam_right the right one
  sideCam(item, side) {
    const cam = side === 'left' ? item.cam_left : item.cam_right;
    return this.hasCam(cam) ? cam : null;
  },

  sideLabel(side) {
    return side === 'left' ? 'ESQUERDA' : 'DIREITA';
  },

  paragraphHtml(paragraph) {
    return paragraph != null ? `<span class="sent-para">§${uiEsc(paragraph)}</span>` : '';
  },

  sentinelaCardsHtml(item, stepId) {
    const cardsHtml = Logic.groupSentinelaSteps(item.medias).map(group => {
      const isCurrent = group.steps.some(s => s.id === stepId);
      const cardClass = `sent-card${isCurrent ? ' is-current' : ''}${group.paragraph != null ? ' has-para' : ''}`;

      if (group.kind === 'media') {
        return `
          <div class="${cardClass} sent-card-media">
            ${this.paragraphHtml(group.paragraph)}
            ${this.mediaRowHtml(group.steps[0])}
          </div>
        `;
      }

      const peopleHtml = group.steps.map(step => {
        const current = step.id === stepId;
        return `
          <div class="sent-person${current ? ' is-current' : ''}" data-media-id="${Number(step.id)}"
               role="button" tabindex="0"${current ? ' aria-current="step"' : ''}>
            <span class="sent-name">${uiEsc(step.person)}</span>
            ${this.photoHtml(step, 'sent-photo')}
            <span class="sent-text">${uiEsc(step.title)}</span>
          </div>
        `;
      }).join('');
      const cam = this.sideCam(item, group.side);
      const camHtml = cam === null ? '' : `
        <span class="sent-cam${isCurrent ? ' is-current' : ''}">${icon('video', 28)}<span>CAM ${uiEsc(cam)}</span></span>
      `;
      const peopleCol = `<div class="sent-col sent-people">${peopleHtml}</div>`;
      const camCol = `<div class="sent-col sent-cam-col">${camHtml}</div>`;
      return `
        <div class="${cardClass} side-${group.side === 'left' ? 'left' : 'right'}">
          ${this.paragraphHtml(group.paragraph)}
          ${group.side === 'left' ? peopleCol + camCol : camCol + peopleCol}
        </div>
      `;
    }).join('');

    return `
      <div class="sent-cols" aria-hidden="true"><span>ESQUERDA</span><span>DIREITA</span></div>
      <div class="sent-cards">${cardsHtml}</div>
    `;
  },

  // Edit mode: one flat list (headers + rows share a parent) so long-press reorder can move any step.
  sentinelaEditListHtml(item, stepId) {
    return Logic.groupSentinelaSteps(item.medias).map(group => {
      let head = '';
      if (group.kind === 'question') {
        const cam = this.sideCam(item, group.side);
        const parts = [group.paragraph != null ? `§${group.paragraph}` : '', this.sideLabel(group.side), cam !== null ? `CAM ${cam}` : '']
          .filter(Boolean).join(' · ');
        const preset = `data-paragraph="${group.paragraph != null ? Number(group.paragraph) : ''}" data-side="${uiEsc(group.side)}" data-after-id="${Number(group.steps[group.steps.length - 1].id)}"`;
        head = `
          <div class="sent-head">
            <span class="sent-head-label">${uiEsc(parts)}</span>
            ${uiIconButton('plus', 'Adicionar pergunta neste cartão', `data-action="add-question" ${preset}`)}
          </div>
        `;
      } else if (group.paragraph != null) {
        head = `<div class="sent-head"><span class="sent-head-label">§${uiEsc(group.paragraph)}</span></div>`;
      }

      const rows = group.steps.map(step => {
        const current = step.id === stepId;
        if (group.kind === 'media') return this.mediaRowHtml(step, current ? ' is-current' : '');
        return `
          <div class="row step-row${current ? ' is-current' : ''}" data-media-id="${Number(step.id)}"
               role="button" tabindex="0"${current ? ' aria-current="step"' : ''}>
            ${this.photoHtml(step, 'step-photo')}
            <span class="media-text">
              <span class="media-title">${uiEsc(step.person)}</span>
              <span class="media-notes">${uiEsc(step.title)}</span>
            </span>
            ${uiIconButton('more', 'Ações da pergunta', 'data-action="step-menu" aria-haspopup="menu" aria-expanded="false"', 'more-btn')}
          </div>
        `;
      }).join('');
      return head + rows;
    }).join('');
  },

  // 2. Program list (left column on tablet, drawer on phone)
  renderTimeline() {
    const timelineContainer = document.getElementById('timeline-container');
    const modalTimelineContainer = document.getElementById('timeline-modal-container');
    if (!timelineContainer && !modalTimelineContainer) return;

    const items = AppState.shiftData.items || [];
    const currentItemId = AppState.currentItemId;

    const rowsHtml = items.map(item => {
      const id = Number(item.id);
      const isCurrent = item.id === currentItemId;
      const status = Logic.itemStatus(item);
      const label = status === 'done' ? 'Marcar parte como pendente' : 'Marcar parte como concluída';
      return `
        <div class="row part-row${isCurrent ? ' is-current' : ''}${status === 'done' ? ' is-done' : ''}"
             data-item-id="${id}" role="button" tabindex="0"${isCurrent ? ' aria-current="true"' : ''}>
          <span class="part-time tnum">${uiEsc(item.scheduled_time)}</span>
          <span class="part-title">${this.talkBadgeHtml(item)}${uiEsc(item.title)}</span>
          ${uiIconButton('more', 'Ações da parte', 'data-action="item-menu" aria-haspopup="menu" aria-expanded="false"', 'more-btn edit-only')}
          <button type="button" class="dot is-${status}" data-action="toggle-item"
                  title="${label}" aria-label="${label}" aria-pressed="${status === 'done'}"></button>
        </div>
      `;
    }).join('');

    const listHtml = items.length === 0
      ? this.emptyStateHtml('list', 'Sem partes neste turno')
      : `<div class="part-list">${rowsHtml}</div>`;

    // Scroll only when the shift or the current part changes, so re-renders
    // (media/part toggles, WS updates) never pull a scrolled list back.
    const scrollKey = `${AppState.selectedShiftId}:${currentItemId}`;
    const shouldScroll = scrollKey !== this._lastScrollKey;
    this._lastScrollKey = scrollKey;

    [timelineContainer, modalTimelineContainer].forEach(container => {
      if (!container) return;
      container.innerHTML = listHtml;
      if (shouldScroll) this.scrollToCurrent(container);
    });
  },

  scrollToCurrent(container) {
    const current = container && container.querySelector('.row.is-current');
    if (current && current.offsetParent !== null) current.scrollIntoView({ block: 'nearest' });
  },

  // 3. Bottom bar: prev, list, next (list only on phone)
  renderNavigationToolbar() {
    const navContainer = document.getElementById('director-nav-container');
    if (!navContainer) return;

    const items = AppState.shiftData.items || [];
    const currentIndex = items.findIndex(i => i.id === AppState.currentItemId);

    const stepPrev = this._hasStep('prev');
    const stepNext = this._hasStep('next');
    const hasPrev = stepPrev || currentIndex > 0;
    const hasNext = stepNext || (currentIndex !== -1 && currentIndex < items.length - 1);
    const prevLabel = stepPrev ? 'Passo anterior' : 'Parte anterior';
    const nextLabel = stepNext ? 'Próximo passo' : 'Próxima parte';

    navContainer.innerHTML = `
      ${uiIconButton('chevron-left', prevLabel, `id="btn-nav-prev" data-action="prev"${hasPrev ? '' : ' disabled'}`, 'nav-btn')}
      ${uiIconButton('list', 'Programação', 'id="btn-open-schedule-modal" data-action="open-list"', 'nav-btn phone-only')}
      ${uiIconButton('chevron-right', nextLabel, `id="btn-nav-next" data-action="next"${hasNext ? '' : ' disabled'}`, 'nav-btn nav-next btn-accent')}
    `;
  },

  // Event delegation (bound once; containers persist across renders)
  bindEvents() {
    if (this._bound) return;
    this._bound = true;

    ['timeline-container', 'timeline-modal-container'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', (e) => this.onListClick(e));
      this.enableLongPressReorder(el, '.part-row[data-item-id]', (ids) => this.reorderParts(ids));
    });

    const spotlight = document.getElementById('spotlight-container');
    if (spotlight) {
      spotlight.addEventListener('click', (e) => this.onSpotlightClick(e));
      this.enableLongPressReorder(spotlight, '.media-row[data-media-id], .step-row[data-media-id]', (ids) => this.reorderMedias(ids));
    }

    this.bindFab();
    this.bindOverlayDismiss();

    const nav = document.getElementById('director-nav-container');
    if (nav) nav.addEventListener('click', (e) => this.onNavClick(e));

    // Enter/Space on focusable rows behaves like a tap
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target;
      if (t && t.matches && t.matches('.part-row[data-item-id], .media-row[data-media-id], .step-row[data-media-id], .sent-person[data-media-id]')) {
        e.preventDefault();
        t.click();
      }
    });
  },

  onListClick(e) {
    const actionEl = e.target.closest('[data-action]');
    const row = e.target.closest('.row[data-item-id]');
    const action = actionEl ? actionEl.dataset.action : null;

    if (!row) return;

    const itemId = Number(row.dataset.itemId);
    if (actionEl && row.contains(actionEl)) {
      e.stopPropagation();
      switch (action) {
        case 'toggle-item': this.toggleItemDot(itemId); break;
        case 'item-menu': this.openItemMenu(actionEl, itemId); break;
      }
      return;
    }

    this.handleTimelineItemClick(itemId);
  },

  onSpotlightClick(e) {
    const part = e.target.closest('.current-part[data-item-id]');
    const itemId = part ? Number(part.dataset.itemId) : null;
    const actionEl = e.target.closest('[data-action]');
    const mediaRow = e.target.closest('.media-row[data-media-id]');
    const mediaId = mediaRow ? Number(mediaRow.dataset.mediaId) : null;
    const stepEl = e.target.closest('.sent-person[data-media-id], .step-row[data-media-id]');
    const stepId = stepEl ? Number(stepEl.dataset.mediaId) : null;

    if (actionEl) {
      switch (actionEl.dataset.action) {
        case 'toggle-item': if (itemId) this.toggleItemDot(itemId); break;
        case 'media-menu': if (itemId && mediaId) this.openMediaMenu(actionEl, itemId, mediaId); break;
        case 'step-menu': if (itemId && stepId) this.openQuestionMenu(actionEl, itemId, stepId); break;
        case 'add-question': {
          const paragraph = actionEl.dataset.paragraph ? Number(actionEl.dataset.paragraph) : null;
          if (itemId) Modals.openQuestionModal(itemId, null, {
            paragraph, side: actionEl.dataset.side, afterId: Number(actionEl.dataset.afterId) || null
          });
          break;
        }
      }
      return;
    }

    // Sentinela: a tap on a person or media moves the current step there (a media also toggles its ☐)
    const item = itemId ? this._findItem(itemId) : null;
    const tappedStep = stepId || mediaId;
    if (tappedStep && this.isSentinelaWithSteps(item) && AppState.getStepId(item) !== tappedStep) {
      AppState.setStepId(itemId, tappedStep);
    }
    if (mediaId) this.handleMediaClick(mediaId);
  },

  onNavClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl || actionEl.disabled) return;
    switch (actionEl.dataset.action) {
      case 'prev': this.navigatePrevious(); break;
      case 'next': this.navigateNext(); break;
      case 'open-list':
        Modals.open('modal-schedule-picker');
        this.scrollToCurrent(document.getElementById('timeline-modal-container'));
        break;
    }
  },

  // User Actions
  toggleItemDot(itemId) {
    const item = this._findItem(itemId);
    if (item) this.setItemCompleted(item.id, !item.completed);
  },

  _findItem(itemId) {
    const items = AppState.shiftData && AppState.shiftData.items;
    return items ? items.find(i => i.id === Number(itemId)) || null : null;
  },

  _findMedia(mediaId) {
    const items = (AppState.shiftData && AppState.shiftData.items) || [];
    for (const item of items) {
      const media = (item.medias || []).find(m => m.id === Number(mediaId));
      if (media) return { item, media };
    }
    return null;
  },

  _mediaInFlight: new Set(),

  async handleMediaClick(mediaId) {
    mediaId = Number(mediaId);
    if (this._mediaInFlight.has(mediaId)) return;
    const found = this._findMedia(mediaId);
    if (!found) return;
    const { item, media } = found;
    const before = Boolean(media.completed);
    const itemBefore = Boolean(item.completed);

    this._mediaInFlight.add(mediaId);
    try {
      // Optimistic update of the media and of the part (WS echoes re-apply the same values).
      AppState.toggleMediaCompleted(mediaId, !before);
      const optimistic = Logic.itemCompletionAfterToggle(item.medias, itemBefore, !before);
      if (optimistic !== null) AppState.toggleItemCompleted(item.id, optimistic);

      let resp;
      try {
        resp = await Api.toggleMediaCompleted(mediaId);
      } catch (err) {
        AppState.toggleMediaCompleted(mediaId, before);
        const cur = this._findItem(item.id);
        if (optimistic !== null && cur && Boolean(cur.completed) === optimistic) {
          AppState.toggleItemCompleted(item.id, itemBefore);
        }
        window.showToast(err.message, 'error');
        return;
      }

      const nowCompleted = resp && typeof resp.completed === 'boolean' ? resp.completed : !before;
      AppState.toggleMediaCompleted(mediaId, nowCompleted);

      // shiftData may have been replaced during the request: decide from the fresh item.
      const fresh = this._findItem(item.id);
      if (!fresh) return;
      if (fresh === item) {
        const target = Logic.itemCompletionAfterToggle(fresh.medias, itemBefore, nowCompleted);
        if (target !== null) await this.setItemCompleted(fresh.id, target, { applied: true });
      } else {
        const target = Logic.itemCompletionAfterToggle(fresh.medias, Boolean(fresh.completed), nowCompleted);
        if (target !== null) await this.setItemCompleted(fresh.id, target);
      }
    } finally {
      this._mediaInFlight.delete(mediaId);
    }
  },

  // Sets a part to the desired state. The server route flips, so re-read state first and
  // only call when it differs; converge once if another device flipped in between.
  // opts.applied: the local state was already set optimistically, so persist without the equality skip.
  async setItemCompleted(itemId, desired, opts = {}) {
    const item = this._findItem(itemId);
    if (!item) return;
    if (!opts.applied) {
      if (Boolean(item.completed) === desired) return;
      AppState.toggleItemCompleted(item.id, desired);
    }
    try {
      const resp = await Api.toggleItemCompleted(item.id);
      if (resp && typeof resp.completed === 'boolean' && resp.completed !== desired) {
        const resp2 = await Api.toggleItemCompleted(item.id);
        AppState.toggleItemCompleted(item.id, resp2 && typeof resp2.completed === 'boolean' ? resp2.completed : desired);
      }
    } catch (err) {
      AppState.toggleItemCompleted(item.id, !desired);
      window.showToast(err.message, 'error');
    }
  },

  handleTimelineItemClick(itemId) {
    // Fecha modal caso aberto (seleção manual)
    Modals.close('modal-schedule-picker');
    this.setCurrentItem(itemId);
  },

  setCurrentItem(itemId) {
    AppState.setCurrentItemId(itemId);
    this.render();
  },

  // Inside a Sentinela with steps, moves the current step; returns false when it must leave the part.
  _moveStep(dir) {
    const item = AppState.getCurrentItem();
    if (!this.isSentinelaWithSteps(item)) return false;
    const nav = Logic.stepNav(item.medias.map(m => m.id), AppState.getStepId(item), dir);
    if (nav.stepId == null) return false;
    AppState.setStepId(item.id, nav.stepId);
    return true;
  },

  // Is there a step to go to in that direction inside the current part?
  _hasStep(dir) {
    const item = AppState.getCurrentItem();
    if (!this.isSentinelaWithSteps(item)) return false;
    return Logic.stepNav(item.medias.map(m => m.id), AppState.getStepId(item), dir).stepId != null;
  },

  navigatePrevious() {
    if (this._moveStep('prev')) return;
    const items = AppState.shiftData.items || [];
    const currentIndex = items.findIndex(i => i.id === AppState.currentItemId);
    if (currentIndex > 0) {
      this.setCurrentItem(items[currentIndex - 1].id);
    }
  },

  navigateNext() {
    if (this._moveStep('next')) return;
    const items = AppState.shiftData.items || [];
    const currentIndex = items.findIndex(i => i.id === AppState.currentItemId);
    if (currentIndex !== -1 && currentIndex < items.length - 1) {
      this.setCurrentItem(items[currentIndex + 1].id);
    }
  },

  // Edit mode: deletions (confirmed with two taps by confirmDelete)
  async deleteItem(itemId) {
    try {
      await Api.deleteItem(itemId);
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async importPlaylist(itemId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jwlplaylist';
    input.style.display = 'none';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // Parte com mídias: perguntar se substitui ou adiciona abaixo da última
      const item = this._findItem(itemId);
      // Sentinela: only medias count, and Substituir keeps the questions
      const count = item && item.medias ? item.medias.filter(Logic.isMediaStep).length : 0;
      const keepsQuestions = item && item.activity_type === 'sentinela'
        ? ' As perguntas continuam; Substituir troca só as mídias.' : '';
      const mode = count === 0 ? 'append' : await Modals.askChoice({
        title: 'Importar playlist',
        text: `Esta parte já tem ${count} ${count === 1 ? 'mídia' : 'mídias'}.${keepsQuestions}`,
        options: [
          { value: 'append', label: 'Adicionar abaixo', icon: 'plus', style: 'accent' },
          { value: 'replace', label: 'Substituir', icon: 'trash', style: 'danger' }
        ]
      });
      if (!mode) return;
      const ev = new CustomEvent('import-playlist', { detail: { itemId, file, mode } });
      window.dispatchEvent(ev);
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  },

  async deleteMedia(mediaId) {
    try {
      await Api.deleteMedia(mediaId);
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // EDIT MODE: row menu (⋯), two-tap delete, floating +, long-press reorder
  // ==========================================
  ARM_MS: 3000,
  HOLD_MS: 500,
  SLOP_PX: 10,

  openItemMenu(anchorEl, itemId) {
    this.openRowMenu(anchorEl, [
      { icon: 'pencil', label: 'Editar parte', onClick: () => Modals.openItemModal(itemId) },
      { icon: 'download', label: 'Importar playlist', onClick: () => this.importPlaylist(itemId) },
      { icon: 'trash', label: 'Excluir parte', danger: true, onClick: () => this.deleteItem(itemId) }
    ]);
  },

  openMediaMenu(anchorEl, itemId, mediaId) {
    this.openRowMenu(anchorEl, [
      { icon: 'pencil', label: 'Editar mídia', onClick: () => Modals.openMediaModal(itemId, mediaId) },
      { icon: 'trash', label: 'Excluir mídia', danger: true, onClick: () => this.deleteMedia(mediaId) }
    ]);
  },

  openQuestionMenu(anchorEl, itemId, stepId) {
    this.openRowMenu(anchorEl, [
      { icon: 'pencil', label: 'Editar pergunta', onClick: () => Modals.openQuestionModal(itemId, stepId) },
      { icon: 'trash', label: 'Excluir pergunta', danger: true, onClick: () => this.deleteMedia(stepId) }
    ]);
  },

  // One floating menu at a time, appended to <body>, placed next to anchorEl and kept inside the screen.
  // actions: [{ icon, label, onClick, danger? }]. A danger action arms (two-tap) and keeps the menu open.
  openRowMenu(anchorEl, actions) {
    const skip = this._menuSkip;
    this._menuSkip = null;
    // Tapping the same ⋯ again closes it (the outside pointerdown already closed it).
    if (skip && skip.el === anchorEl && Date.now() < skip.until) return;
    if (this._menu && this._menu.anchor === anchorEl) { this.closeRowMenu(); return; }
    this.closeRowMenu();

    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn row-menu-item' + (action.danger ? ' is-danger' : '');
      btn.title = action.label;
      btn.setAttribute('aria-label', action.label);
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = icon(action.icon);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (action.danger) {
          this.confirmDelete(btn, async () => {
            this.closeRowMenu();
            await action.onClick();
          });
          return;
        }
        this.closeRowMenu();
        action.onClick();
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    const pos = Logic.menuPosition(anchorEl.getBoundingClientRect(), menu.offsetWidth, menu.offsetHeight,
      window.innerWidth, window.innerHeight);
    menu.style.left = `${pos.left}px`;
    menu.style.top = `${pos.top}px`;
    anchorEl.setAttribute('aria-expanded', 'true');
    this._menu = { el: menu, anchor: anchorEl };
  },

  closeRowMenu() {
    const m = this._menu;
    if (!m) return;
    this._menu = null;
    if (this._armed && m.el.contains(this._armed.el)) this._disarm();
    m.anchor.setAttribute('aria-expanded', 'false');
    m.el.remove();
  },

  // Two-tap delete: 1st tap arms (.is-armed, red + pulse) for ARM_MS; 2nd tap on the same button
  // within that window runs onConfirm. Tapping elsewhere or waiting disarms.
  confirmDelete(buttonEl, onConfirm) {
    const armed = this._armed;
    if (armed && armed.el === buttonEl) {
      this._disarm();
      return Promise.resolve()
        .then(onConfirm)
        .catch(err => window.showToast(err && err.message ? err.message : String(err), 'error'));
    }
    this._disarm();
    buttonEl.classList.add('is-armed');
    const onOutside = (e) => {
      if (!buttonEl.contains(e.target)) this._disarm();
    };
    document.addEventListener('pointerdown', onOutside, true);
    this._armed = {
      el: buttonEl,
      onOutside,
      timer: setTimeout(() => this._disarm(), this.ARM_MS)
    };
    return Promise.resolve();
  },

  _disarm() {
    const armed = this._armed;
    if (!armed) return;
    this._armed = null;
    clearTimeout(armed.timer);
    document.removeEventListener('pointerdown', armed.onOutside, true);
    armed.el.classList.remove('is-armed');
  },

  // Floating + (edit mode only): Parte / Mídia (Mídia needs a current part)
  bindFab() {
    const fab = document.getElementById('fab-add');
    const menu = document.getElementById('fab-menu');
    if (!fab || !menu) return;
    fab.addEventListener('click', () => {
      if (menu.hidden) this.openFabMenu(); else this.closeFabMenu();
    });
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-fab]');
      if (!opt || opt.disabled) return;
      this.closeFabMenu();
      if (opt.dataset.fab === 'item') Modals.openItemModal();
      else if (opt.dataset.fab === 'sentinela') Modals.openItemModal(null, { sentinela: true });
      else if (opt.dataset.fab === 'question' && AppState.currentItemId) {
        // prefill § and side from the last question; no afterId, so it appends
        const cur = AppState.getCurrentItem();
        const last = ((cur && cur.medias) || []).filter(m => m.type === 'question').pop();
        Modals.openQuestionModal(AppState.currentItemId, null, last ? { paragraph: last.paragraph, side: last.side } : {});
      }
      else if (opt.dataset.fab === 'media' && AppState.currentItemId) Modals.openMediaModal(AppState.currentItemId);
    });
  },

  openFabMenu() {
    const fab = document.getElementById('fab-add');
    const menu = document.getElementById('fab-menu');
    if (!fab || !menu) return;
    const mediaOpt = menu.querySelector('[data-fab="media"]');
    if (mediaOpt) mediaOpt.disabled = !AppState.getCurrentItem();
    const questionOpt = menu.querySelector('[data-fab="question"]');
    const current = AppState.getCurrentItem();
    if (questionOpt) questionOpt.hidden = !(current && current.activity_type === 'sentinela');
    const sentinelaOpt = menu.querySelector('[data-fab="sentinela"]');
    if (sentinelaOpt) sentinelaOpt.hidden = Logic.shiftHasSentinela(AppState.shiftData && AppState.shiftData.items);
    menu.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
  },

  closeFabMenu() {
    const fab = document.getElementById('fab-add');
    const menu = document.getElementById('fab-menu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (fab) fab.setAttribute('aria-expanded', 'false');
  },

  // Closes every edit overlay (row menu, + menu, armed delete). Used when leaving edit mode.
  closeEditOverlays() {
    this.closeRowMenu();
    this.closeFabMenu();
    this._disarm();
  },

  // Outside tap, scroll, resize and Esc close the row menu and the + menu
  // A tap outside an open menu only dismisses it: the click that follows is swallowed once, so it never
  // toggles a media, completes a part, changes the current part or switches the shift underneath.
  // Taps on the menu's own anchor (⋯ / +) still reach it so it can toggle the menu.
  bindOverlayDismiss() {
    document.addEventListener('pointerdown', (e) => {
      this._swallowClickUntil = 0; // a new tap: never let an older dismissal eat it
      let dismissed = false;
      const m = this._menu;
      if (m && !m.el.contains(e.target)) {
        if (m.anchor.contains(e.target)) this._menuSkip = { el: m.anchor, until: Date.now() + 800 };
        else dismissed = true;
        this.closeRowMenu();
      }
      const fabWrap = document.getElementById('fab');
      const fabMenu = document.getElementById('fab-menu');
      if (fabWrap && !fabWrap.contains(e.target) && fabMenu && !fabMenu.hidden) {
        dismissed = true;
        this.closeFabMenu();
      }
      if (dismissed) this._swallowClickUntil = Date.now() + 500;
    }, true);
    document.addEventListener('click', (e) => {
      if (Date.now() < (this._swallowClickUntil || 0)) {
        this._swallowClickUntil = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    const onScrollOrResize = () => { this.closeRowMenu(); this.closeFabMenu(); };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const menu = document.getElementById('fab-menu');
      if (this._menu || (menu && !menu.hidden)) {
        e.stopPropagation();
        this.closeRowMenu();
        this.closeFabMenu();
      }
    }, true);
  },

  // Long-press reorder (edit mode only). Hold a row HOLD_MS without moving more than SLOP_PX, then drag.
  // Moving earlier cancels (so the list scrolls normally). Pointer Events cover touch and mouse.
  // Rows are matched by rowSelector inside listEl (a persistent container); ids come from data-media-id / data-item-id.
  enableLongPressReorder(listEl, rowSelector, onReorder) {
    if (!listEl || listEl.dataset.longPress) return;
    listEl.dataset.longPress = '1';

    const rowId = (row) => Number(row.dataset.mediaId || row.dataset.itemId);
    const siblingsOf = (row) => Array.from(row.parentElement ? row.parentElement.children : [])
      .filter(el => el.matches(rowSelector));
    let press = null;

    const onMove = (e) => {
      if (!press || e.pointerId !== press.pointerId) return;
      if (!press.started) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > this.SLOP_PX) end(false);
        return;
      }
      e.preventDefault();
      // Near the top/bottom edge of the scrolling column, scroll it a little.
      const scroller = listEl.closest('.op-list, .op-spotlight, .modal-dialog') || listEl;
      const box = scroller.getBoundingClientRect();
      if (e.clientY < box.top + 48) scroller.scrollTop -= 12;
      else if (e.clientY > box.bottom - 48) scroller.scrollTop += 12;
      const row = press.row;
      const others = siblingsOf(row).filter(el => el !== row);
      if (others.length === 0) return;
      const centers = others.map(el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
      const index = Logic.dropIndex(centers, e.clientY);
      const current = siblingsOf(row).map(rowId);
      const next = Logic.moveId(current, rowId(row), index);
      if (next.join(',') === current.join(',')) return;
      if (others[index]) others[index].before(row);
      else others[others.length - 1].after(row);
    };

    const onUp = (e) => {
      if (!press || e.pointerId !== press.pointerId) return;
      end(e.type === 'pointerup');
    };

    // Touch: once the drag started, block the browser pan (touch-action set mid-gesture is not enough).
    const onTouchMove = (e) => { if (press && press.started && e.cancelable) e.preventDefault(); };
    const onBlock = (e) => { if (press) e.preventDefault(); };

    const start = () => {
      if (!press || AppState.mode !== 'editor' || !press.row.isConnected) { end(false); return; }
      press.started = true;
      this._dragging = true;
      const row = press.row;
      row.classList.add('is-dragging');
      row.style.touchAction = 'none';
      try { row.setPointerCapture(press.pointerId); } catch (_) { /* pointer already gone */ }
      listEl.classList.add('is-reordering');
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
      if (navigator.vibrate) navigator.vibrate(10);
    };

    const end = (drop) => {
      const p = press;
      if (!p) return;
      press = null;
      clearTimeout(p.timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!p.started) return;

      // The click that follows a drop must not select the row or toggle a media.
      if (drop) this._suppressClickUntil = Date.now() + 600;
      p.row.classList.remove('is-dragging');
      p.row.style.touchAction = '';
      try { if (p.row.hasPointerCapture(p.pointerId)) p.row.releasePointerCapture(p.pointerId); } catch (_) { /* ignore */ }
      listEl.classList.remove('is-reordering');
      this._dragging = false;

      const order = siblingsOf(p.row).map(rowId);
      const changed = drop && order.join(',') !== p.startOrder.join(',');
      const pending = this._renderPending;
      this._renderPending = false;
      if (changed) onReorder(order);
      else if (pending || !drop) this.render(); // re-sync (cancelled drag or updates that arrived meanwhile)
    };

    listEl.addEventListener('pointerdown', (e) => {
      this._suppressClickUntil = 0; // a new tap: the click a past drop may have left pending is gone
      if (press || AppState.mode !== 'editor' || !e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const row = e.target.closest(rowSelector);
      if (!row || !listEl.contains(row)) return;
      if (e.target.closest('button, a, input, textarea, select')) return; // ⋯, status dot
      const siblings = siblingsOf(row);
      if (siblings.length < 2) return;
      press = {
        row,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        started: false,
        startOrder: siblings.map(rowId),
        timer: setTimeout(start, this.HOLD_MS)
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    listEl.addEventListener('touchmove', onTouchMove, { passive: false });
    listEl.addEventListener('contextmenu', onBlock);
    listEl.addEventListener('selectstart', onBlock);
    listEl.addEventListener('click', (e) => {
      if (Date.now() < (this._suppressClickUntil || 0)) {
        this._suppressClickUntil = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  },

  // Applies the new order locally at once; on error, reloads the shift.
  async reorderParts(orderedIds) {
    const items = (AppState.shiftData && AppState.shiftData.items) || [];
    AppState.shiftData.items = Logic.sortByIds(items, orderedIds);
    this.render();
    try {
      await Api.reorderItems(AppState.selectedShiftId, orderedIds);
    } catch (err) {
      window.showToast(err.message, 'error');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    }
  },

  async reorderMedias(orderedIds) {
    const found = orderedIds.length ? this._findMedia(orderedIds[0]) : null;
    if (!found) { this.render(); return; }
    const { item } = found;
    item.medias = Logic.sortByIds(item.medias || [], orderedIds);
    this.render();
    try {
      await Api.reorderMedias(item.id, orderedIds);
    } catch (err) {
      window.showToast(err.message, 'error');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    }
  }
};

window.UIDirector = UIDirector;
