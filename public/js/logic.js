/**
 * EventosAPP - Pure UI logic helpers
 * No DOM or network access. Browser: window.Logic. Node: module.exports.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(this, function () {
  const isDone = (m) => !!(m && m.completed);

  // Returns the new completion value for a part after a media toggle, or null if no change.
  function itemCompletionAfterToggle(medias, itemCompleted, mediaNowCompleted) {
    if (!medias || medias.length === 0) return null;
    const allDone = medias.every(isDone);
    if (mediaNowCompleted && allDone && !itemCompleted) return true;
    if (!mediaNowCompleted && itemCompleted) return false;
    return null;
  }

  // Picks the saved shift if it still exists, otherwise the first shift of the first day that has one.
  function pickInitialShift(days, savedShiftId) {
    if (!days || days.length === 0) return null;
    if (savedShiftId != null) {
      for (const day of days) {
        const shift = (day.shifts || []).find((s) => s.id === savedShiftId);
        if (shift) return { dayId: day.id, shiftId: shift.id };
      }
    }
    for (const day of days) {
      const shift = (day.shifts || [])[0];
      if (shift) return { dayId: day.id, shiftId: shift.id };
    }
    return null;
  }

  // 'done' takes priority over media state.
  function itemStatus(item) {
    if (item.completed) return 'done';
    const medias = item.medias || [];
    return medias.some(isDone) ? 'partial' : 'empty';
  }

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
  }

  // Returns a copy of ids with fromId moved to toIndex (index in the resulting array, clamped).
  function moveId(ids, fromId, toIndex) {
    const rest = ids.filter((id) => id !== fromId);
    if (rest.length === ids.length) return ids.slice();
    const at = Math.max(0, Math.min(rest.length, toIndex));
    rest.splice(at, 0, fromId);
    return rest;
  }

  // Drop position while dragging: how many of the other rows (vertical centers, top to bottom) are above y.
  function dropIndex(centers, y) {
    let n = 0;
    while (n < centers.length && centers[n] < y) n++;
    return n;
  }

  // Returns list sorted by orderedIds (by .id); entries missing from orderedIds keep their order at the end.
  function sortByIds(list, orderedIds) {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    return list
      .map((entry, i) => ({ entry, key: pos.has(entry.id) ? pos.get(entry.id) : orderedIds.length + i }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.entry);
  }

  // Floating menu placement: below the anchor, right-aligned to it; flips above when it does not fit;
  // always clamped inside the viewport (margin in px).
  function menuPosition(anchor, menuW, menuH, viewW, viewH, margin = 8) {
    let left = anchor.right - menuW;
    let top = anchor.bottom + 4;
    if (top + menuH > viewH - margin) top = anchor.top - menuH - 4;
    left = Math.max(margin, Math.min(left, viewW - menuW - margin));
    top = Math.max(margin, Math.min(top, viewH - menuH - margin));
    return { left, top };
  }

  // YYYY-MM-DD of the given Date in local time (toISOString would give the UTC day)
  function localDateISO(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Part to open when a shift loads: this device's last part, then the server's current part, then the first
  function pickInitialItem(items, savedItemId, serverItemId) {
    const has = (id) => id != null && items.some(i => i.id === id);
    if (has(savedItemId)) return savedItemId;
    if (has(serverItemId)) return serverItemId;
    return items.length > 0 ? items[0].id : null;
  }

  // Media notes as typed in the app. Old playlist imports stored the package's internal
  // file name (uuid.ext) there; that is not a note, so it shows as empty.
  const IMPORTED_FILE_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;
  function mediaNotes(reference) {
    const text = (reference || '').trim();
    return IMPORTED_FILE_REF.test(text) ? '' : text;
  }

  return { localDateISO, mediaNotes, pickInitialItem, menuPosition, itemCompletionAfterToggle, pickInitialShift, itemStatus, escapeHtml, moveId, dropIndex, sortByIds };
});
