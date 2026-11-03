/**
 * EventosAPP - Director Mode UI Controller
 * Renders the Spotlight Card, Medias Checklist, Timeline and Director Navigation
 */

const UIDirector = {
  // Media Type Badges and Icons helper
  getMediaTypeInfo(type) {
    switch (type) {
      case 'bible':
        return { label: 'Bíblia', badgeClass: 'badge-media-bible', icon: '📖' };
      case 'image':
        return { label: 'Imagem', badgeClass: 'badge-media-image', icon: '🖼️' };
      case 'video':
        return { label: 'Vídeo', badgeClass: 'badge-media-video', icon: '🎬' };
      case 'interview':
        return { label: 'Entrevista', badgeClass: 'badge-media-interview', icon: '🎙️' };
      case 'theater':
        return { label: 'Teatro', badgeClass: 'badge-media-theater', icon: '🎭' };
      default:
        return { label: 'Conteúdo', badgeClass: 'badge-media-other', icon: '📁' };
    }
  },

  // Render whole view
  render() {
    this.renderSpotlight();
    this.renderTimeline();
    this.renderNavigationToolbar();
  },

  // 1. Render Spotlight Hero Card
  renderSpotlight() {
    const spotlightContainer = document.getElementById('spotlight-container');
    if (!spotlightContainer) return;

    const currentItem = AppState.getCurrentItem();
    const items = AppState.shiftData.items || [];

    if (!currentItem) {
      spotlightContainer.innerHTML = `
        <div class="spotlight-card">
          <div class="spotlight-header">
            <span class="badge badge-warning">Aguardando Início</span>
          </div>
          <div class="spotlight-content">
            <h2 class="spotlight-title" style="font-size: 1.5rem; color: var(--text-muted);">
              ${items.length === 0 ? 'Nenhuma midia cadastrada.' : 'Nenhum item em execução no momento.'}
            </h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
              ${items.length === 0 ? 'Ative o Modo Edição para adicionar itens à programação.' : 'Selecione uma parte no programa ao lado para colocá-lo Em Execução.'}
            </p>
            ${AppState.mode === 'editor' && items.length === 0 ? `
              <button class="btn btn-primary" onclick="Modals.openItemModal()">+ Criar Primeiro Item</button>
            ` : ''}
          </div>
        </div>
      `;
      return;
    }

    const medias = currentItem.medias || [];
    const completedCount = medias.filter(m => m.completed).length;
    const progressPercent = medias.length > 0 ? Math.round((completedCount / medias.length) * 100) : 0;

    let mediasHtml = '';
    if (medias.length === 0) {
      mediasHtml = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
          Nenhuma mídia vinculada a este item.
        </div>
      `;
    } else {
      medias.forEach((media, index) => {
        const typeInfo = this.getMediaTypeInfo(media.type);
        mediasHtml += `
          <div class="media-item-row ${media.completed ? 'completed' : ''}" 
               id="media-row-${media.id}" 
               data-media-id="${media.id}" 
               onclick="UIDirector.handleMediaClick(event, ${media.id})">
            
            <button class="media-drag-handle edit-only" 
                    type="button" 
                    title="Arrastar para reordenar" 
                    onclick="event.stopPropagation()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="5" r="1.8"/>
                <circle cx="15" cy="5" r="1.8"/>
                <circle cx="9" cy="12" r="1.8"/>
                <circle cx="15" cy="12" r="1.8"/>
                <circle cx="9" cy="19" r="1.8"/>
                <circle cx="15" cy="19" r="1.8"/>
              </svg>
            </button>

            <div class="media-left-group">
              <div class="media-check-circle" title="${media.completed ? 'Reabrir mídia' : 'Marcar como concluída'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>

              <div class="media-text-info">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge ${typeInfo.badgeClass}" title="${typeInfo.label}">${typeInfo.icon}</span>
                  <span class="media-title">${media.title}</span>
                </div>
                ${media.reference ? `<span class="media-reference">Ref: ${media.reference}</span>` : ''}
              </div>
            </div>

            <div class="media-right-group">
              <!-- Edit mode only controls -->
              <div class="media-editor-actions" onclick="event.stopPropagation()">
                <button class="action-btn-sm" title="Editar mídia" onclick="Modals.openMediaModal(${currentItem.id}, ${media.id})">✏️</button>
                <button class="action-btn-sm delete-btn" title="Excluir mídia" onclick="UIDirector.deleteMedia(${media.id})">🗑️</button>
              </div>
            </div>

          </div>
        `;
      });
    }

    spotlightContainer.innerHTML = `
      <div class="spotlight-card is-live">
        <div class="spotlight-header">
          <div class="spotlight-status-group">
            <span class="badge badge-live">
              <span class="live-pulse-dot" style="width: 6px; height: 6px;"></span>
              AO VIVO
            </span>
            ${currentItem.activity_type ? `<span class="badge badge-primary">${currentItem.activity_type}</span>` : ''}
            ${currentItem.completed ? `<span class="badge badge-success" style="font-size: 0.65rem; padding: 1px 6px;">CONCLUÍDO</span>` : ''}
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="spotlight-time-badge" title="Horário Previsto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${currentItem.scheduled_time}
            </div>

            <!-- Spotlight edit actions -->
            <div class="spotlight-editor-actions">
              <button class="btn btn-sm btn-secondary" onclick="Modals.openItemModal(${currentItem.id})">✏️ Editar Item</button>
            </div>
          </div>
        </div>

        <div class="spotlight-content">
          <h1 class="spotlight-title" id="current-item-title">${currentItem.title}</h1>

          <div class="spotlight-meta">
            ${currentItem.speaker ? `
              <div class="spotlight-meta-item speaker">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>${currentItem.speaker}</span>
              </div>
            ` : ''}
          </div>

          ${currentItem.description ? `
            <div class="spotlight-description">${currentItem.description}</div>
          ` : ''}
        </div>

        <!-- Medias Section -->
        <div class="medias-section">
          <div class="medias-section-header">
            <div class="medias-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              <span>Mídias do Item</span>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="medias-progress-stats" id="medias-stats-text">${completedCount} de ${medias.length} concluídas (${progressPercent}%)</span>
${AppState.mode === 'editor' ? `<button class="btn btn-sm btn-primary import-btn" title="Importar mídia" onclick="UIDirector.importPlaylist(${currentItem.id})">Importar</button>` : ''}<button class="btn btn-sm btn-secondary edit-only" onclick="Modals.openMediaModal(${currentItem.id})">+ Adicionar Mídia</button>
            </div>
          </div>

          <div class="progress-container" style="margin-bottom: 14px;">
            <div class="progress-bar-fill" id="medias-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>

          <div class="medias-list" id="medias-checklist-list">
            ${mediasHtml}
          </div>
        </div>

      </div>
    `;

    this.setupMediaDragAndDrop(currentItem.id);
  },

  // 2. Render Timeline (Program Schedule on Right)
  renderTimeline() {
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer) return;

    const items = AppState.shiftData.items || [];
    const currentItemId = AppState.currentItemId;
    const currentIndex = items.findIndex(i => i.id === currentItemId);

    let itemsHtml = '';
    if (items.length === 0) {
      itemsHtml = `
        <div class="empty-state">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <p>Nenhuma parte programada para este turno.</p>
        </div>
      `;
    } else {
      items.forEach((item, index) => {
        const isCurrent = item.id === currentItemId;
        const isPassed = currentIndex !== -1 && index < currentIndex;
        const mediasCount = item.medias ? item.medias.length : 0;
        const mediasDone = item.medias ? item.medias.filter(m => m.completed).length : 0;

        itemsHtml += `
          <div class="timeline-item-card ${isCurrent ? 'is-current' : ''} ${isPassed ? 'is-passed' : ''} ${item.completed ? 'is-completed' : ''}" 
               id="timeline-item-${item.id}"
               onclick="UIDirector.handleTimelineItemClick(${item.id})">
            
            <div class="item-card-left">
              <span class="item-order-number">${index + 1}</span>

              <div class="item-details">
                <div class="item-header-meta">
                  ${AppState.mode === 'editor' ? `<button class="btn btn-sm btn-primary import-btn" title="Importar mídia" onclick="UIDirector.importPlaylist(${item.id})">Importar</button>` : ''}
                  <span class="item-scheduled-time">${item.scheduled_time}</span>
                  ${item.activity_type ? `<span class="badge badge-primary" style="font-size: 0.65rem; padding: 1px 6px;">${item.activity_type}</span>` : ''}
                  ${isCurrent ? `<span class="badge badge-live" style="font-size: 0.65rem; padding: 1px 6px;">AO VIVO</span>` : ''}
                  ${item.completed ? `<span class="badge badge-success" style="font-size: 0.65rem; padding: 1px 6px;">CONCLUÍDO</span>` : ''}
                </div>
                <span class="item-name ${item.completed ? 'item-completed-text' : ''}">${item.title}</span>
                ${item.speaker ? `<span class="item-speaker-preview">Por: ${item.speaker}</span>` : ''}
              </div>
            </div>

            <div class="item-card-right">
              ${mediasCount > 0 ? `
                <span class="media-pill-counter" title="${mediasDone} de ${mediasCount} mídias concluídas">
                  ${mediasDone}/${mediasCount} mídias
                </span>
              ` : ''}

              <!-- Item Complete Button -->
              <button class="btn-item-complete ${item.completed ? 'completed' : ''}" 
                      title="${item.completed ? 'Marcar parte como pendente' : 'Marcar parte como concluída'}"
                      onclick="event.stopPropagation(); UIDirector.toggleItemCompleted(${item.id})">
                <div class="item-check-icon">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <span class="btn-item-complete-label">${item.completed ? 'Concluído' : 'Concluir'}</span>
              </button>

              <!-- Edit Mode Item Actions -->
              <div class="timeline-item-actions" onclick="event.stopPropagation()">
                ${!isCurrent ? `
                  <button class="action-btn-sm play-btn" title="Selecionar este item" onclick="UIDirector.setCurrentItem(${item.id})">▶</button>
                ` : ''}
                <button class="action-btn-sm" title="Mover para cima" onclick="UIDirector.moveItem(${item.id}, -1)">▲</button>
                <button class="action-btn-sm" title="Mover para baixo" onclick="UIDirector.moveItem(${item.id}, 1)">▼</button>
                <button class="action-btn-sm" title="Editar item" onclick="Modals.openItemModal(${item.id})">✏️</button>
                <button class="action-btn-sm delete-btn" title="Excluir item" onclick="UIDirector.deleteItem(${item.id})">🗑️</button>
              </div>
            </div>

          </div>
        `;
      });
    }

    const shiftProgress = items.length > 0 && currentIndex !== -1
      ? Math.round(((currentIndex + 1) / items.length) * 100)
      : 0;

    const timelineCardHtml = `
      <div class="timeline-card">
        <div class="timeline-header">
          <div class="timeline-title-row">
            <h3 class="timeline-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              <span>Programa</span>
            </h3>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
              ${items.length} ${items.length === 1 ? 'item' : 'itens'}
            </span>
          </div>

          <div class="progress-container">
            <div class="progress-bar-fill" style="width: ${shiftProgress}%;"></div>
          </div>
        </div>

        <div class="timeline-items-list" id="timeline-list">
          ${itemsHtml}
        </div>

        <!-- Add Item button (shown in Edit Mode) -->
        <div style="padding: 0 var(--spacing-md) var(--spacing-md);">
          <button class="btn-add-item-dashed" onclick="Modals.openItemModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Cadastrar nova parte</span>
          </button>
        </div>

      </div>
    `;

    if (timelineContainer) timelineContainer.innerHTML = timelineCardHtml;
    const modalTimelineContainer = document.getElementById('timeline-modal-container');
    if (modalTimelineContainer) modalTimelineContainer.innerHTML = timelineCardHtml;
  },

  // 3. Render Navigation Toolbar (◀ Anterior / Seletor de Programação / Próximo ▶)
  renderNavigationToolbar() {
    const navContainer = document.getElementById('director-nav-container');
    if (!navContainer) return;

    const items = AppState.shiftData.items || [];
    const currentItemId = AppState.currentItemId;
    const currentIndex = items.findIndex(i => i.id === currentItemId);

    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex !== -1 && currentIndex < items.length - 1;

    navContainer.innerHTML = `
      <div class="director-nav-toolbar">
        <button class="btn btn-secondary nav-direction-btn" 
                id="btn-nav-prev"
                ${!hasPrev ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}
                onclick="UIDirector.navigatePrevious()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>Anterior</span>
          
        </button>

        <!-- Botão Central: Seletor Manual de Programação (abre modal no celular e desktop) -->
        <button class="btn-schedule-picker-trigger" 
                id="btn-open-schedule-modal"
                onclick="Modals.open('modal-schedule-picker')"
                title="Abrir Programação do Turno para seleção manual de itens">
          <div class="schedule-btn-top">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            <span class="schedule-btn-text">${items.length > 0 && currentIndex !== -1 ? `Item ${currentIndex + 1} de ${items.length}` : 'Programação'}</span>
          </div>
          <span class="schedule-btn-sub">Ver Lista</span>
        </button>

        <button class="btn btn-live nav-direction-btn" 
                id="btn-nav-next"
                ${!hasNext ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}
                onclick="UIDirector.navigateNext()">
          <span>Próximo</span>
        
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    `;
  },

  // User Actions
  async handleMediaClick(event, mediaId) {
    try {
      await Api.toggleMediaCompleted(mediaId);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async toggleItemCompleted(itemId) {
    const item = AppState.shiftData && AppState.shiftData.items ? AppState.shiftData.items.find(i => i.id === itemId) : null;
    if (!item) return;

    // Optimistic toggle
    const newStatus = item.completed ? 0 : 1;
    AppState.toggleItemCompleted(itemId, newStatus);

    try {
      await Api.toggleItemCompleted(itemId);
    } catch (err) {
      // Revert if error
      AppState.toggleItemCompleted(itemId, item.completed ? 1 : 0);
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
    if (!confirm('Deseja realmente excluir este item e suas mídias?')) return;
    try {
      await Api.deleteItem(itemId);
      window.showToast('Item excluído.', 'success');
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

    const rows = list.querySelectorAll('.media-item-row');
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
        const targetRow = elem ? elem.closest('.media-item-row') : null;

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
        const targetRow = elem ? elem.closest('.media-item-row') : null;

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
