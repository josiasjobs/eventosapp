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

  return { itemCompletionAfterToggle, pickInitialShift, itemStatus, escapeHtml };
});
