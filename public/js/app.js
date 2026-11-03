/**
 * EventosAPP - Main Application Entrypoint
 * Orchestration, lifecycle, keyboard shortcuts, and events
 */

// Toast notification helper
window.showToast = function(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// Initialize App
async function initApp() {
  hydrateStaticIcons();
  setupGlobalShortcuts();
  setupEventListeners();

  try {
    // 1. Fetch System Status
    const status = await Api.getStatus();

    if (status.needsSetup) {
      // Need initial setup
      Modals.open('modal-initial-setup');
      return;
    }

    // 2. Load LAN info
    loadLanInfo();

    // 3. Verify Session
    if (!AppState.token) {
      Modals.openPinModal('login');
      return;
    }

    try {
      const verify = await Api.verifySession();
      if (!verify.valid) {
        Modals.openPinModal('login');
        return;
      }
      AppState.role = verify.role;
    } catch (e) {
      Modals.openPinModal('login');
      return;
    }

    // 4. Load Event & Program Data
    await loadEventHierarchy();

    // 5. Connect WebSocket for Real-time LAN sync
    SocketClient.connect();

  } catch (err) {
    console.error('Initialization error:', err);
    window.showToast('Erro ao inicializar aplicação: ' + err.message, 'error');
  }
}

// Fill static [data-icon] placeholders in index.html with SVG icons
function hydrateStaticIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const size = el.dataset.iconSize ? Number(el.dataset.iconSize) : undefined;
    el.innerHTML = icon(el.dataset.icon, size);
  });
}

// Fetch LAN info (IP addresses, QR Code)
async function loadLanInfo() {
  try {
    const lan = await Api.getLanInfo();
    AppState.setLanInfo(lan);
  } catch (e) {
    console.warn('Could not load LAN info:', e);
  }
}

// Fetch Event Hierarchy (Event -> Days -> Shifts)
async function loadEventHierarchy() {
  try {
    const data = await Api.getActiveEvent();
    AppState.setEventHierarchy(data.event, data.days);

    // Update "Dia · Turno" chip
    UIDirector.renderShiftLabel();

    // Load full shift data
    await loadShiftData();
  } catch (err) {
    console.error('Error loading hierarchy:', err);
  }
}

// Fetch Full Shift Data (Items + Medias)
async function loadShiftData() {
  if (!AppState.selectedShiftId) {
    AppState.setShiftData({ shift: null, items: [] });
    UIDirector.render();
    return;
  }

  try {
    const data = await Api.getFullShiftData(AppState.selectedShiftId);
    AppState.setShiftData(data);
    UIDirector.render();
  } catch (err) {
    console.error('Error loading shift data:', err);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Mode Toggle Button (Director <-> Editor)
  const modeBtn = document.getElementById('btn-mode-toggle');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      toggleMode();
    });
  }

  // Day/shift chip -> day & shift drawer
  Modals.initShiftPicker();
  const shiftBtn = document.getElementById('btn-shift-picker');
  if (shiftBtn) {
    shiftBtn.addEventListener('click', () => Modals.openShiftPicker());
  }

  // Connection icon -> LAN / connection sheet
  const connBtn = document.getElementById('btn-connection');
  if (connBtn) {
    connBtn.addEventListener('click', () => Modals.openLanModal());
  }

  // Settings (edit mode only)
  const settingsBtn = document.getElementById('btn-open-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => Modals.openSettingsModal());
  }

  // Logout (inside the LAN modal for now)
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Api.logout());
  }

  // Custom App Events
  window.addEventListener('refresh-shift-data', () => {
    loadShiftData();
  });

  window.addEventListener('import-playlist', async (e) => {
    const { itemId, file } = e.detail;
    const formData = new FormData();
    formData.append('playlist', file);
    try {
      const resp = await Api.request(`/api/items/${itemId}/import-playlist`, {
        method: 'POST',
        body: formData
      });
      console.log('Import response:', resp);
      const count = resp.importedCount || 0;
      window.showToast(`Playlist importada com sucesso. ${count} mídia(s) adicionada(s).`, 'success');
      window.dispatchEvent(new CustomEvent('refresh-shift-data'));
    } catch (err) {
      console.error(err);
      window.showToast('Erro ao importar playlist: ' + err.message, 'error');
    }
  });

  window.addEventListener('refresh-hierarchy-data', () => {
    loadEventHierarchy();
  });

  window.addEventListener('init-app-data', () => {
    loadEventHierarchy();
    SocketClient.connect();
  });

  window.addEventListener('auth-required', () => {
    Modals.openPinModal('login');
  });

  // State Subscriptions
  AppState.subscribe((eventType, payload) => {
    if (eventType === 'HIERARCHY_UPDATED') {
      UIDirector.renderShiftLabel();
      const picker = document.getElementById('modal-shift-picker');
      if (picker && picker.classList.contains('open')) Modals.renderShiftPicker();
    } else if (eventType === 'MODE_CHANGED') {
      const isEditor = payload.mode === 'editor';
      const modeBtn = document.getElementById('btn-mode-toggle');
      if (modeBtn) {
        modeBtn.classList.toggle('is-on', isEditor);
        modeBtn.setAttribute('aria-pressed', String(isEditor));
      }
      if (!isEditor) UIDirector.closeEditOverlays();
      UIDirector.render();
    } else if (eventType === 'WS_STATUS_CHANGED') {
      const connBtn = document.getElementById('btn-connection');
      if (connBtn) {
        const state = payload.state === 'online' ? 'online' : (payload.state === 'reconnecting' ? 'reconnecting' : 'offline');
        const label = state === 'online' ? 'Conectado' : (state === 'reconnecting' ? 'Reconectando' : 'Desconectado');
        connBtn.classList.remove('is-online', 'is-reconnecting', 'is-offline');
        connBtn.classList.add(`is-${state}`);
        connBtn.innerHTML = icon(state === 'offline' ? 'wifi-off' : 'wifi');
        connBtn.title = `Conexão: ${label}`;
        connBtn.setAttribute('aria-label', `Conexão: ${label}`);
      }
    } else if (eventType === 'CURRENT_ITEM_CHANGED' || eventType === 'MEDIA_TOGGLED' || eventType === 'ITEM_TOGGLED') {
      UIDirector.render();
    }
  });
}

// Toggle Mode Handler
function toggleMode() {
  if (AppState.mode === 'director') {
    // Switching to Editor mode
    if (AppState.role === 'admin') {
      // Already admin session
      AppState.setMode('editor');
    } else {
      // Need Admin PIN
      Modals.openPinModal('upgrade');
    }
  } else {
    // Returning to Director mode
    AppState.setMode('director');
  }
}

// Global Keyboard Shortcuts
function setupGlobalShortcuts() {
  window.addEventListener('keydown', (e) => {
    // If typing in input or modal open, handle specifically
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

    // PIN modal keypad listener
    if (Modals.activeModal && Modals.activeModal.id === 'modal-pin-auth') {
      if (e.key >= '0' && e.key <= '9') {
        Modals.handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        Modals.handlePinBackspace();
      } else if (e.key === 'Enter') {
        Modals.submitPin();
      } else if (e.key === 'Escape') {
        Modals.close('modal-pin-auth');
      }
      return;
    }

    if (e.key === 'Escape') {
      Modals.closeAll();
      return;
    }

    if (isInput) return;

    // Director navigation shortcuts
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      UIDirector.navigatePrevious();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      UIDirector.navigateNext();
    } else if (e.key === 'e' || e.key === 'E') {
      // Toggle mode
      e.preventDefault();
      toggleMode();
    }
  });
}

// Tab navigation inside modals
function switchModalTab(tabId, btn) {
  const modal = btn.closest('.modal-dialog');
  if (!modal) return;
  modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  modal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add('active');
}

window.switchModalTab = switchModalTab;

// Start on DOM ready
document.addEventListener('DOMContentLoaded', initApp);
