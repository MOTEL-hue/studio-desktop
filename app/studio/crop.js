/* אולפן שידור - חיתוך בעכבר: מציגים את הסרטון המלא ובוחרים בעכבר איזה חלק ממנו יופיע בשידור. */
(function () {
"use strict";
const S = window.Studio, U = S.ui, h = U.h;
const RATIOS = [["", "חופשי"], ["16:9", "16:9"], ["4:3", "4:3"], ["1:1", "ריבוע"], ["9:16", "לאורך"]];
U.cropDlg = function (sc, i) {
  const sl = sc.slots[i], src = S.src(sl.src); if (!src || !S.visual(src)) { U.toast("קודם בחרו לחלון מקור עם תמונה", true); return; }
  const c = sl.crop ? sl.crop.slice() : [0, 0, 0, 0], v0 = S.visual(src), [SW, SH] = S.dims(v0), asp = SW / SH;
  const cv = h("canvas", { width: 800, height: Math.round(800 / asp), class: "cropcv" }), box = h("div", { class: "cropbox" }, ["tl", "t", "tr", "l", "r", "bl", "b", "br"].map(k => h("b", { class: "hd " + k, "data-h": k })));
  const wrap = h("div", { class: "cropwrap", style: "aspect-ratio:" + asp }, cv, box); let ratio = "", alive = true, drag = null;
  const rect = () => ({ l: c[0], t: c[1], w: 1 - c[0] - c[2], h: 1 - c[1] - c[3] });
  function place() { const r = rect(); Object.assign(box.style, { left: r.l * 100 + "%", top: r.t * 100 + "%", width: r.w * 100 + "%", height: r.h * 100 + "%" }); info.textContent = "מוצג: " + Math.round(r.w * 100) + "% מהרוחב, " + Math.round(r.h * 100) + "% מהגובה"; }
  function frame() { if (!alive) return; const v = S.visual(src); if (v) { const x = cv.getContext("2d"); x.drawImage(v, 0, 0, cv.width, cv.height); } requestAnimationFrame(frame); }
  const pt = e => { const b = wrap.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; };
  wrap.addEventListener("pointerdown", e => { const hd = e.target.dataset.h, inBox = e.target === box; if (!hd && !inBox) return; drag = { hd: hd || "move", p: pt(e), r: rect() }; wrap.setPointerCapture(e.pointerId); e.preventDefault(); });
  wrap.addEventListener("pointermove", e => {
    if (!drag) return; const [px, py] = pt(e), dx = px - drag.p[0], dy = py - drag.p[1]; let { l, t, w, h: hh } = drag.r, r = l + w, b = t + hh; const k = drag.hd, M = .05;
    if (k === "move") { l = Math.max(0, Math.min(1 - w, l + dx)); t = Math.max(0, Math.min(1 - hh, t + dy)); r = l + w; b = t + hh; }
    else { if (k.includes("l")) l = Math.max(0, Math.min(r - M, l + dx)); if (k.includes("r")) r = Math.min(1, Math.max(l + M, r + dx)); if (k.includes("t")) t = Math.max(0, Math.min(b - M, t + dy)); if (k.includes("b")) b = Math.min(1, Math.max(t + M, b + dy));
      if (ratio && k.length === 2) { const [rw, rh] = ratio.split(":").map(Number), target = (rw / rh) / asp; const nw = r - l, nh = b - t; if (nw / nh > target) { const w2 = nh * target; if (k.includes("l")) l = r - w2; else r = l + w2; } else { const h2 = nw / target; if (k.includes("t")) t = b - h2; else b = t + h2; } } }
    c[0] = l; c[1] = t; c[2] = 1 - r; c[3] = 1 - b; place();
  });
  const end = e => { drag = null; };
  wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
  const info = h("p", { class: "hint" });
  const setRatio = v => { ratio = v; if (!v) return; const [rw, rh] = v.split(":").map(Number), target = (rw / rh) / asp; const r = rect(); let w = r.w, hh = r.h; if (w / hh > target) w = hh * target; else hh = w / target; c[0] = r.l + (r.w - w) / 2; c[1] = r.t + (r.h - hh) / 2; c[2] = 1 - c[0] - w; c[3] = 1 - c[1] - hh; place(); };
  const body = h("div", {}, h("p", { class: "hint", text: "גררו את הפינות והצדדים של המסגרת הצהובה כדי לבחור מה יופיע בשידור. גררו את האמצע להזזה. מה שמחוץ למסגרת ייחתך." }), wrap, info,
    U.field("יחס מסגרת", U.sel(RATIOS, "", setRatio), "בחירת יחס שומרת עליו בזמן שגוררים פינה."),
    h("div", { class: "row" }, h("button", { class: "btn", text: "🪄 זיהוי פסים שחורים", onclick: () => { const g = S.detectBars(src); if (g) { g.forEach((q, n) => (c[n] = q)); place(); } else U.toast("לא נמצאו פסים שחורים", true); } }),
      h("button", { class: "btn", text: "↺ בלי חיתוך", onclick: () => { c[0] = c[1] = c[2] = c[3] = 0; place(); } })));
  const d = U.dialog("חיתוך: " + src.name, body, [["שמירה", () => { alive = false; const any = c.some(q => q > .002); sl.crop = any ? c.map(q => Math.max(0, q)) : null; S.save(); U.renderEditor(); }, "go"], ["ביטול", () => { alive = false; }, ""]], true);
  d.addEventListener("close", () => { alive = false; }, { once: true }); place(); frame();
};
})();
