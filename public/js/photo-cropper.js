/**
 * EventosAPP - Recorte da foto do participante
 * Abre a imagem por cima do formulário, numa moldura 3x4 fixa: arrastar move, pinça, roda do
 * mouse e o controle deslizante dão zoom, sempre cobrindo a moldura. ✓ gera a foto 240x320.
 * Browser: window.PhotoCropper.open(file) -> Promise<data URL | null>.
 */
const PhotoCropper = (() => {
  const OUT_W = 240, OUT_H = 320;
  const MAX_SIDE = 1600;   // reduz fotos de 12 MP antes do recorte
  const MAX_ZOOM = 4;      // zoom máximo = 4x o mínimo
  const LOAD_ERROR = 'Não foi possível abrir esta imagem.';

  let work = null;         // canvas com a imagem reduzida
  let frameW = 0, frameH = 0;
  let minScale = 1, maxScale = MAX_ZOOM;
  let view = { scale: 1, x: 0, y: 0 }; // x, y: canto da imagem relativo à moldura (px CSS)
  let pending = null;      // resolve da promessa aberta
  let rafId = 0;
  const pointers = new Map();
  let els = null;

  // Decodes the file respecting EXIF orientation; <img> fallback for browsers without bitmap options
  async function decode(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* tenta <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function loadWorkCanvas(file) {
    const source = await decode(file);
    const w0 = source.width || source.naturalWidth, h0 = source.height || source.naturalHeight;
    if (!w0 || !h0) throw new Error('empty image');
    const { w, h } = Logic.fitWithin(w0, h0, MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    if (source.close) source.close();
    return canvas;
  }

  function setView(scale, x, y) {
    const s = Math.min(maxScale, Math.max(minScale, scale));
    view = { scale: s, ...Logic.clampPan(x, y, work.width, work.height, s, frameW, frameH) };
    els.zoom.value = String(s);
    schedule();
  }

  // Zoom keeping the point (px, py) of the frame fixed over the same spot of the image
  function zoomAt(scale, px, py) {
    const s = Math.min(maxScale, Math.max(minScale, scale));
    const k = s / view.scale;
    setView(s, px - (px - view.x) * k, py - (py - view.y) * k);
  }

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(draw);
  }

  function draw() {
    rafId = 0;
    if (!work) return;
    const dpr = window.devicePixelRatio || 1;
    const c = els.canvas;
    const cw = Math.round(frameW * dpr), ch = Math.round(frameH * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frameW, frameH);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work, view.x, view.y, work.width * view.scale, work.height * view.scale);
  }

  // Measures the on-screen frame; on later calls (rotation/resize) keeps the same crop
  function measure() {
    const w = els.frame.clientWidth, h = els.frame.clientHeight;
    if (!w || !h) return;
    const ratio = frameW ? w / frameW : 1;
    frameW = w;
    frameH = h;
    minScale = Logic.coverScale(work.width, work.height, frameW, frameH);
    maxScale = minScale * MAX_ZOOM;
    els.zoom.min = String(minScale);
    els.zoom.max = String(maxScale);
    if (ratio === 1 && view.scale === 0) {
      // Initial state: minimum zoom, image centered
      setView(minScale, (frameW - work.width * minScale) / 2, (frameH - work.height * minScale) / 2);
    } else {
      setView(view.scale * ratio, view.x * ratio, view.y * ratio);
    }
  }

  // Frame-relative position of a pointer/mouse event
  function local(e) {
    const r = els.frame.getBoundingClientRect();
    return { x: (e.clientX - r.left) * frameW / r.width, y: (e.clientY - r.top) * frameH / r.height };
  }

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function onPointerDown(e) {
    els.frame.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
  }

  function onPointerMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev || !work) return;
    if (pointers.size === 1) {
      const p = local(e);
      pointers.set(e.pointerId, p);
      setView(view.scale, view.x + p.x - prev.x, view.y + p.y - prev.y);
      return;
    }
    // Pinch: follow the midpoint, scale by the change in distance between the two fingers
    const before = pinchInfo();
    pointers.set(e.pointerId, local(e));
    const after = pinchInfo();
    view = { ...view, x: view.x + after.mid.x - before.mid.x, y: view.y + after.mid.y - before.mid.y };
    zoomAt(before.dist > 0 ? view.scale * after.dist / before.dist : view.scale, after.mid.x, after.mid.y);
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
  }

  function onWheel(e) {
    e.preventDefault();
    const p = local(e);
    zoomAt(view.scale * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }

  function onZoomInput() {
    zoomAt(Number(els.zoom.value), frameW / 2, frameH / 2);
  }

  // Esc cancels the crop only, leaving the question form open
  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    finish(null);
  }

  // Draws the visible area at 240x320; webp, or jpeg where webp encoding is not supported
  function exportPhoto() {
    const out = document.createElement('canvas');
    out.width = OUT_W;
    out.height = OUT_H;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const s = view.scale;
    ctx.drawImage(work, -view.x / s, -view.y / s, frameW / s, frameH / s, 0, 0, OUT_W, OUT_H);
    const webp = out.toDataURL('image/webp', 0.72);
    if (webp.startsWith('data:image/webp')) return webp;
    return out.toDataURL('image/jpeg', 0.8);
  }

  function finish(result) {
    if (!pending) return;
    const resolve = pending;
    pending = null;
    els.modal.classList.remove('open');
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', measure);
    pointers.clear();
    work = null;
    resolve(result);
  }

  function init() {
    if (els) return;
    const modal = document.getElementById('modal-photo-crop');
    els = {
      modal,
      frame: modal.querySelector('.crop-frame'),
      canvas: modal.querySelector('.crop-frame canvas'),
      zoom: modal.querySelector('.crop-zoom')
    };
    els.frame.addEventListener('pointerdown', onPointerDown);
    els.frame.addEventListener('pointermove', onPointerMove);
    els.frame.addEventListener('pointerup', onPointerUp);
    els.frame.addEventListener('pointercancel', onPointerUp);
    els.frame.addEventListener('wheel', onWheel, { passive: false });
    els.zoom.addEventListener('input', onZoomInput);
    modal.querySelector('.crop-cancel').addEventListener('click', () => finish(null));
    modal.querySelector('.crop-confirm').addEventListener('click', () => finish(exportPhoto()));
  }

  async function open(file) {
    init();
    finish(null); // a previous crop still open is cancelled
    let canvas;
    try {
      canvas = await loadWorkCanvas(file);
    } catch (e) {
      window.showToast(LOAD_ERROR, 'error');
      return null;
    }
    return new Promise(resolve => {
      pending = resolve;
      work = canvas;
      frameW = 0;
      view = { scale: 0, x: 0, y: 0 };
      // Opens over the question form without closing it (Modals.open would close every modal)
      els.modal.classList.add('open');
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('resize', measure);
      measure();
    });
  }

  return { open };
})();

window.PhotoCropper = PhotoCropper;
