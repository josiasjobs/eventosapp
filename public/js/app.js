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

// Mobile Header Menu Toggle
function toggleMobileMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('mobile-header-menu');
  if (menu) menu.classList.toggle('open');
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-header-menu');
  if (menu) menu.classList.remove('open');
}

window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;

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

    // Update Header Brand & Selectors
    updateHeaderSelectors();

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

// Update Header Day & Shift Selectors
function updateHeaderSelectors() {
  const eventNameEl = document.getElementById('header-event-name');
  if (eventNameEl && AppState.event) {
    eventNameEl.textContent = AppState.event.name;
  }

  const daySelect = document.getElementById('select-day');
  const shiftSelect = document.getElementById('select-shift');

  if (daySelect) {
    daySelect.innerHTML = AppState.days.map(d => `
      <option value="${d.id}" ${d.id === AppState.selectedDayId ? 'selected' : ''}>${d.label}</option>
    `).join('');
  }

  updateShiftSelectOptions();
}

function updateShiftSelectOptions() {
  const shiftSelect = document.getElementById('select-shift');
  if (!shiftSelect) return;

  const currentDay = AppState.days.find(d => d.id === AppState.selectedDayId);
  const shifts = (currentDay && currentDay.shifts) || [];

  shiftSelect.innerHTML = shifts.map(s => `
    <option value="${s.id}" ${s.id === AppState.selectedShiftId ? 'selected' : ''}>${s.name}</option>
  `).join('');
}

// Setup Event Listeners
function setupEventListeners() {
  // Day change
  const daySelect = document.getElementById('select-day');
  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      AppState.selectedDayId = Number(e.target.value);
      AppState.autoSelectShift();
      updateShiftSelectOptions();
      loadShiftData();
    });
  }

  // Shift change
  const shiftSelect = document.getElementById('select-shift');
  if (shiftSelect) {
    shiftSelect.addEventListener('change', (e) => {
      AppState.selectedShiftId = Number(e.target.value);
      AppState.currentItemId = null;
      loadShiftData();
    });
  }

  // Mode Toggle Button (Director <-> Editor)
  const modeBtn = document.getElementById('btn-mode-toggle');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      toggleMode();
    });
  }

  // Banner "Voltar ao Modo Diretor" button
  const bannerBackBtn = document.getElementById('banner-btn-director');
  if (bannerBackBtn) {
    bannerBackBtn.addEventListener('click', () => {
      AppState.setMode('director');
    });
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

  // Close mobile menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('mobile-header-menu');
    const toggleBtn = document.getElementById('btn-mobile-menu-toggle');
    if (menu && menu.classList.contains('open')) {
      if (!menu.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        closeMobileMenu();
      }
    }
  });

  // State Subscriptions
  AppState.subscribe((eventType, payload) => {
    if (eventType === 'MODE_CHANGED') {
      const isEditor = payload.mode === 'editor';
      const modeBtn = document.getElementById('btn-mode-toggle');
      const mobileModeText = document.getElementById('mobile-mode-btn-text');
      const banner = document.getElementById('mode-banner');

      if (modeBtn) {
        modeBtn.classList.toggle('editor-active', isEditor);
        modeBtn.querySelector('.mode-btn-text').textContent = isEditor ? 'Modo Edição' : 'Modo Diretor';
      }
      if (mobileModeText) {
        mobileModeText.textContent = isEditor ? 'Voltar para Modo Diretor' : 'Modo Edição';
      }
      if (banner) {
        banner.classList.toggle('visible', isEditor);
      }
      UIDirector.render();
    } else if (eventType === 'WS_STATUS_CHANGED') {
      const syncBadge = document.getElementById('sync-status-badge');
      const syncText = document.getElementById('sync-status-text');
      const mobileSyncText = document.getElementById('mobile-sync-text');
      const mobileSyncDot = document.getElementById('mobile-sync-dot');

      const label = payload.state === 'online' ? 'Conectado (LAN)' : (payload.state === 'reconnecting' ? 'Reconectando...' : 'Desconectado');
      if (syncBadge && syncText) {
        syncBadge.className = `sync-badge ${payload.state}`;
        syncText.textContent = label;
      }
      if (mobileSyncText) {
        mobileSyncText.textContent = `LAN: ${label}`;
      }
      if (mobileSyncDot) {
        mobileSyncDot.style.backgroundColor = payload.state === 'online' ? 'var(--done)' : (payload.state === 'reconnecting' ? 'var(--accent)' : 'var(--danger)');
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
      window.showToast('Modo Edição ativado', 'info');
    } else {
      // Need Admin PIN
      Modals.openPinModal('upgrade');
    }
  } else {
    // Returning to Director mode
    AppState.setMode('director');
    window.showToast('Retornou ao Modo Diretor', 'info');
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
