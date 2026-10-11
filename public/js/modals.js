/**
 * EventosAPP - Modals & Dialogs Management
 * Setup, PIN keypad, Item/Media editors, Event settings, and LAN QR code pairing
 */

const Modals = {
  activeModal: null,

  // Open modal by DOM element ID
  open(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    this.closeAll();
    modal.classList.add('open');
    this.activeModal = modal;
    document.body.style.overflow = 'hidden';

    // Auto-focus first input if present
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
      if (firstInput) firstInput.focus();
    }, 100);
  },

  // Close specific modal or active modal
  close(modalId) {
    const modal = modalId ? document.getElementById(modalId) : this.activeModal;
    if (modal) {
      modal.classList.remove('open');
      if (this.activeModal === modal) this.activeModal = null;
    }
    document.body.style.overflow = '';
  },

  closeAll() {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    this.activeModal = null;
    document.body.style.overflow = '';
  },

  // ==========================================
  // PIN KEYPAD MODAL CONTROLLER
  // ==========================================
  pinContext: 'login', // 'login' | 'upgrade'
  currentPinValue: '',

  openPinModal(context = 'login') {
    this.pinContext = context;
    this.currentPinValue = '';
    this.updatePinDots();

    const titleEl = document.getElementById('pin-modal-title');
    const descEl = document.getElementById('pin-modal-desc');

    if (context === 'upgrade') {
      titleEl.textContent = 'Acesso ao Modo Edição';
      descEl.textContent = 'Digite o PIN de Administrador (4 a 8 dígitos) para liberar ferramentas de edição.';
    } else {
      titleEl.textContent = 'Acesso ao EventosAPP';
      descEl.textContent = 'Digite o PIN de Diretor ou de Administrador para acessar a aplicação.';
    }

    const errorEl = document.getElementById('pin-error-msg');
    if (errorEl) errorEl.textContent = '';

    this.open('modal-pin-auth');
  },

  handlePinDigit(digit) {
    if (this.currentPinValue.length >= 8) return;
    this.currentPinValue += digit;
    this.updatePinDots();
  },

  handlePinBackspace() {
    this.currentPinValue = this.currentPinValue.slice(0, -1);
    this.updatePinDots();
  },

  handlePinClear() {
    this.currentPinValue = '';
    this.updatePinDots();
  },

  updatePinDots() {
    const container = document.getElementById('pin-dots');
    if (!container) return;
    const len = this.currentPinValue.length;
    const dots = container.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < len);
    });
  },

  async submitPin() {
    const errorEl = document.getElementById('pin-error-msg');
    if (this.currentPinValue.length < 4) {
      if (errorEl) errorEl.textContent = 'O PIN deve conter pelo menos 4 dígitos.';
      return;
    }

    try {
      if (errorEl) errorEl.textContent = 'Validando PIN...';

      if (this.pinContext === 'upgrade') {
        const res = await Api.upgradeSession(this.currentPinValue);
        AppState.setAuth(res.token, res.role);
        AppState.setMode('editor');
        this.close('modal-pin-auth');
        window.showToast('Modo Edição ativado com sucesso!', 'success');
      } else {
        const res = await Api.login(this.currentPinValue);
        AppState.setAuth(res.token, res.role);
        this.close('modal-pin-auth');
        window.showToast(`Bem-vindo ao ${res.eventName || 'Evento'}!`, 'success');
        window.dispatchEvent(new CustomEvent('init-app-data'));
      }
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || 'PIN incorreto. Tente novamente.';
      this.currentPinValue = '';
      this.updatePinDots();
    }
  },

  // ==========================================
  // INITIAL SETUP MODAL (RF-01)
  // ==========================================
  async submitSetup(form) {
    const eventName = form.eventName.value;
    const category = form.category.value;
    const firstDayLabel = form.firstDayLabel.value;
    const firstDayDate = form.firstDayDate.value;
    const firstShiftName = form.firstShiftName.value;
    const directorPin = form.directorPin.value;
    const adminPin = form.adminPin.value;

    const errorEl = document.getElementById('setup-error-msg');
    errorEl.textContent = '';

    if (!eventName.trim()) {
      errorEl.textContent = 'Informe o nome do evento.';
      return;
    }
    if (!/^\d{4,8}$/.test(directorPin)) {
      errorEl.textContent = 'O PIN do Diretor deve ter de 4 a 8 dígitos numéricos.';
      return;
    }
    if (!/^\d{4,8}$/.test(adminPin)) {
      errorEl.textContent = 'O PIN de Administrador deve ter de 4 a 8 dígitos numéricos.';
      return;
    }

    try {
      const res = await Api.setup({
        eventName,
        category,
        firstDayLabel,
        firstDayDate,
        firstShiftName,
        directorPin,
        adminPin
      });

      AppState.setAuth(res.token, res.role);
      this.close('modal-initial-setup');
      window.showToast('Evento configurado com sucesso!', 'success');
      window.dispatchEvent(new CustomEvent('init-app-data'));
    } catch (err) {
      errorEl.textContent = err.message;
    }
  },

  // ==========================================
  // ITEM MODAL (CREATE / EDIT) - RF-06
  // ==========================================
  itemEditId: null,

  openItemModal(itemId = null) {
    this.itemEditId = itemId;
    const titleEl = document.getElementById('item-modal-title');
    const form = document.getElementById('form-item');
    form.reset();

    if (itemId) {
      titleEl.textContent = 'Editar Item da Programação';
      const item = AppState.shiftData.items.find(i => i.id === Number(itemId));
      if (item) {
        form.itemTitle.value = item.title || '';
        form.itemScheduledTime.value = item.scheduled_time || '';
        form.itemSpeaker.value = item.speaker || '';
        if (form.itemActivityType) form.itemActivityType.value = item.activity_type || '';
        form.itemDescription.value = item.description || '';
      }
    } else {
      titleEl.textContent = 'Novo Item na Programação';
      // Default scheduled time suggestion based on last item
      const lastItem = AppState.shiftData.items[AppState.shiftData.items.length - 1];
      if (lastItem && lastItem.scheduled_time) {
        form.itemScheduledTime.value = lastItem.scheduled_time;
      }
    }

    this.open('modal-item-editor');
  },

  async submitItem(form) {
    const title = form.itemTitle.value.trim();
    const scheduledTime = form.itemScheduledTime.value.trim();
    const speaker = form.itemSpeaker.value.trim();
    const activityType = form.itemActivityType ? form.itemActivityType.value.trim() : '';
    const description = form.itemDescription.value.trim();

    if (!title) {
      window.showToast('Informe o título do item.', 'warning');
      return;
    }
    if (!scheduledTime) {
      window.showToast('Informe o horário previsto.', 'warning');
      return;
    }

    try {
      if (this.itemEditId) {
        await Api.updateItem(this.itemEditId, {
          title,
          scheduledTime,
          speaker,
          activityType,
          description
        });
        window.showToast('Item atualizado com sucesso!', 'success');
      } else {
        await Api.createItem({
          shiftId: AppState.selectedShiftId,
          title,
          scheduledTime,
          speaker,
          activityType,
          description
        });
        window.showToast('Item adicionado à programação!', 'success');
      }
      this.close('modal-item-editor');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // MEDIA MODAL (CREATE / EDIT) - RF-07
  // ==========================================
  mediaEditId: null,
  mediaTargetItemId: null,

  openMediaModal(itemId, mediaId = null) {
    this.mediaTargetItemId = itemId;
    this.mediaEditId = mediaId;
    const titleEl = document.getElementById('media-modal-title');
    const form = document.getElementById('form-media');
    form.reset();

    if (mediaId) {
      titleEl.textContent = 'Editar Mídia';
      const item = AppState.shiftData.items.find(i => i.id === Number(itemId));
      const media = item && item.medias ? item.medias.find(m => m.id === Number(mediaId)) : null;
      if (media) {
        form.mediaTitle.value = media.title || '';
        form.mediaType.value = media.type || 'other';
        form.mediaReference.value = media.reference || '';
      }
    } else {
      titleEl.textContent = 'Adicionar Nova Mídia';
      form.mediaType.value = 'bible';
    }

    this.open('modal-media-editor');
  },

  async submitMedia(form) {
    const title = form.mediaTitle.value.trim();
    const type = form.mediaType.value;
    const reference = form.mediaReference.value.trim();

    if (!title) {
      window.showToast('Informe o título da mídia.', 'warning');
      return;
    }

    try {
      if (this.mediaEditId) {
        await Api.updateMedia(this.mediaEditId, {
          title,
          type,
          reference
        });
        window.showToast('Mídia atualizada com sucesso!', 'success');
      } else {
        await Api.createMedia({
          itemId: this.mediaTargetItemId,
          title,
          type,
          reference
        });
        window.showToast('Mídia adicionada com sucesso!', 'success');
      }
      this.close('modal-media-editor');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // SETTINGS MODAL (STRUCTURE, EVENT, PINS)
  // ==========================================
  openSettingsModal() {
    this.renderSettingsStructure();
    this.renderSettingsGeneral();
    this.open('modal-settings');
  },

  renderSettingsStructure() {
    const container = document.getElementById('settings-structure-container');
    if (!container) return;

    let html = '';
    AppState.days.forEach(day => {
      html += `
        <div class="entity-management-row">
          <div class="entity-info">
            <span class="entity-title">${day.label} (${day.date})</span>
            <span class="entity-subtitle">${day.shifts ? day.shifts.length : 0} turnos</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="Modals.promptAddShift(${day.id})">+ Turno</button>
            <button class="btn btn-sm btn-ghost" onclick="Modals.promptEditDay(${day.id}, '${day.label}', '${day.date}')">Editar</button>
            ${AppState.days.length > 1 ? `<button class="btn btn-sm btn-danger" onclick="Modals.deleteDay(${day.id})">Excluir</button>` : ''}
          </div>
        </div>
      `;

      if (day.shifts && day.shifts.length > 0) {
        day.shifts.forEach(shift => {
          html += `
            <div class="entity-management-row" style="margin-left: 20px; border-left: 3px solid var(--accent-primary);">
              <div class="entity-info">
                <span class="entity-title">Turno: ${shift.name}</span>
                <span class="entity-subtitle">${shift.start_time || '--:--'} às ${shift.end_time || '--:--'}</span>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-sm btn-ghost" onclick="Modals.promptEditShift(${shift.id}, '${shift.name}', '${shift.start_time || ''}', '${shift.end_time || ''}')">Editar</button>
                ${day.shifts.length > 1 ? `<button class="btn btn-sm btn-danger" onclick="Modals.deleteShift(${shift.id})">Excluir</button>` : ''}
              </div>
            </div>
          `;
        });
      }
    });

    container.innerHTML = html;
  },

  renderSettingsGeneral() {
    const form = document.getElementById('form-settings-general');
    if (!form || !AppState.event) return;
    form.eventName.value = AppState.event.name || '';
    form.eventCategory.value = AppState.event.category || '';
  },

  async promptAddDay() {
    const label = prompt('Rótulo do novo dia (ex: Dia 2 - Domingo):');
    if (!label) return;
    const date = prompt('Data (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!date) return;

    try {
      await Api.createDay({ eventId: AppState.event.id, label, date });
      window.showToast('Dia adicionado!', 'success');
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
      this.renderSettingsStructure();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async promptEditDay(id, currentLabel, currentDate) {
    const label = prompt('Rótulo do dia:', currentLabel);
    if (!label) return;
    const date = prompt('Data (YYYY-MM-DD):', currentDate);
    if (!date) return;

    try {
      await Api.updateDay(id, { label, date });
      window.showToast('Dia atualizado!', 'success');
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
      this.renderSettingsStructure();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async deleteDay(id) {
    if (!confirm('Deseja realmente excluir este dia e todos os seus turnos e itens?')) return;
    try {
      await Api.deleteDay(id);
      window.showToast('Dia excluído com sucesso.', 'success');
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
      this.renderSettingsStructure();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async promptAddShift(dayId) {
    const name = prompt('Nome do turno (ex: Manhã, Tarde, Noite):');
    if (!name) return;
    const startTime = prompt('Horário inicial (opcional, ex: 19:00):', '');
    const endTime = prompt('Horário final (opcional, ex: 21:30):', '');

    try {
      await Api.createShift({ dayId, name, startTime, endTime });
      window.showToast('Turno adicionado!', 'success');
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
      this.renderSettingsStructure();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async promptEditShift(id, currentName, curStart, curEnd) {
    const name = prompt('Nome do turno:', currentName);
    if (!name) return;
    const startTime = prompt('Horário inicial:', curStart);
    const endTime = prompt('Horário final:', curEnd);

    try {
      await Api.updateShift(id, { name, startTime, endTime });
      window.showToast('Turno atualizado!', 'success');
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
      this.renderSettingsStructure();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async deleteShift(id) {
    if (!confirm('Deseja realmente excluir este turno e todos os seus itens?')) return;
    try {
      await Api.deleteShift(id);
      window.showToast('Turno excluído com sucesso.', 'success');
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
      this.renderSettingsStructure();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async submitSettingsGeneral(form) {
    const name = form.eventName.value.trim();
    const category = form.eventCategory.value.trim();
    if (!name) {
      window.showToast('O nome do evento não pode ficar vazio.', 'warning');
      return;
    }
    try {
      await Api.updateEvent(AppState.event.id, { name, category });
      window.showToast('Informações do evento salvas!', 'success');
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async submitSettingsPins(form) {
    const dirPin = form.newDirectorPin.value.trim();
    const admPin = form.newAdminPin.value.trim();
    if (!dirPin && !admPin) {
      window.showToast('Digite um novo PIN para atualizar.', 'warning');
      return;
    }
    try {
      await Api.updateEventPins(AppState.event.id, {
        directorPin: dirPin || undefined,
        adminPin: admPin || undefined
      });
      form.reset();
      window.showToast('PINs atualizados com sucesso!', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // LAN CONNECTION & QR CODE MODAL
  // ==========================================
  openLanModal() {
    const qrImg = document.getElementById('lan-qrcode-img');
    const urlText = document.getElementById('lan-url-display');
    const localText = document.getElementById('local-url-display');

    if (AppState.lanInfo) {
      if (qrImg) qrImg.src = AppState.lanInfo.qrCode || '';
      if (urlText) urlText.textContent = AppState.lanInfo.lanUrl || 'Nenhum IP detectado';
      if (localText) localText.textContent = AppState.lanInfo.localUrl || 'http://localhost:3000';
    }
    this.open('modal-lan-connect');
  },

  copyLanUrl() {
    if (AppState.lanInfo && AppState.lanInfo.lanUrl) {
      navigator.clipboard.writeText(AppState.lanInfo.lanUrl);
      window.showToast('Endereço da rede copiado!', 'success');
    }
  }
};

window.Modals = Modals;
