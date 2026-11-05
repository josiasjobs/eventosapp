/**
 * EventosAPP - Modals & Dialogs Management
 * Setup, PIN keypad, Parte/Mídia editors, Event settings, and LAN QR code pairing
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

    // Auto-focus the first input only on form dialogs (data-autofocus); other sheets must not pop the keyboard
    if (modal.hasAttribute('data-autofocus')) setTimeout(() => {
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

  pinBusy: false,
  PIN_LENGTH: 4,

  openPinModal(context = 'login') {
    this.pinContext = context;
    this.currentPinValue = '';
    this.pinBusy = false;
    this.updatePinDots();
    this.clearPinError();

    // Login is mandatory; only the edit-mode upgrade can be dismissed
    const closeBtn = document.getElementById('pin-close');
    if (closeBtn) closeBtn.hidden = context !== 'upgrade';

    this.open('modal-pin-auth');
  },

  clearPinError() {
    const errorEl = document.getElementById('pin-error-msg');
    if (errorEl) errorEl.textContent = '';
    const dots = document.getElementById('pin-dots');
    if (dots) dots.classList.remove('is-error');
  },

  handlePinDigit(digit) {
    if (this.pinBusy || this.currentPinValue.length >= this.PIN_LENGTH) return;
    this.clearPinError();
    this.currentPinValue += digit;
    this.updatePinDots();
    if (this.currentPinValue.length === this.PIN_LENGTH) this.submitPin();
  },

  handlePinBackspace() {
    if (this.pinBusy) return;
    this.currentPinValue = this.currentPinValue.slice(0, -1);
    this.updatePinDots();
  },

  handlePinClear() {
    if (this.pinBusy) return;
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
    if (this.pinBusy || this.currentPinValue.length !== this.PIN_LENGTH) return;
    this.pinBusy = true;
    const pin = this.currentPinValue;

    try {
      if (this.pinContext === 'upgrade') {
        const res = await Api.upgradeSession(pin);
        AppState.setAuth(res.token, res.role);
        AppState.setMode('editor');
        this.close('modal-pin-auth');
      } else {
        const res = await Api.login(pin);
        AppState.setAuth(res.token, res.role);
        this.close('modal-pin-auth');
        window.dispatchEvent(new CustomEvent('init-app-data'));
      }
      this.currentPinValue = '';
      this.updatePinDots();
    } catch (err) {
      this.currentPinValue = '';
      this.updatePinDots();
      const errorEl = document.getElementById('pin-error-msg');
      if (err.status === 401) {
        // The server answers 401 both for a wrong admin PIN and for a dead session, so ask it
        if (this.pinContext === 'upgrade') {
          try {
            await Api.verifySession();
          } catch (verifyErr) {
            // Session invalid: Api.request already cleared auth and fired auth-required (login keypad)
            return;
          }
        }
        this.shakePinDots();
      } else if (err.status === 429) {
        if (errorEl) errorEl.textContent = `Aguarde ${err.remainingSeconds}s`;
      } else {
        window.showToast(err.message || 'Não foi possível validar o PIN.', 'error');
      }
    } finally {
      this.pinBusy = false;
    }
  },

  // Red + shaking dots for 400 ms
  shakePinDots() {
    const dots = document.getElementById('pin-dots');
    if (!dots) return;
    dots.classList.remove('is-error');
    void dots.offsetWidth; // restart the animation
    dots.classList.add('is-error');
    setTimeout(() => dots.classList.remove('is-error'), 400);
  },

  // ==========================================
  // INITIAL SETUP MODAL (RF-01)
  // ==========================================
  async submitSetup(form) {
    const eventName = form.eventName.value.trim();
    const directorPin = form.directorPin.value;
    const adminPin = form.adminPin.value;

    const errorEl = document.getElementById('setup-error-msg');
    errorEl.textContent = '';

    if (!eventName) {
      errorEl.textContent = 'Informe o nome do evento.';
      return;
    }
    if (!/^\d{4}$/.test(directorPin)) {
      errorEl.textContent = 'O PIN do diretor deve ter 4 dígitos.';
      return;
    }
    if (!/^\d{4}$/.test(adminPin)) {
      errorEl.textContent = 'O PIN de admin deve ter 4 dígitos.';
      return;
    }

    try {
      const res = await Api.setup({
        eventName,
        firstDayLabel: 'Dia 1',
        firstShiftName: 'Geral',
        directorPin,
        adminPin
      });

      AppState.setAuth(res.token, res.role);
      this.close('modal-initial-setup');
      window.dispatchEvent(new CustomEvent('init-app-data'));
    } catch (err) {
      errorEl.textContent = err.message;
    }
  },

  // ==========================================
  // ITEM MODAL (CREATE / EDIT) - RF-06
  // ==========================================
  itemEditId: null,
  itemSentinela: false,

  // A Sentinela is requested by opts.sentinela (new) or recognised on the item (edit)
  openItemModal(itemId = null, { sentinela = false } = {}) {
    this.itemEditId = itemId;
    const titleEl = document.getElementById('item-modal-title');
    const form = document.getElementById('form-item');
    form.reset();

    const found = itemId ? AppState.shiftData.items.find(i => i.id === Number(itemId)) : null;
    this.itemSentinela = !!sentinela || !!(found && found.activity_type === 'sentinela');
    const sent = this.itemSentinela;

    if (itemId) {
      titleEl.textContent = sent ? 'Editar Sentinela' : 'Editar parte';
      const item = found;
      if (item) {
        form.itemTitle.value = item.title || '';
        form.itemScheduledTime.value = item.scheduled_time || '';
        form.itemSpeaker.value = item.speaker || '';
        form.itemDescription.value = item.description || '';
        form.itemIsTalk.checked = !!item.talk_number;
        form.itemTalkNumber.value = item.talk_number || '';
        form.itemCamLeft.value = item.cam_left || '';
        form.itemCamRight.value = item.cam_right || '';
        form.itemCamSpeaker.value = item.cam_speaker || '';
      }
    } else {
      titleEl.textContent = sent ? 'Nova Sentinela' : 'Nova parte';
      if (sent) form.itemTitle.value = 'A Sentinela';
      // Default scheduled time suggestion based on last item
      const lastItem = AppState.shiftData.items[AppState.shiftData.items.length - 1];
      if (lastItem && lastItem.scheduled_time) {
        form.itemScheduledTime.value = lastItem.scheduled_time;
      }
    }

    // Sentinela: cameras shown, "Discurso" box hidden but checked (the number is required)
    form.querySelector('.cam-group').hidden = !sent;
    form.querySelector('.talk-group .check-label').hidden = sent;
    if (sent) form.itemIsTalk.checked = true;

    this.syncTalkField(form);
    this.open('modal-item-editor');
  },

  // "Discurso" checkbox shows the talk number field (and requires it)
  syncTalkField(form) {
    const isTalk = form.itemIsTalk.checked;
    form.itemTalkNumber.hidden = !isTalk;
    form.itemTalkNumber.required = isTalk;
  },

  initTalkField() {
    const form = document.getElementById('form-item');
    if (!form) return;
    form.itemIsTalk.addEventListener('change', () => {
      this.syncTalkField(form);
      if (form.itemIsTalk.checked) form.itemTalkNumber.focus();
    });
  },

  // Pure payload builder; activity_type has no field, so edit sends the original back.
  buildItemPayload(form, original) {
    const payload = {
      title: form.itemTitle.value.trim(),
      scheduledTime: form.itemScheduledTime.value.trim(),
      speaker: form.itemSpeaker.value.trim(),
      activityType: this.itemSentinela ? 'sentinela' : (original ? (original.activity_type || '') : ''),
      description: form.itemDescription.value.trim(),
      // '' clears the number when "Discurso" is unchecked
      talkNumber: form.itemIsTalk.checked ? form.itemTalkNumber.value.trim() : ''
    };
    if (this.itemSentinela) {
      // '' clears a camera
      payload.camLeft = form.itemCamLeft.value.trim();
      payload.camRight = form.itemCamRight.value.trim();
      payload.camSpeaker = form.itemCamSpeaker.value.trim();
    }
    return payload;
  },

  async submitItem(form) {
    const original = this.itemEditId
      ? AppState.shiftData.items.find(i => i.id === Number(this.itemEditId))
      : null;
    const payload = this.buildItemPayload(form, original);

    if (!payload.title) {
      form.itemTitle.focus();
      window.showToast('Informe o título da parte.', 'warning');
      return;
    }
    if (!payload.scheduledTime) {
      form.itemScheduledTime.focus();
      window.showToast('Informe o horário previsto.', 'warning');
      return;
    }
    if (form.itemIsTalk.checked && !Logic.parseTalkNumber(payload.talkNumber)) {
      form.itemTalkNumber.focus();
      window.showToast('Informe o número do discurso (inteiro maior que zero).', 'warning');
      return;
    }
    if (this.itemSentinela) {
      const cams = [['camLeft', form.itemCamLeft], ['camRight', form.itemCamRight], ['camSpeaker', form.itemCamSpeaker]];
      for (const [key, input] of cams) {
        if (Logic.parsePositiveInt(payload[key]) === false) {
          input.focus();
          window.showToast('Câmera deve ser um número inteiro maior que zero.', 'warning');
          return;
        }
      }
    }

    try {
      if (this.itemEditId) {
        await Api.updateItem(this.itemEditId, payload);
      } else {
        await Api.createItem({ shiftId: AppState.selectedShiftId, ...payload });
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
  mediaSentinela: false,

  openMediaModal(itemId, mediaId = null) {
    this.mediaTargetItemId = itemId;
    this.mediaEditId = mediaId;
    const titleEl = document.getElementById('media-modal-title');
    const form = document.getElementById('form-media');
    form.reset();

    if (mediaId) {
      titleEl.textContent = 'Editar mídia';
      const item = AppState.shiftData.items.find(i => i.id === Number(itemId));
      const media = item && item.medias ? item.medias.find(m => m.id === Number(mediaId)) : null;
      if (media) {
        form.mediaTitle.value = media.title || '';
        this.setMediaType(form, media.type || 'other');
        form.mediaReference.value = Logic.mediaNotes(media.reference);
        form.mediaParagraph.value = media.paragraph || '';
      }
    } else {
      titleEl.textContent = 'Nova mídia';
      this.setMediaType(form, 'bible');
    }

    const parent = AppState.shiftData.items.find(i => i.id === Number(itemId));
    this.mediaSentinela = !!(parent && parent.activity_type === 'sentinela');
    form.querySelector('.media-paragraph-group').hidden = !this.mediaSentinela;

    this.open('modal-media-editor');
  },

  // Selects a type in the picker and mirrors it into the hidden input.
  setMediaType(form, type) {
    form.mediaType.value = type;
    form.querySelectorAll('.type-picker [role="radio"]').forEach(btn => {
      btn.setAttribute('aria-checked', String(btn.dataset.type === type));
    });
    const refLabel = form.querySelector('label[for="media-ref"]');
    if (refLabel) refLabel.textContent = Logic.notesLabel(type);
  },

  initMediaTypePicker() {
    const picker = document.querySelector('#form-media .type-picker');
    if (!picker) return;
    picker.addEventListener('click', e => {
      const btn = e.target.closest('[role="radio"]');
      if (btn) this.setMediaType(btn.closest('form'), btn.dataset.type);
    });
  },

  // Choice sheet: resolves the chosen option's value, or null when cancelled (✕).
  // options: [{ value, label, icon?, style?: 'accent' | 'danger' }]
  askChoice({ title, text = '', options }) {
    document.getElementById('choice-title').textContent = title;
    const textEl = document.getElementById('choice-text');
    textEl.textContent = text;
    textEl.hidden = !text;
    document.getElementById('choice-options').innerHTML = options.map(o => `
      <button type="button" class="btn ${o.style ? `btn-${o.style}` : 'btn-secondary'}" data-choice="${Logic.escapeHtml(o.value)}">
        ${o.icon ? window.icon(o.icon) : ''}<span>${Logic.escapeHtml(o.label)}</span>
      </button>`).join('');
    this.open('modal-choice');
    return new Promise(resolve => { this._choiceResolve = resolve; });
  },

  // + > Importar BK JW (.jwlibrary): pick a file, a target shift and (if it has parts) append/replace
  async importJwLibrary() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jwlibrary';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (file) await this._runJwLibraryImport(file);
    });
    input.click();
  },

  async _runJwLibraryImport(file) {
    const title = 'Importar BK JW';
    const options = [];
    for (const d of AppState.days) {
      for (const s of (d.shifts || [])) {
        options.push({ value: String(s.id), dayId: d.id, label: `${d.label} · ${s.name}`, style: s.id === AppState.selectedShiftId ? 'accent' : '' });
      }
    }
    if (!options.length) return;
    options.sort((a, b) => (b.style ? 1 : 0) - (a.style ? 1 : 0));
    const picked = await this.askChoice({ title, text: 'Em qual turno importar?', options });
    if (!picked) return;
    const shiftId = Number(picked);
    const dayId = options.find(o => o.value === picked).dayId;

    let count = 0;
    try {
      if (shiftId === AppState.selectedShiftId) {
        count = ((AppState.shiftData && AppState.shiftData.items) || []).length;
      } else {
        const full = await Api.getFullShiftData(shiftId);
        count = (full.items || []).length;
      }
    } catch (err) {
      window.showToast('Erro ao importar: ' + err.message, 'error');
      return;
    }

    let mode = 'append';
    if (count > 0) {
      mode = await this.askChoice({
        title,
        text: `Este turno já tem ${count === 1 ? '1 parte' : count + ' partes'}.`,
        options: [
          { value: 'append', label: 'Acrescentar abaixo', icon: 'plus', style: 'accent' },
          { value: 'replace', label: 'Substituir', icon: 'trash', style: 'danger' }
        ]
      });
      if (!mode) return;
    }

    const formData = new FormData();
    formData.append('mode', mode);
    formData.append('file', file);
    try {
      const r = await Api.request(`/api/shifts/${shiftId}/import-jwlibrary`, { method: 'POST', body: formData });
      const p = r.partsCount === 1 ? '1 parte importada' : `${r.partsCount} partes importadas`;
      const m = r.mediasCount === 1 ? '1 mídia' : `${r.mediasCount} mídias`;
      window.showToast(`${p}, ${m}.`, 'success');
      AppState.selectShift(dayId, shiftId);
      UIDirector.renderShiftLabel();
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast('Erro ao importar: ' + err.message, 'error');
    }
  },

  initFabHelp() {
    const modal = document.getElementById('modal-fab-help');
    if (!modal) return;
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-help-close]')) this.close('modal-fab-help');
    });
  },

  initChoice() {
    const modal = document.getElementById('modal-choice');
    if (!modal) return;
    modal.addEventListener('click', e => {
      const btn = e.target.closest('[data-choice]');
      if (!btn) return;
      const resolve = this._choiceResolve;
      this._choiceResolve = null;
      this.close('modal-choice');
      if (resolve) resolve(btn.dataset.choice || null);
    });
  },

  async submitMedia(form) {
    const title = form.mediaTitle.value.trim();
    const type = form.mediaType.value;
    const reference = form.mediaReference.value.trim();
    const extra = {};

    if (!title) {
      form.mediaTitle.focus();
      window.showToast('Informe o título da mídia.', 'warning');
      return;
    }
    if (this.mediaSentinela) {
      const paragraph = form.mediaParagraph.value.trim();
      if (Logic.parsePositiveInt(paragraph) === false) {
        form.mediaParagraph.focus();
        window.showToast('Informe o parágrafo (número inteiro maior que zero).', 'warning');
        return;
      }
      extra.paragraph = paragraph;
    }

    try {
      if (this.mediaEditId) {
        await Api.updateMedia(this.mediaEditId, {
          title,
          type,
          reference,
          ...extra
        });
      } else {
        await Api.createMedia({
          itemId: this.mediaTargetItemId,
          title,
          type,
          reference,
          ...extra
        });
      }
      this.close('modal-media-editor');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // QUESTION MODAL (Sentinela step)
  // ==========================================
  questionEditId: null,
  questionTargetItemId: null,
  questionPhoto: '', // photo in the form; saved only with the question

  // preset: { paragraph, side, afterId, people } prefilled (afterId: insert after that step; people: names saved this session) on create (used by "Salvar e próxima" and the director view)
  openQuestionModal(itemId, stepId = null, preset = {}) {
    this.questionTargetItemId = itemId;
    this.questionEditId = stepId;
    this.questionAfterId = stepId ? null : (preset.afterId || null);
    this.questionExtraPeople = preset.people || [];
    const form = document.getElementById('form-question');
    form.reset();
    const item = AppState.shiftData.items.find(i => i.id === Number(itemId));
    const steps = (item && item.medias) || [];

    const list = document.getElementById('question-people');
    const names = [...new Set([...steps.map(m => m.person), ...(preset.people || [])].map(n => (n || '').trim()).filter(Boolean))];
    list.innerHTML = names.map(n => `<option value="${Logic.escapeHtml(n)}"></option>`).join('');

    document.getElementById('question-modal-title').textContent = stepId ? 'Editar pergunta' : 'Nova pergunta';
    let paragraph = preset.paragraph, side = preset.side, person = '', title = '?', photo = '';
    if (stepId) {
      const step = steps.find(m => m.id === Number(stepId));
      if (step) {
        paragraph = step.paragraph; side = step.side; person = step.person || ''; title = step.title || '?';
        photo = Logic.isValidPhoto(step.photo || '') ? (step.photo || '') : ''; // a bad stored value must not block saving
      }
    }
    form.qParagraph.value = paragraph || '';
    this.setQuestionSide(form, side);
    form.qPerson.value = person;
    form.qTitle.value = title;
    this.setQuestionPhoto(photo);

    this.open('modal-question-editor');
    form.qPerson.focus();
  },

  // Selects a side in the picker and mirrors it into the hidden input.
  setQuestionSide(form, side) {
    const value = side === 'left' || side === 'right' ? side : '';
    form.qSide.value = value;
    form.querySelectorAll('.side-picker [role="radio"]').forEach(btn => {
      btn.setAttribute('aria-checked', String(btn.dataset.side === value));
    });
  },

  // Updates the form photo and its 3x4 frame (photo, or the initials of the typed name)
  setQuestionPhoto(photo) {
    this.questionPhoto = photo;
    this.renderQuestionPhoto();
  },

  renderQuestionPhoto() {
    const frame = document.getElementById('q-photo');
    const photo = this.questionPhoto;
    const hasPhoto = !!photo && Logic.isValidPhoto(photo);
    frame.innerHTML = hasPhoto
      ? `<img src="${photo}" alt="">`
      : Logic.escapeHtml(Logic.initials(document.getElementById('q-person').value));
    document.getElementById('q-photo-remove').hidden = !hasPhoto;
  },

  initQuestionForm() {
    const picker = document.querySelector('#form-question .side-picker');
    if (!picker) return;
    picker.addEventListener('click', e => {
      const btn = e.target.closest('[role="radio"]');
      if (btn) this.setQuestionSide(btn.closest('form'), btn.dataset.side);
    });
    document.getElementById('q-person').addEventListener('input', () => this.renderQuestionPhoto());
    const fileInput = document.getElementById('q-photo-input');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = ''; // choosing the same file again must fire change
      if (!file) return;
      const photo = await PhotoCropper.open(file);
      if (photo === null) return;
      if (!Logic.isValidPhoto(photo)) {
        window.showToast('Foto inválida ou grande demais.', 'error');
        return;
      }
      this.setQuestionPhoto(photo);
    });
  },

  // next: save, then reopen with the same § and side, empty person, "?" as question
  async submitQuestion(form, { next = false } = {}) {
    const checked = Logic.checkQuestionStep({
      paragraph: form.qParagraph.value,
      side: form.qSide.value,
      person: form.qPerson.value
    });
    if (checked.error) {
      window.showToast(checked.error, 'warning');
      return;
    }
    const body = {
      type: 'question',
      title: form.qTitle.value.trim() || '?',
      paragraph: checked.paragraph,
      side: checked.side,
      person: checked.person,
      photo: this.questionPhoto
    };
    const itemId = this.questionTargetItemId;

    let newId = null;
    try {
      if (this.questionEditId) {
        await Api.updateMedia(this.questionEditId, body);
      } else {
        const created = await Api.createMedia({ itemId, ...body, afterId: this.questionAfterId || undefined });
        newId = created && created.mediaId;
      }
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
      if (next) {
        this.openQuestionModal(itemId, null, {
          paragraph: checked.paragraph, side: checked.side,
          afterId: newId || this.questionAfterId,
          people: [...this.questionExtraPeople, checked.person]
        });
      } else {
        this.close('modal-question-editor');
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // SETTINGS MODAL (STRUCTURE, EVENT, PINS)
  // ==========================================
  openSettingsModal() {
    this.renderSettingsGeneral();
    this.open('modal-settings');
  },

  renderSettingsGeneral() {
    const form = document.getElementById('form-settings-general');
    if (!form || !AppState.event) return;
    form.eventName.value = AppState.event.name || '';
    form.eventCategory.value = AppState.event.category || '';
  },

  // ==========================================
  // DAY & SHIFT DRAWER
  // ==========================================
  openShiftPicker() {
    this.renderShiftPicker();
    this.open('modal-shift-picker');
  },

  // Builds the drawer HTML (string) and, when the container exists, injects it.
  renderShiftPicker() {
    const esc = Logic.escapeHtml;
    const editing = AppState.mode === 'editor';
    const days = AppState.days || [];
    const btn = (action, attrs, name, label, cls = '') =>
      `<button type="button" class="icon-btn ${cls}" data-action="${action}" ${attrs} title="${label}" aria-label="${label}">${window.icon(name, 20)}</button>`;
    const moreBtn = (action, id, label) =>
      btn(action, `data-id="${Number(id)}" aria-haspopup="menu" aria-expanded="false"`, 'more', label, 'more-btn edit-only');

    let html = '';
    days.forEach(day => {
      const shifts = day.shifts || [];
      html += `<div class="row row-day">
        <span class="row-grow">${esc(day.label)} <span class="row-muted-date">${esc(day.date)}</span></span>`;
      if (editing) {
        html += btn('add-shift', `data-id="${Number(day.id)}"`, 'plus', 'Novo turno', 'edit-only');
        html += moreBtn('day-menu', day.id, 'Ações do dia');
      }
      html += '</div>';
      shifts.forEach(shift => {
        const selected = shift.id === AppState.selectedShiftId;
        html += `<div class="row row-shift${selected ? ' selected' : ''}" data-action="select-shift" data-day-id="${Number(day.id)}" data-id="${Number(shift.id)}" role="button" tabindex="0">
          <span class="row-grow">${esc(shift.name)}</span>`;
        if (selected) html += `<span class="row-accent">${window.icon('check', 20)}</span>`;
        if (editing) html += moreBtn('shift-menu', shift.id, 'Ações do turno');
        html += '</div>';
      });
    });
    if (editing) {
      html += `<div class="row row-accent" data-action="add-day" role="button" tabindex="0">${window.icon('plus', 20)}<span>Novo dia</span></div>`;
    }
    if (!days.length) html = '<div class="row row-static">Nenhum dia cadastrado.</div>';

    const container = document.getElementById('shift-picker-container');
    if (container) container.innerHTML = html;
    return html;
  },

  // Menu of a day or shift: rename, delete (two taps). The last day/shift cannot be deleted.
  openShiftPickerMenu(el) {
    const id = Number(el.dataset.id);
    const run = action => this.handleShiftPickerAction({ dataset: { action, id: String(id) } });
    if (el.dataset.action === 'day-menu') {
      const actions = [{ icon: 'pencil', label: 'Renomear dia', onClick: () => run('edit-day') }];
      if ((AppState.days || []).length > 1) {
        actions.push({ icon: 'trash', label: 'Excluir dia', danger: true, onClick: () => run('delete-day') });
      }
      UIDirector.openRowMenu(el, actions);
    } else {
      const found = this._findShift(id);
      if (!found) return;
      const actions = [{ icon: 'pencil', label: 'Renomear turno', onClick: () => run('edit-shift') }];
      if ((found.day.shifts || []).length > 1) {
        actions.push({ icon: 'trash', label: 'Excluir turno', danger: true, onClick: () => run('delete-shift') });
      }
      UIDirector.openRowMenu(el, actions);
    }
  },

  _findShift(shiftId) {
    for (const d of AppState.days) {
      const s = (d.shifts || []).find(x => x.id === shiftId);
      if (s) return { day: d, shift: s };
    }
    return null;
  },

  async handleShiftPickerAction(el) {
    const action = el.dataset.action;
    const id = Number(el.dataset.id);
    const dayId = Number(el.dataset.dayId);
    if (action === 'select-shift') {
      AppState.selectShift(dayId, id);
      this.close('modal-shift-picker');
      UIDirector.renderShiftLabel();
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
      return;
    }
    const day = AppState.days.find(d => d.id === id);
    const found = this._findShift(id);
    const refresh = () => window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
    const back = () => this.openShiftPicker();

    if (action === 'add-day') {
      this.openQuickForm({
        title: 'Novo dia',
        fields: [
          { name: 'label', label: 'Rótulo', type: 'text', required: true },
          { name: 'date', label: 'Data', type: 'date', value: Logic.localDateISO(new Date()), required: true }
        ],
        onSubmit: async v => { await Api.createDay({ eventId: AppState.event.id, label: v.label, date: v.date }); refresh(); back(); },
        onCancel: back
      });
    } else if (action === 'edit-day' && day) {
      this.openQuickForm({
        title: 'Editar dia',
        fields: [
          { name: 'label', label: 'Rótulo', type: 'text', value: day.label, required: true },
          { name: 'date', label: 'Data', type: 'date', value: day.date, required: true }
        ],
        onSubmit: async v => { await Api.updateDay(day.id, { label: v.label, date: v.date }); refresh(); back(); },
        onCancel: back
      });
    } else if (action === 'delete-day' && day) {
      try { await Api.deleteDay(day.id); refresh(); } catch (err) { window.showToast(err.message, 'error'); }
    } else if (action === 'add-shift' && day) {
      this.openQuickForm({
        title: 'Novo turno',
        fields: [{ name: 'name', label: 'Nome do turno', type: 'text', required: true }],
        onSubmit: async v => { await Api.createShift({ dayId: day.id, name: v.name }); refresh(); back(); },
        onCancel: back
      });
    } else if (action === 'edit-shift' && found) {
      const s = found.shift;
      this.openQuickForm({
        title: 'Renomear turno',
        fields: [{ name: 'name', label: 'Nome do turno', type: 'text', value: s.name, required: true }],
        onSubmit: async v => {
          await Api.updateShift(s.id, { name: v.name, startTime: s.start_time || '', endTime: s.end_time || '' });
          refresh(); back();
        },
        onCancel: back
      });
    } else if (action === 'delete-shift' && found) {
      try { await Api.deleteShift(found.shift.id); refresh(); } catch (err) { window.showToast(err.message, 'error'); }
    }
  },

  _onShiftPickerEl(el) {
    if (el.dataset.action === 'day-menu' || el.dataset.action === 'shift-menu') this.openShiftPickerMenu(el);
    else this.handleShiftPickerAction(el);
  },

  initShiftPicker() {
    const container = document.getElementById('shift-picker-container');
    if (!container || container.dataset.bound) return;
    container.dataset.bound = '1';
    container.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (el && container.contains(el)) this._onShiftPickerEl(el);
    });
    container.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('[data-action]');
      if (el && el === e.target) { e.preventDefault(); this._onShiftPickerEl(el); }
    });
  },

  // Generic quick form. fields: {name, label, type:'text'|'date'|'time', value?, required?}[]
  openQuickForm({ title, fields, onSubmit, onCancel }) {
    const esc = Logic.escapeHtml;
    const form = document.getElementById('quick-form');
    document.getElementById('quick-form-title').textContent = title;
    document.getElementById('quick-form-fields').innerHTML = fields.map(f => `
      <div class="form-group">
        <label class="form-label" for="qf-${esc(f.name)}">${esc(f.label)}</label>
        <input class="form-input" id="qf-${esc(f.name)}" name="${esc(f.name)}" type="${esc(f.type || 'text')}"
          value="${esc(f.value == null ? '' : f.value)}"${f.required ? ' required' : ''} autocomplete="off">
      </div>`).join('');

    const cancel = () => { this.close('modal-quick-form'); if (onCancel) onCancel(); };
    document.getElementById('quick-form-cancel').onclick = cancel;
    this._quickFormCancel = cancel; // Esc behaves like the ✕
    let busy = false;
    form.onsubmit = async e => {
      e.preventDefault();
      if (busy) return;
      const values = {};
      for (const f of fields) {
        const v = form.elements[f.name].value.trim();
        if (f.required && !v) { form.elements[f.name].focus(); return; }
        values[f.name] = v;
      }
      busy = true;
      try {
        this.close('modal-quick-form');
        await onSubmit(values);
      } catch (err) {
        window.showToast(err.message, 'error');
        if (onCancel) onCancel();
      } finally {
        busy = false;
      }
    };
    this.open('modal-quick-form');
  },

  async submitSettingsGeneral(form) {
    const name = form.eventName.value.trim();
    const category = form.eventCategory.value.trim();
    if (!name) {
      form.eventName.focus();
      window.showToast('O nome do evento não pode ficar vazio.', 'warning');
      return;
    }
    try {
      await Api.updateEvent(AppState.event.id, { name, category });
      this.close('modal-settings'); // closing is the success feedback (no toast)
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async submitSettingsPins(form) {
    const dirPin = form.newDirectorPin.value.trim();
    const admPin = form.newAdminPin.value.trim();
    if (!dirPin && !admPin) {
      form.newDirectorPin.focus();
      window.showToast('Digite um novo PIN para atualizar.', 'warning');
      return;
    }
    if (dirPin && !/^\d{4}$/.test(dirPin)) {
      form.newDirectorPin.focus();
      window.showToast('O PIN do diretor deve ter 4 dígitos.', 'warning');
      return;
    }
    if (admPin && !/^\d{4}$/.test(admPin)) {
      form.newAdminPin.focus();
      window.showToast('O PIN de admin deve ter 4 dígitos.', 'warning');
      return;
    }
    try {
      await Api.updateEventPins(AppState.event.id, {
        directorPin: dirPin || undefined,
        adminPin: admPin || undefined
      });
      form.reset();
      this.close('modal-settings'); // closing is the success feedback (no toast)
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // EVENT BACKUP & RESTORE
  // ==========================================
  async downloadEventBackup() {
    try {
      await Api.downloadBackup();
    } catch (err) {
      window.showToast('Erro ao baixar backup: ' + err.message, 'error');
    }
  },

  // btn: the restore button; first tap arms it (UIDirector.confirmDelete), second tap restores
  restoreEventBackup(btn) {
    const fileInput = document.getElementById('backup-file-input');
    const keepPinsCheckbox = document.getElementById('backup-keep-pins');
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) {
      window.showToast('Selecione um arquivo .json de backup para restaurar.', 'warning');
      return;
    }

    UIDirector.confirmDelete(btn, async () => {
      const keepPins = keepPinsCheckbox ? keepPinsCheckbox.checked : true;
      const text = await file.text().catch(() => { throw new Error('Erro ao ler o arquivo de backup.'); });
      let backupData;
      try {
        backupData = JSON.parse(text);
      } catch (parseErr) {
        throw new Error('O arquivo selecionado não é um JSON válido.');
      }
      try {
        await Api.restoreBackup(backupData, keepPins);
      } catch (err) {
        throw new Error('Falha na restauração: ' + err.message);
      }
      fileInput.value = '';
      this.close('modal-settings');
      // The screen reloads with the restored data
      window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
    });
  },

  // ==========================================
  // LAN CONNECTION & QR CODE MODAL
  // ==========================================
  openLanModal() {
    const fill = () => {
      const qrImg = document.getElementById('lan-qrcode-img');
      const urlText = document.getElementById('lan-url-display');
      if (!AppState.lanInfo) return;
      if (qrImg) qrImg.src = AppState.lanInfo.qrCode || '';
      if (urlText) urlText.textContent = AppState.lanInfo.lanUrl || AppState.lanInfo.localUrl || 'Nenhum IP detectado';
    };
    fill();
    // Not loaded yet (first setup, or login after the start screen): fetch it now and fill when it arrives
    if (!AppState.lanInfo) {
      Api.getLanInfo()
        .then(info => { AppState.setLanInfo(info); fill(); })
        .catch(err => console.warn('Could not load LAN info:', err));
    }
    this.open('modal-lan-connect');
  },

  async copyLanUrl() {
    const url = AppState.lanInfo && (AppState.lanInfo.lanUrl || AppState.lanInfo.localUrl);
    if (!url) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch (e) {
      // Plain http on the LAN has no clipboard API: fall back to a temporary textarea
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
    }
    if (ok) window.showToast('Endereço copiado', 'success');
    else window.showToast('Não foi possível copiar o endereço.', 'error');
  }
};

window.Modals = Modals;
