/**
 * EventosAPP - Central Application State
 * Reactive reactive-store with subscribers
 */

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

const AppState = {
  // Authentication & Mode
  token: safeStorageGet('eventos_token') || null,
  role: safeStorageGet('eventos_role') || null, // 'director' | 'admin'
  mode: 'director', // 'director' | 'editor' (director is ALWAYS the default per PRD)

  // Hierarchy Data
  event: null,
  days: [],
  selectedDayId: null,
  selectedShiftId: null,

  // Current Shift Full Data
  shiftData: {
    shift: null,
    items: []
  },

  // Operational State
  currentItemId: null,

  // Connection & LAN
  wsConnected: false,
  lanInfo: null,

  // Listeners
  _subscribers: new Set(),

  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  },

  notify(eventType, payload) {
    this._subscribers.forEach(cb => {
      try {
        cb(eventType, payload, this);
      } catch (err) {
        console.error('Subscriber error:', err);
      }
    });
  },

  setAuth(token, role) {
    this.token = token;
    this.role = role;
    if (token) {
      localStorage.setItem('eventos_token', token);
      localStorage.setItem('eventos_role', role);
    } else {
      localStorage.removeItem('eventos_token');
      localStorage.removeItem('eventos_role');
    }
    this.notify('AUTH_CHANGED', { token, role });
  },

  setMode(mode) {
    this.mode = mode;
    document.body.classList.toggle('mode-editor', mode === 'editor');
    this.notify('MODE_CHANGED', { mode });
  },

  setLanInfo(info) {
    this.lanInfo = info;
    this.notify('LAN_INFO_UPDATED', info);
  },

  setWsStatus(connected, state = 'online') {
    this.wsConnected = connected;
    this.notify('WS_STATUS_CHANGED', { connected, state });
  },

  setEventHierarchy(event, days) {
    this.event = event;
    this.days = days || [];

    const shiftExists = this.selectedShiftId != null && this.days.some(
      d => d.id === this.selectedDayId && (d.shifts || []).some(s => s.id === this.selectedShiftId)
    );
    if (!shiftExists) {
      let saved = null;
      try {
        const raw = localStorage.getItem('eventos_shift_id');
        if (raw != null) saved = Number(raw);
      } catch (e) { /* storage unavailable */ }
      const pick = Logic.pickInitialShift(this.days, Number.isFinite(saved) ? saved : null);
      if (pick) {
        this.selectedDayId = pick.dayId;
        this.selectedShiftId = pick.shiftId;
      } else {
        this.selectedDayId = this.days.length > 0 ? this.days[0].id : null;
        this.selectedShiftId = null;
      }
    }
    this.notify('HIERARCHY_UPDATED', { event, days });
  },

  selectShift(dayId, shiftId) {
    this.selectedDayId = Number(dayId);
    this.selectedShiftId = Number(shiftId);
    this.currentItemId = null;
    try {
      localStorage.setItem('eventos_shift_id', String(this.selectedShiftId));
    } catch (e) { /* storage unavailable */ }
    this.notify('SHIFT_SELECTED', { dayId: this.selectedDayId, shiftId: this.selectedShiftId });
  },

  setShiftData(data) {
    this.shiftData = data || { shift: null, items: [] };
    const items = this.shiftData.items || [];
    const itemStillExists = this.currentItemId && items.some(i => i.id === this.currentItemId);

    // Keep locally selected item if it still exists; otherwise this device's last part for the shift,
    // then the shift default, then the first part
    if (!itemStillExists) {
      const shiftId = data && data.shift ? data.shift.id : this.selectedShiftId;
      const serverItemId = data && data.shift ? data.shift.current_item_id : null;
      this.currentItemId = Logic.pickInitialItem(items, this._savedItemIds()[shiftId] ?? null, serverItemId);
    }

    this.notify('SHIFT_DATA_UPDATED', this.shiftData);
  },

  setCurrentItemId(itemId) {
    this.currentItemId = itemId ? Number(itemId) : null;
    if (this.selectedShiftId && this.currentItemId) {
      const saved = this._savedItemIds();
      saved[this.selectedShiftId] = this.currentItemId;
      try {
        localStorage.setItem('eventos_item_ids', JSON.stringify(saved));
      } catch (e) { /* storage unavailable */ }
    }
    this.notify('CURRENT_ITEM_CHANGED', { itemId: this.currentItemId });
  },

  // Last selected part per shift on this device: { [shiftId]: itemId }
  _savedItemIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem('eventos_item_ids') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  // Current step of a Sentinela on this device: the saved one if it still exists, else the first (null when none)
  getStepId(item) {
    if (!item) return null;
    const stepIds = (item.medias || []).map(m => m.id);
    return Logic.pickInitialStep(stepIds, this._savedStepIds()[item.id] ?? null);
  },

  setStepId(itemId, stepId) {
    const saved = this._savedStepIds();
    saved[Number(itemId)] = Number(stepId);
    try {
      localStorage.setItem('eventos_step_ids', JSON.stringify(saved));
    } catch (e) { /* storage unavailable */ }
    this.notify('STEP_CHANGED', { itemId: Number(itemId), stepId: Number(stepId) });
  },

  // Last current step per Sentinela part on this device: { [itemId]: stepId }
  _savedStepIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem('eventos_step_ids') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  toggleMediaCompleted(mediaId, completed) {
    if (!this.shiftData || !this.shiftData.items) return;
    for (const item of this.shiftData.items) {
      if (item.medias) {
        const found = item.medias.find(m => m.id === Number(mediaId));
        if (found) {
          found.completed = completed ? 1 : 0;
          this.notify('MEDIA_TOGGLED', { mediaId, completed, itemId: item.id });
          return;
        }
      }
    }
  },

  toggleItemCompleted(itemId, completed) {
    if (!this.shiftData || !this.shiftData.items) return;
    const item = this.shiftData.items.find(i => i.id === Number(itemId));
    if (item) {
      item.completed = completed ? 1 : 0;
      this.notify('ITEM_TOGGLED', { itemId: item.id, completed: Boolean(completed) });
    }
  },

  getCurrentItem() {
    if (!this.shiftData || !this.shiftData.items || !this.currentItemId) return null;
    return this.shiftData.items.find(i => i.id === this.currentItemId) || null;
  }
};

window.AppState = AppState;
