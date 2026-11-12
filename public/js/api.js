/**
 * EventosAPP - API & WebSocket Layer
 * Handles REST requests and Real-time WebSocket synchronization across LAN
 */

const Api = {
  // REST Request Wrapper
  async request(endpoint, options = {}) {
    const headers = {
      ...(options.headers || {})
    };
    // If sending JSON body, ensure Content-Type
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (AppState.token) {
      headers['Authorization'] = `Bearer ${AppState.token}`;
    }

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Login and upgrade 401s are handled by the PIN keypad (upgrade re-checks the session via verify)
        if (response.status === 401 && endpoint !== '/api/auth/login' && endpoint !== '/api/auth/upgrade') {
          // Token expired or invalid
          AppState.setAuth(null, null);
          // Leave edit mode too, so a director re-login does not keep ⋯/+/⚙ visible
          if (AppState.mode !== 'director') AppState.setMode('director');
          window.dispatchEvent(new CustomEvent('auth-required'));
        }
        const error = new Error(data.error || `Erro HTTP ${response.status}`);
        error.status = response.status;
        if (data.remainingSeconds != null) error.remainingSeconds = data.remainingSeconds;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Public & Auth Endpoints
  async getStatus() {
    return this.request('/api/status');
  },

  async getLanInfo() {
    return this.request('/api/lan-info');
  },

  async setup(data) {
    return this.request('/api/setup', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async login(pin) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin })
    });
  },

  async verifySession() {
    return this.request('/api/auth/verify');
  },

  async upgradeSession(pin) {
    return this.request('/api/auth/upgrade', {
      method: 'POST',
      body: JSON.stringify({ pin })
    });
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Local logout always completes, even if the server is unreachable
    } finally {
      AppState.setAuth(null, null);
      AppState.setMode('director');
      Modals.closeAll();
      window.dispatchEvent(new CustomEvent('auth-required'));
    }
  },

  // Event Hierarchy Endpoints
  async getActiveEvent() {
    return this.request('/api/events/active');
  },

  async updateEvent(id, data) {
    return this.request(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async updateEventPins(id, data) {
    return this.request(`/api/events/${id}/pins`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // Days Endpoints
  async createDay(data) {
    return this.request('/api/days', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateDay(id, data) {
    return this.request(`/api/days/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteDay(id) {
    return this.request(`/api/days/${id}`, {
      method: 'DELETE'
    });
  },

  // Shifts Endpoints
  async createShift(data) {
    return this.request('/api/shifts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateShift(id, data) {
    return this.request(`/api/shifts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteShift(id) {
    return this.request(`/api/shifts/${id}`, {
      method: 'DELETE'
    });
  },

  async getFullShiftData(shiftId) {
    return this.request(`/api/shifts/${shiftId}/full`);
  },

  async setCurrentItem(shiftId, currentItemId) {
    return this.request(`/api/shifts/${shiftId}/current-item`, {
      method: 'POST',
      body: JSON.stringify({ currentItemId })
    });
  },

  // Camera plans
  async getCameraPlans() {
    return this.request('/api/camera-plans');
  },

  async createCameraPlan(data) {
    return this.request('/api/camera-plans', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateCameraPlan(id, data) {
    return this.request(`/api/camera-plans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  // Default framing CAM per role: { speaker, president, interview }
  async getFramingDefaults() {
    return this.request('/api/framing-defaults');
  },

  async setFramingDefaults(data) {
    return this.request('/api/framing-defaults', { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteCameraPlan(id) {
    return this.request(`/api/camera-plans/${id}`, { method: 'DELETE' });
  },

  // Items Endpoints
  async createItem(data) {
    return this.request('/api/items', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateItem(id, data) {
    return this.request(`/api/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async reorderItems(shiftId, orderedIds) {
    return this.request('/api/items/reorder', {
      method: 'PUT',
      body: JSON.stringify({ shiftId, orderedIds })
    });
  },

  async deleteItem(id) {
    return this.request(`/api/items/${id}`, {
      method: 'DELETE'
    });
  },

  async toggleItemCompleted(itemId) {
    return this.request(`/api/items/${itemId}/toggle`, {
      method: 'POST'
    });
  },

  // Medias Endpoints
  async createMedia(data) {
    return this.request('/api/medias', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateMedia(id, data) {
    return this.request(`/api/medias/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async reorderMedias(itemId, orderedIds) {
    return this.request('/api/medias/reorder', {
      method: 'PUT',
      body: JSON.stringify({ itemId, orderedIds })
    });
  },

  async toggleMediaCompleted(mediaId) {
    return this.request(`/api/medias/${mediaId}/toggle`, {
      method: 'POST'
    });
  },

  async deleteMedia(id) {
    return this.request(`/api/medias/${id}`, {
      method: 'DELETE'
    });
  },

  // Backup & Restore
  async downloadBackup() {
    const token = AppState.token;
    const res = await fetch('/api/backup/export', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao exportar backup.');
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    let filename = 'eventosapp-backup.json';
    if (disposition && disposition.includes('filename=')) {
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '');
      }
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async restoreBackup(backupData) {
    return this.request('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ backupData })
    });
  }
};

// ============================================
// Real-time WebSocket Client
// ============================================
const SocketClient = {
  socket: null,
  reconnectAttempts: 0,
  maxReconnectDelay: 10000,
  reconnectTimeout: null,
  pingInterval: null,

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        AppState.setWsStatus(true, 'online');
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleServerMessage(message);
        } catch (e) {
          console.error('Invalid WS message payload:', event.data);
        }
      };

      this.socket.onclose = () => {
        this.cleanupHeartbeat();
        AppState.setWsStatus(false, 'offline');
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn('WebSocket encountered error:', err);
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  },

  startHeartbeat() {
    this.cleanupHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);
  },

  cleanupHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
  },

  scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    AppState.setWsStatus(false, 'reconnecting');

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  },

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'CONNECTED':
        // If reconnected after being disconnected, refresh shift data
        if (AppState.selectedShiftId) {
          window.dispatchEvent(new CustomEvent('refresh-shift-data'));
        }
        // A CAMERA_PLANS_UPDATED may have been missed while disconnected
        window.dispatchEvent(new CustomEvent('refresh-camera-plans'));
        break;

      case 'CURRENT_ITEM_CHANGED':
        // Navigation is independent per device; do not override user's locally selected part
        break;

      case 'MEDIA_TOGGLED':
        AppState.toggleMediaCompleted(msg.data.mediaId, msg.data.completed);
        break;

      case 'ITEM_TOGGLED':
        AppState.toggleItemCompleted(msg.data.itemId, msg.data.completed);
        break;

      case 'PROGRAM_UPDATED':
        if (!msg.data.shiftId || msg.data.shiftId === AppState.selectedShiftId) {
          window.dispatchEvent(new CustomEvent('refresh-shift-data'));
        }
        break;

      case 'CAMERA_PLANS_UPDATED':
        window.dispatchEvent(new CustomEvent('refresh-camera-plans'));
        window.dispatchEvent(new CustomEvent('refresh-shift-data'));
        break;

      case 'EVENT_UPDATED':
      case 'EVENT_SETUP_COMPLETED':
        window.dispatchEvent(new CustomEvent('refresh-hierarchy-data'));
        break;
    }
  }
};

window.Api = Api;
window.SocketClient = SocketClient;
