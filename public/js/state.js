/**
 * EventosAPP - Central Application State
 * Reactive reactive-store with subscribers
 */

const AppState = {
  // Authentication & Mode
  token: localStorage.getItem('eventos_token') || null,
  role: localStorage.getItem('eventos_role') || null, // 'director' | 'admin'
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

    // Auto-select day if none selected or if invalid
    if (!this.selectedDayId || !this.days.find(d => d.id === this.selectedDayId)) {
      if (this.days.length > 0) {
        this.selectedDayId = this.days[0].id;
      } else {
        this.selectedDayId = null;
      }
    }

    // Auto-select shift
    this.autoSelectShift();
    this.notify('HIERARCHY_UPDATED', { event, days });
  },

  autoSelectShift() {
    const currentDay = this.days.find(d => d.id === this.selectedDayId);
    if (currentDay && currentDay.shifts && currentDay.shifts.length > 0) {
      if (!this.selectedShiftId || !currentDay.shifts.find(s => s.id === this.selectedShiftId)) {
        this.selectedShiftId = currentDay.shifts[0].id;
      }
    } else {
      this.selectedShiftId = null;
    }
  },

  setShiftData(data) {
    this.shiftData = data || { shift: null, items: [] };
    const items = this.shiftData.items || [];
    const itemStillExists = this.currentItemId && items.some(i => i.id === this.currentItemId);

    // Keep locally selected item if it still exists; otherwise fallback to first item or shift default
    if (!itemStillExists) {
      if (data && data.shift && data.shift.current_item_id && items.some(i => i.id === data.shift.current_item_id)) {
        this.currentItemId = data.shift.current_item_id;
      } else if (items.length > 0) {
        this.currentItemId = items[0].id;
      } else {
        this.currentItemId = null;
      }
    }

    this.notify('SHIFT_DATA_UPDATED', this.shiftData);
  },

  setCurrentItemId(itemId) {
    this.currentItemId = itemId ? Number(itemId) : null;
    this.notify('CURRENT_ITEM_CHANGED', { itemId: this.currentItemId });
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
