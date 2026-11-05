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

  // Questions (Sentinela) have no checkbox and do not count toward part completion.
  const isMediaStep = (step) => step.type !== 'question';

  // Returns the new completion value for a part after a media toggle, or null if no change.
  function itemCompletionAfterToggle(medias, itemCompleted, mediaNowCompleted) {
    const list = (medias || []).filter(isMediaStep);
    if (list.length === 0) return null;
    const allDone = list.every(isDone);
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
    const medias = (item.medias || []).filter(isMediaStep);
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

  // Positive integer from user input: null when empty, the number when valid,
  // or false when invalid (zero, negative, decimal, text). Used for talk numbers and paragraphs.
  function parsePositiveInt(value) {
    const text = value == null ? '' : String(value).trim();
    if (text === '') return null;
    if (!/^\d+$/.test(text)) return false;
    const n = Number(text);
    return n >= 1 && Number.isSafeInteger(n) ? n : false;
  }
  const parseTalkNumber = parsePositiveInt;

  // Validates a Sentinela question from the form. Returns the cleaned values, or { error } in Portuguese.
  function checkQuestionStep({ paragraph, side, person }) {
    const name = String(person == null ? '' : person).trim();
    if (name === '') return { error: 'Informe o nome de quem responde.' };
    const n = parsePositiveInt(paragraph);
    if (!Number.isInteger(n)) return { error: 'Informe o parágrafo (número inteiro maior que zero).' };
    if (side !== 'left' && side !== 'right') return { error: 'O lado deve ser Esquerda ou Direita.' };
    return { paragraph: n, side, person: name };
  }

  // Sentinela cards: consecutive questions with the same paragraph and side share a card; each media is its own card.
  function groupSentinelaSteps(steps) {
    const groups = [];
    for (const step of steps || []) {
      const last = groups[groups.length - 1];
      if (!isMediaStep(step)) {
        const paragraph = step.paragraph ?? null;
        if (last && last.kind === 'question' && last.paragraph === paragraph && last.side === step.side) {
          last.steps.push(step);
        } else {
          groups.push({ kind: 'question', paragraph, side: step.side, steps: [step] });
        }
      } else {
        groups.push({ kind: 'media', paragraph: step.paragraph ?? null, side: null, steps: [step] });
      }
    }
    return groups;
  }

  // Next/previous step in a part. At the ends (or with no steps) it leaves in that direction.
  // A current step missing from the list moves forward to the first step, and backward out of the part.
  function stepNav(stepIds, currentId, dir) {
    const i = stepIds.indexOf(currentId);
    if (dir === 'next') {
      if (i === -1) return stepIds.length > 0 ? { stepId: stepIds[0] } : { leave: 'next' };
      return i + 1 < stepIds.length ? { stepId: stepIds[i + 1] } : { leave: 'next' };
    }
    return i > 0 ? { stepId: stepIds[i - 1] } : { leave: 'prev' };
  }

  // Saved step if it still exists, otherwise the first one (null when there are none).
  function pickInitialStep(stepIds, savedId) {
    if (stepIds.includes(savedId)) return savedId;
    return stepIds.length > 0 ? stepIds[0] : null;
  }

  // Up to 2 uppercase initials: the first two letters of one word, or first letter of first and last word.
  function initials(name) {
    const words = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const first = [...words[0]];
    const last = [...words[words.length - 1]];
    const pair = words.length === 1 ? first.slice(0, 2) : [first[0], last[0]];
    return pair.join('').toUpperCase();
  }

  // A shift holds at most one Sentinela; exceptId ignores the part being edited
  function shiftHasSentinela(items, exceptId = null) {
    return (items || []).some((i) => i.activity_type === 'sentinela' && i.id !== exceptId);
  }

  // Validates a camera plan from the form. Returns null when valid, or an error message in Portuguese.
  function checkCameraPlan({ sigla, name, camera, preset }) {
    const s = String(sigla == null ? '' : sigla).trim();
    if (s === '' || s.length > 8) return 'Informe a sigla (até 8 caracteres).';
    if (String(name == null ? '' : name).trim() === '') return 'Informe o nome do plano.';
    const cam = parsePositiveInt(camera);
    const pre = parsePositiveInt(preset);
    if (!Number.isInteger(cam) || !Number.isInteger(pre)) return 'Câmera e preset devem ser números inteiros maiores que zero.';
    return null;
  }

  // "PP · Plano presidente · CAM 2 · P4"; empty when there is no plan
  function planLabel(plan) {
    if (!plan) return '';
    return `${plan.sigla} · ${plan.name} · CAM ${plan.camera} · P${plan.preset}`;
  }

  // Plan transition of a part: "PP → PA", "PP →" (no plan after), "→ PA" (no plan before)
  function planSiglas(item) {
    const from = item.plan_in ? item.plan_in.sigla : '';
    const to = item.plan_out ? item.plan_out.sigla : '';
    if (!from && !to) return '';
    return `${from} → ${to}`.trim();
  }

  // Badges before a part title: "Presidente" for the chairman part, "Nº 12" for a talk
  function partBadgesHtml(item, esc) {
    const role = item.activity_type === 'presidente' ? '<span class="role-badge">Presidente</span>' : '';
    const talk = item.talk_number ? `<span class="talk-badge">Nº ${esc(item.talk_number)}</span>` : '';
    return role + talk;
  }

  // Theater and interview keep the camera preset in the notes field
  const PRESET_TYPES = ['theater', 'interview'];
  function notesLabel(type) {
    return PRESET_TYPES.includes(type) ? 'Camera - Preset' : 'Observações';
  }

  // Notes as shown on screen and on paper: labelled when they hold a camera preset
  function mediaNotesText(media) {
    const notes = mediaNotes(media.reference);
    return notes && PRESET_TYPES.includes(media.type) ? `${notesLabel(media.type)}: ${notes}` : notes;
  }

  // Smallest scale that covers the frame (no empty edges)
  function coverScale(imgW, imgH, frameW, frameH) {
    return Math.max(frameW / imgW, frameH / imgH);
  }

  // Image top-left (x, y) relative to the frame, kept so the scaled image still covers it
  function clampPan(x, y, imgW, imgH, scale, frameW, frameH) {
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    return {
      x: clamp(x, frameW - imgW * scale, 0),
      y: clamp(y, frameH - imgH * scale, 0),
    };
  }

  // Scales down to fit max on the longer side; never enlarges
  function fitWithin(w, h, max) {
    const k = Math.min(1, max / Math.max(w, h));
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }

  // Participant photo: empty (no photo) or a small webp/jpeg data URL in base64
  const PHOTO_MAX_LENGTH = 102400;
  const PHOTO_PATTERN = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
  function isValidPhoto(value) {
    if (typeof value !== 'string') return false;
    if (value === '') return true;
    return value.length <= PHOTO_MAX_LENGTH && PHOTO_PATTERN.test(value);
  }

  return { partBadgesHtml, notesLabel, mediaNotesText, shiftHasSentinela, checkCameraPlan, planLabel, planSiglas, localDateISO, mediaNotes, parsePositiveInt, parseTalkNumber, pickInitialItem, menuPosition, itemCompletionAfterToggle, pickInitialShift, itemStatus, escapeHtml, moveId, dropIndex, sortByIds, isMediaStep, checkQuestionStep, groupSentinelaSteps, stepNav, pickInitialStep, initials, coverScale, clampPan, fitWithin, isValidPhoto };
});
