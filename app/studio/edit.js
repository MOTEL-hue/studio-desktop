/* אולפן שידור - עריכה בעכבר על התצוגה המקדימה: גרירה, שינוי גודל, הנחת מקור מהרשימה לתוך חלון. */
(function () {
"use strict";
const S = window.Studio, U = S.ui, h = U.h;
const HANDLES = ["tl", "t", "tr", "l", "r", "bl", "b", "br"], MIN = 0.06, SNAP = 0.012;
let layer, box, guides, sel = -1, drag = null;

const scene = () => S.scene(U.editId());
const norm = (sc, i) => { const r = S.rectsOf(sc, 1920, 1080).find(q => q.i === i); return r ? [r.x / 1920, r.y / 1080, r.w / 1920, r.h / 1080] : null; };
function pointer(e) { const b = layer.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; }
function hit(sc, px, py) {
  const rs = S.rectsOf(sc, 1920, 1080).reverse();
  for (const r of rs) if (px >= r.x / 1920 && px <= (r.x + r.w) / 1920 && py >= r.y / 1080 && py <= (r.y + r.h) / 1080) return r.i;
  return -1;
}
function targets(sc, skip) {
  const xs = [0, .5, 1], ys = [0, .5, 1];
  S.rectsOf(sc, 1920, 1080).forEach(r => { if (r.i === skip) return; const x = r.x / 1920, y = r.y / 1080, w = r.w / 1920, hh = r.h / 1080; xs.push(x, x + w, x + w / 2); ys.push(y, y + hh, y + hh / 2); });
  return [xs, ys];
}
function snap(v, list) { let best = null; for (const t of list) { const d = Math.abs(t - v); if (d < SNAP && (best === null || d < Math.abs(best - v))) best = t; } return best; }
function showGuides(gx, gy) {
  guides.innerHTML = "";
  if (gx != null) guides.append(h("i", { class: "gv", style: "left:" + gx * 100 + "%" }));
  if (gy != null) guides.append(h("i", { class: "gh", style: "top:" + gy * 100 + "%" }));
}

U.drawSel = function () {
  if (!layer) return; const sc = scene(); box.style.display = "none";
  if (!sc || sel < 0 || sel >= S.slotCount(sc)) return;
  const r = norm(sc, sel); if (!r) return;
  Object.assign(box.style, { display: "block", left: r[0] * 100 + "%", top: r[1] * 100 + "%", width: r[2] * 100 + "%", height: r[3] * 100 + "%" });
  const sl = sc.slots[sel], src = S.src(sl.src); box.dataset.label = "חלון " + (sel + 1) + (src ? ": " + src.name : "");
};

function down(e) {
  const sc = scene(); if (!sc || e.button > 1) return;
  const [px, py] = pointer(e), hd = e.target.dataset.h;
  let i = hd ? sel : hit(sc, px, py);
  if (i < 0) { sel = -1; U.drawSel(); return; }
  if (i !== sel) { sel = i; U.drawSel(); }
  const start = norm(sc, i); if (!start) return;
  drag = { i, h: hd || ((e.altKey || e.button === 1) ? "pan" : "move"), p0: [sc.slots[i].px || 0, sc.slots[i].py || 0], px, py, r: start.slice(), moved: false, rect0: sc.slots[i].rect ? sc.slots[i].rect.slice() : null };
  layer.setPointerCapture(e.pointerId); e.preventDefault();
}
function move(e) {
  const sc = scene(); if (!drag || !sc) return; const [px, py] = pointer(e), dx = px - drag.px, dy = py - drag.py;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 0.004) return; drag.moved = true;
  let [x, y, w, hh] = drag.r; const [tx, ty] = targets(sc, drag.i); let gx = null, gy = null;
  if (drag.h === "pan") {
    const sl = sc.slots[drag.i], v = S.visual(S.src(sl.src)), rc = S.rectsOf(sc, 1920, 1080).find(q => q.i === drag.i);
    if (v && rc) { const g = S.geom(sl, v, rc.w, rc.h); if (g.ox > 1) sl.px = Math.max(-1, Math.min(1, drag.p0[0] - dx * 1920 * 2 / g.ox)); if (g.oy > 1) sl.py = Math.max(-1, Math.min(1, drag.p0[1] - dy * 1080 * 2 / g.oy)); }
    return;
  }
  if (drag.h === "move") {
    x += dx; y += dy;
    const cand = [[x, 0], [x + w / 2, w / 2], [x + w, w]]; let bx = null; for (const [v, off] of cand) { const t = snap(v, tx); if (t !== null && (bx === null || Math.abs(t - v) < Math.abs(bx[0] - bx[1]))) bx = [t, v, off]; }
    if (bx) { x += bx[0] - bx[1]; gx = bx[0]; }
    const candy = [[y, 0], [y + hh / 2, hh / 2], [y + hh, hh]]; let by = null; for (const [v, off] of candy) { const t = snap(v, ty); if (t !== null && (by === null || Math.abs(t - v) < Math.abs(by[0] - by[1]))) by = [t, v, off]; }
    if (by) { y += by[0] - by[1]; gy = by[0]; }
    x = Math.max(-w * .8, Math.min(1 - w * .2, x)); y = Math.max(-hh * .8, Math.min(1 - hh * .2, y));
  } else {
    let l = x, t = y, r = x + w, b = y + hh; const k = drag.h;
    if (k.includes("l")) { l += dx; const s = snap(l, tx); if (s !== null) { l = s; gx = s; } }
    if (k.includes("r")) { r += dx; const s = snap(r, tx); if (s !== null) { r = s; gx = s; } }
    if (k.includes("t")) { t += dy; const s = snap(t, ty); if (s !== null) { t = s; gy = s; } }
    if (k.includes("b")) { b += dy; const s = snap(b, ty); if (s !== null) { b = s; gy = s; } }
    if (r - l < MIN) { if (k.includes("l")) l = r - MIN; else r = l + MIN; } if (b - t < MIN) { if (k.includes("t")) t = b - MIN; else b = t + MIN; }
    if (e.shiftKey && k.length === 2) { const ratio = drag.r[2] / drag.r[3]; const nw = r - l, nh = b - t;
      if (nw / nh > ratio) { const w2 = nh * ratio; if (k.includes("l")) l = r - w2; else r = l + w2; } else { const h2 = nw / ratio; if (k.includes("t")) t = b - h2; else b = t + h2; } gx = gy = null; }
    x = l; y = t; w = r - l; hh = b - t;
  }
  sc.slots[drag.i].rect = [x, y, w, hh]; showGuides(gx, gy); U.drawSel();
}
function up(e) {
  if (!drag) return; const was = drag; drag = null; showGuides(null, null); try { layer.releasePointerCapture(e.pointerId); } catch (er) { /* כבר שוחרר */ }
  if (was.moved) { S.save(); U.renderEditor(); }
}
function wheel(e) {
  const sc = scene(); if (!sc) return; const [px, py] = pointer(e), i = hit(sc, px, py); if (i < 0) return; e.preventDefault();
  const sl = sc.slots[i]; sl.zoom = Math.max(1, Math.min(4, (sl.zoom || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06))); S.save(); clearTimeout(wheel.t); wheel.t = setTimeout(() => U.renderEditor(), 300);
}
function dbl(e) { const sc = scene(); if (!sc) return; const [px, py] = pointer(e), i = hit(sc, px, py); if (i >= 0 && sc.slots[i].rect) { sc.slots[i].rect = null; U.drawSel(); S.save(); U.renderEditor(); U.toast("החלון חזר למיקום של הפריסה"); } }
function over(e) { if ((e.dataTransfer.types || []).includes("text/studio-src")) { e.preventDefault(); const sc = scene(), [px, py] = pointer(e); if (sc) { sel = hit(sc, px, py); U.drawSel(); } } }
function drop(e) {
  const id = e.dataTransfer.getData("text/studio-src"); if (!id) return; e.preventDefault(); const sc = scene(); if (!sc) return;
  const [px, py] = pointer(e); let i = hit(sc, px, py); if (i < 0) { U.toast("שחררו את המקור מעל אחד מהחלונות", true); return; }
  sc.slots[i].src = id; sel = i; U.drawSel(); S.save(); U.renderEditor(); U.toast("המקור הוצב בחלון " + (i + 1));
}
U.selectedWindow = () => sel;
U.selectWindow = i => { sel = i; U.drawSel(); };

/* חיבור השכבה לתצוגה הנכונה: מקדימה במצב אולפן, ושידור חי במצב ישיר */
U.attachLayer = function () {
  if (!layer) {
    guides = h("div", { class: "guides" });
    box = h("div", { class: "selbox" }, HANDLES.map(k => h("b", { class: "hd " + k, "data-h": k })));
    layer = h("div", { class: "edit-layer", title: "גררו חלון להזזה, גררו פינה לשינוי גודל, לחיצה כפולה מחזירה למיקום הפריסה" }, guides, box);
    layer.addEventListener("pointerdown", down); layer.addEventListener("pointermove", move); layer.addEventListener("pointerup", up); layer.addEventListener("pointercancel", up);
    layer.addEventListener("dblclick", dbl); layer.addEventListener("wheel", wheel, { passive: false }); layer.addEventListener("dragover", over); layer.addEventListener("drop", drop);
    layer.addEventListener("dragleave", () => { U.drawSel(); });
  }
  const fig = document.querySelector(S.settings.studio ? ".mon.pvw .cvwrap" : ".mon.pgm .cvwrap"); if (fig && layer.parentNode !== fig) fig.append(layer);
  U.drawSel(); if (U.applyGuides) U.applyGuides();
};
U.applyGuides = () => { if (layer) layer.classList.toggle("guides", !!S.settings.guides); };
S.on("scenes", () => U.attachLayer());
document.addEventListener("keydown", e => { if (e.key === "Escape" && sel >= 0 && !document.getElementById("dlg").open) { sel = -1; U.drawSel(); } });
})();
