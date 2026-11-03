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

  emptyStateHtml(iconName, text, addAction, addLabel) {
    return `
      <div class="empty-state">
        <span class="empty-state-icon">${icon(iconName, 32)}</span>
        <p>${uiEsc(text)}</p>
        ${addAction ? `<button type="button" class="btn btn-accent edit-only" data-action="${addAction}">${icon('plus')}<span>${uiEsc(addLabel)}</span></button>` : ''}
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
        ? this.emptyStateHtml('list', 'Sem partes neste turno', 'add-item', 'Nova parte')
        : this.emptyStateHtml('list', 'Escolha uma parte na programação');
      return;
    }

    const medias = currentItem.medias || [];
    const status = Logic.itemStatus(currentItem);
    const itemId = Number(currentItem.id);

    const mediasHtml = medias.length === 0
      ? this.emptyStateHtml('file', 'Sem mídias', 'add-media', 'Nova mídia')
      : medias.map(media => {
        const typeInfo = this.getMediaTypeInfo(media.type);
        const done = !!media.completed;
        return `
          <div class="media-row${done ? ' is-done' : ''}" data-media-id="${Number(media.id)}"
               role="button" tabindex="0" aria-pressed="${done}">
            <button class="media-drag-handle edit-only" type="button" title="Arrastar para reordenar" aria-label="Arrastar para reordenar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="9" cy="5" r="1.8"/><circle cx="15" cy="5" r="1.8"/>
                <circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/>
                <circle cx="9" cy="19" r="1.8"/><circle cx="15" cy="19" r="1.8"/>
              </svg>
            </button>
            <span class="check-circle${done ? ' is-done' : ''}">${icon('check', 16)}</span>
            <span class="media-type-icon" title="${uiEsc(typeInfo.label)}">${icon(typeInfo.icon)}</span>
            <span class="media-text">
              <span class="media-title">${uiEsc(media.title)}</span>
              ${media.reference ? `<span class="media-notes">${uiEsc(media.reference)}</span>` : ''}
            </span>
            <span class="row-actions edit-only">
              ${uiIconButton('pencil', 'Editar mídia', 'data-action="edit-media"')}
              ${uiIconButton('trash', 'Excluir mídia', 'data-action="delete-media"', 'is-danger')}
            </span>
          </div>
        `;
      }).join('');

    spotlightContainer.innerHTML = `
      <article class="current-part" data-item-id="${itemId}">
        <div class="current-head">
          <h1 class="current-title" id="current-item-title">${uiEsc(currentItem.title)}</h1>
          <button type="button" class="dot dot-lg is-${status}" data-action="toggle-item" data-item-id="${itemId}"
                  title="${status === 'done' ? 'Marcar parte como pendente' : 'Marcar parte como concluída'}"
                  aria-label="${status === 'done' ? 'Marcar parte como pendente' : 'Marcar parte como concluída'}"
                  aria-pressed="${status === 'done'}"></button>
        </div>

        <div class="current-meta">
          ${currentItem.scheduled_time ? `<span class="meta-item tnum">${icon('clock', 16)}<span>${uiEsc(currentItem.scheduled_time)}</span></span>` : ''}
          ${currentItem.speaker ? `<span class="meta-item">${icon('user', 16)}<span>${uiEsc(currentItem.speaker)}</span></span>` : ''}
        </div>

        ${currentItem.description ? `<p class="current-notes">${uiEsc(currentItem.description)}</p>` : ''}

        <div class="media-list" id="medias-checklist-list">
          ${mediasHtml}
        </div>

        <div class="edit-tools edit-only">
          ${medias.length > 0 ? `<button type="button" class="btn btn-secondary" data-action="add-media">${icon('plus')}<span>Nova mídia</span></button>` : ''}
          <button type="button" class="btn btn-secondary" data-action="import">${icon('upload')}<span>Importar</span></button>
        </div>
      </article>
    `;

    this.setupMediaDragAndDrop(currentItem.id);
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
          <span class="part-title">${uiEsc(item.title)}</span>
          <span class="row-actions edit-only">
            ${uiIconButton('upload', 'Importar mídia', 'data-action="import"')}
            ${uiIconButton('chevron-left', 'Mover para cima', 'data-action="move-up"', 'rot-up')}
            ${uiIconButton('chevron-right', 'Mover para baixo', 'data-action="move-down"', 'rot-down')}
            ${uiIconButton('pencil', 'Editar parte', 'data-action="edit-item"')}
            ${uiIconButton('trash', 'Excluir parte', 'data-action="delete-item"', 'is-danger')}
          </span>
          <button type="button" class="dot is-${status}" data-action="toggle-item"
                  title="${label}" aria-label="${label}" aria-pressed="${status === 'done'}"></button>
        </div>
      `;
    }).join('');

    const listHtml = items.length === 0
      ? this.emptyStateHtml('list', 'Sem partes neste turno', 'add-item', 'Nova parte')
      : `
        <div class="part-list">${rowsHtml}</div>
        <div class="list-add edit-only">
          <button type="button" class="btn btn-secondary" data-action="add-item">${icon('plus')}<span>Nova parte</span></button>
        </div>
      `;

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

  // 3. Bottom bar: ◀ ☰ ▶ (☰ only on phone)
  renderNavigationToolbar() {
    const navContainer = document.getElementById('director-nav-container');
    if (!navContainer) return;

    const items = AppState.shiftData.items || [];
    const currentIndex = items.findIndex(i => i.id === AppState.currentItemId);

    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex !== -1 && currentIndex < items.length - 1;

    navContainer.innerHTML = `
      ${uiIconButton('chevron-left', 'Parte anterior', `id="btn-nav-prev" data-action="prev"${hasPrev ? '' : ' disabled'}`, 'nav-btn')}
      ${uiIconButton('list', 'Programação', 'id="btn-open-schedule-modal" data-action="open-list"', 'nav-btn phone-only')}
      ${uiIconButton('chevron-right', 'Próxima parte', `id="btn-nav-next" data-action="next"${hasNext ? '' : ' disabled'}`, 'nav-btn nav-next btn-accent')}
    `;
  },

  // Event delegation (bound once; containers persist across renders)
  bindEvents() {
    if (this._bound) return;
    this._bound = true;

    ['timeline-container', 'timeline-modal-container'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => this.onListClick(e));
    });

    const spotlight = document.getElementById('spotlight-container');
    if (spotlight) spotlight.addEventListener('click', (e) => this.onSpotlightClick(e));

    const nav = document.getElementById('director-nav-container');
    if (nav) nav.addEventListener('click', (e) => this.onNavClick(e));

    // Enter/Space on focusable rows behaves like a tap
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target;
      if (t && t.matches && t.matches('.part-row[data-item-id], .media-row[data-media-id]')) {
        e.preventDefault();
        t.click();
      }
    });
  },

  onListClick(e) {
    const actionEl = e.target.closest('[data-action]');
    const row = e.target.closest('.row[data-item-id]');
    const action = actionEl ? actionEl.dataset.action : null;

    if (!row) {
      if (action === 'add-item') Modals.openItemModal();
      return;
    }

    const itemId = Number(row.dataset.itemId);
    if (actionEl && row.contains(actionEl)) {
      e.stopPropagation();
      switch (action) {
        case 'toggle-item': this.toggleItemDot(itemId); break;
        case 'import': this.importPlaylist(itemId); break;
        case 'move-up': this.moveItem(itemId, -1); break;
        case 'move-down': this.moveItem(itemId, 1); break;
        case 'edit-item': Modals.openItemModal(itemId); break;
        case 'delete-item': this.deleteItem(itemId); break;
      }
      return;
    }

    this.handleTimelineItemClick(itemId);
  },

  onSpotlightClick(e) {
    if (e.target.closest('.media-drag-handle')) return;

    const part = e.target.closest('.current-part[data-item-id]');
    const itemId = part ? Number(part.dataset.itemId) : null;
    const actionEl = e.target.closest('[data-action]');
    const mediaRow = e.target.closest('.media-row[data-media-id]');
    const mediaId = mediaRow ? Number(mediaRow.dataset.mediaId) : null;

    if (actionEl) {
      switch (actionEl.dataset.action) {
        case 'add-item': Modals.openItemModal(); break;
        case 'toggle-item': if (itemId) this.toggleItemDot(itemId); break;
        case 'add-media': if (itemId) Modals.openMediaModal(itemId); break;
        case 'import': if (itemId) this.importPlaylist(itemId); break;
        case 'edit-media': if (itemId && mediaId) Modals.openMediaModal(itemId, mediaId); break;
        case 'delete-media': if (mediaId) this.deleteMedia(mediaId); break;
      }
      return;
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

  navigatePrevious() {
    const items = AppState.shiftData.items || [];
    const currentIndex = items.findIndex(i => i.id === AppState.currentItemId);
    if (currentIndex > 0) {
      this.setCurrentItem(items[currentIndex - 1].id);
    }
  },

  navigateNext() {
    const items = AppState.shiftData.items || [];
    const currentIndex = items.findIndex(i => i.id === AppState.currentItemId);
    if (currentIndex !== -1 && currentIndex < items.length - 1) {
      this.setCurrentItem(items[currentIndex + 1].id);
    }
  },

  // Edit Mode Specific Item Actions
  async moveItem(itemId, direction) {
    const items = [...AppState.shiftData.items];
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    // Swap
    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    const orderedIds = items.map(i => i.id);
    try {
      await Api.reorderItems(AppState.selectedShiftId, orderedIds);
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async deleteItem(itemId) {
    if (!confirm('Deseja realmente excluir esta parte e suas mídias?')) return;
    try {
      await Api.deleteItem(itemId);
      window.showToast('Parte excluída.', 'success');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async moveMedia(itemId, mediaId, direction) {
    const item = AppState.shiftData.items.find(i => i.id === itemId);
    if (!item || !item.medias) return;
    const medias = [...item.medias];
    const index = medias.findIndex(m => m.id === mediaId);
    if (index === -1) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= medias.length) return;

    const temp = medias[index];
    medias[index] = medias[targetIndex];
    medias[targetIndex] = temp;

    const orderedIds = medias.map(m => m.id);
    try {
      await Api.reorderMedias(itemId, orderedIds);
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  setupMediaDragAndDrop(itemId) {
    const list = document.getElementById('medias-checklist-list');
    if (!list) return;

    const rows = list.querySelectorAll('.media-row');
    if (rows.length < 2) return;

    let draggedRow = null;
    let draggedMediaId = null;

    rows.forEach(row => {
      const handle = row.querySelector('.media-drag-handle');
      if (!handle) return;

      // Enable drag only when handle is pressed
      handle.addEventListener('mousedown', () => {
        row.setAttribute('draggable', 'true');
      });

      const resetDraggable = () => {
        row.removeAttribute('draggable');
      };

      handle.addEventListener('mouseup', resetDraggable);
      handle.addEventListener('mouseleave', resetDraggable);

      // Desktop HTML5 Drag & Drop
      row.addEventListener('dragstart', (e) => {
        draggedRow = row;
        draggedMediaId = Number(row.dataset.mediaId);
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedMediaId));
      });

      row.addEventListener('dragend', () => {
        row.removeAttribute('draggable');
        row.classList.remove('is-dragging');
        rows.forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));
        draggedRow = null;
        draggedMediaId = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!draggedRow || draggedRow === row) return;

        const rect = row.getBoundingClientRect();
        const isAbove = (e.clientY - rect.top) < (rect.height / 2);
        row.classList.toggle('drag-over-above', isAbove);
        row.classList.toggle('drag-over-below', !isAbove);
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over-above', 'drag-over-below');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over-above', 'drag-over-below');
        if (!draggedMediaId) return;

        const targetMediaId = Number(row.dataset.mediaId);
        if (draggedMediaId === targetMediaId) return;

        const rect = row.getBoundingClientRect();
        const isAbove = (e.clientY - rect.top) < (rect.height / 2);

        this.handleMediaReorderDrop(itemId, draggedMediaId, targetMediaId, isAbove);
      });

      // Mobile / Tablet Touch Events
      let activeTouchRow = null;

      handle.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        activeTouchRow = row;
        draggedMediaId = Number(row.dataset.mediaId);
        row.classList.add('is-dragging');
      }, { passive: true });

      handle.addEventListener('touchmove', (e) => {
        if (!activeTouchRow) return;
        const touch = e.touches[0];
        const elem = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetRow = elem ? elem.closest('.media-row') : null;

        rows.forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));
        if (targetRow && targetRow !== activeTouchRow && list.contains(targetRow)) {
          const rect = targetRow.getBoundingClientRect();
          const isAbove = (touch.clientY - rect.top) < (rect.height / 2);
          targetRow.classList.toggle('drag-over-above', isAbove);
          targetRow.classList.toggle('drag-over-below', !isAbove);
        }
      }, { passive: true });

      handle.addEventListener('touchend', (e) => {
        if (!activeTouchRow) return;
        activeTouchRow.classList.remove('is-dragging');

        const changedTouch = e.changedTouches[0];
        const elem = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
        const targetRow = elem ? elem.closest('.media-row') : null;

        rows.forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));

        if (targetRow && targetRow !== activeTouchRow && list.contains(targetRow)) {
          const targetMediaId = Number(targetRow.dataset.mediaId);
          const rect = targetRow.getBoundingClientRect();
          const isAbove = (changedTouch.clientY - rect.top) < (rect.height / 2);
          this.handleMediaReorderDrop(itemId, draggedMediaId, targetMediaId, isAbove);
        }

        activeTouchRow = null;
        draggedMediaId = null;
      });

      handle.addEventListener('touchcancel', () => {
        if (activeTouchRow) activeTouchRow.classList.remove('is-dragging');
        rows.forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));
        activeTouchRow = null;
        draggedMediaId = null;
      });
    });
  },

  async handleMediaReorderDrop(itemId, draggedMediaId, targetMediaId, isAbove) {
    const item = AppState.shiftData && AppState.shiftData.items ? AppState.shiftData.items.find(i => i.id === itemId) : null;
    if (!item || !item.medias) return;

    const medias = [...item.medias];
    const fromIndex = medias.findIndex(m => m.id === draggedMediaId);
    if (fromIndex === -1) return;

    const [moved] = medias.splice(fromIndex, 1);

    let toIndex = medias.findIndex(m => m.id === targetMediaId);
    if (toIndex === -1) return;

    if (!isAbove) {
      toIndex += 1;
    }

    medias.splice(toIndex, 0, moved);

    // Instant local UI update
    item.medias = medias;
    this.renderSpotlight();

    const orderedIds = medias.map(m => m.id);
    try {
      await Api.reorderMedias(itemId, orderedIds);
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
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
      const ev = new CustomEvent('import-playlist', { detail: { itemId, file } });
      window.dispatchEvent(ev);
      window.showToast('Arquivo de playlist selecionado.', 'info');
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  },

  async deleteMedia(mediaId) {
    if (!confirm('Deseja realmente remover esta mídia?')) return;
    try {
      await Api.deleteMedia(mediaId);
      window.showToast('Mídia removida.', 'success');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },


};

window.UIDirector = UIDirector;
