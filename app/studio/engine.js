/* אולפן שידור - מנוע: הרכבת המסך, מעברים, שכבות, שמע והקלטה. הכול רץ בדפדפן, בלי השרת. */
(function () {
"use strict";
const S = window.Studio = { sources: [], scenes: [], overlays: [], settings: {}, recordings: [], _ev: {} };
S.uid = () => Math.random().toString(36).slice(2, 9);
S.on = (e, f) => (S._ev[e] = S._ev[e] || []).push(f);
S.emit = (e, a) => (S._ev[e] || []).forEach(f => { try { f(a); } catch (x) { console.error(x); } });
S.defaults = () => ({ w: 1920, h: 1080, fps: 30, studio: true, bitrate: 8, container: "auto", trans: "fade", transMs: 600,
  masterVol: 1, limiter: true, outAudio: true, monitor: false, monitorDev: "", recDelay: 0 });
S.settings = S.defaults();

/* ---------- פריסות ---------- */
const R = (x, y, w, h) => [x, y, w, h];
S.LAYOUTS = {
  full: { name: "מסך מלא", cells: [R(0, 0, 1, 1)] },
  sbs: { name: "זה לצד זה", cells: [R(.5, 0, .5, 1), R(0, 0, .5, 1)] },
  stack: { name: "אחד מעל השני", cells: [R(0, 0, 1, .5), R(0, .5, 1, .5)] },
  side: { name: "ראשי וצד", cells: [R(.3, 0, .7, 1), R(0, 0, .3, 1)] },
  main2: { name: "ראשי ושניים בצד", cells: [R(.34, 0, .66, 1), R(0, 0, .34, .5), R(0, .5, .34, .5)] },
  top2: { name: "גדול ושניים למטה", cells: [R(0, 0, 1, .66), R(.5, .66, .5, .34), R(0, .66, .5, .34)] },
  cols3: { name: "שלוש עמודות", cells: [R(2 / 3, 0, 1 / 3, 1), R(1 / 3, 0, 1 / 3, 1), R(0, 0, 1 / 3, 1)] },
  grid4: { name: "ארבעה שווים", cells: [R(.5, 0, .5, .5), R(0, 0, .5, .5), R(.5, .5, .5, .5), R(0, .5, .5, .5)] },
  pip: { name: "תמונה בתוך תמונה", pip: true },
};
S.CORNERS = { br: "ימין למטה", bl: "שמאל למטה", tr: "ימין למעלה", tl: "שמאל למעלה" };
S.cellsOf = function (scene) {
  const L = S.LAYOUTS[scene.layout] || S.LAYOUTS.full;
  if (!L.pip) return L.cells;
  const s = scene.opts.pipSize || .28, m = .02, c = scene.opts.corner || "br";
  const hh = s;
  const x = c[1] === "r" ? 1 - s - m : m, y = c[0] === "b" ? 1 - hh - m * 16 / 9 : m * 16 / 9;
  return [R(0, 0, 1, 1), R(x, y, s, hh)];
};
S.newSlot = () => ({ src: null, fit: "cover", zoom: 1, px: 0, py: 0, mirror: false, label: "" });
S.newScene = function (name, layout) {
  return { id: S.uid(), name: name || "סצנה חדשה", layout: layout || "full",
    slots: Array.from({ length: 8 }, () => S.newSlot()), next: "",
    opts: { gap: 12, radius: 0, bg1: "#0b1020", bg2: "#1b2a4a", border: "#ffffff", borderW: 0, shadow: false,
      pipSize: .28, corner: "br", pipRound: false, bgSrc: null, bgKind: "gradient", fxKind: "none", fxLevel: 3, fxOver: false, borderStyle: "solid" } };
};

/* ---------- ציור ---------- */
const FONT = '"Heebo","Arial",sans-serif';
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function visual(src) {
  if (!src || src.missing) return null;
  if (src.kind === "text") return src.canvas;
  if (src.kind === "slides") return src.img && src.img.complete && src.img.naturalWidth ? src.img : null;
  if (src.kind === "image") return src.el && src.el.complete && src.el.naturalWidth ? src.el : null;
  if (src.el && src.el.tagName === "VIDEO") return src.el.readyState >= 2 && src.el.videoWidth ? src.el : null;
  return null;
}
function dims(v) { return [v.videoWidth || v.naturalWidth || v.width, v.videoHeight || v.naturalHeight || v.height]; }

function drawSrc(ctx, src, x, y, w, h, slot, k) {
  ctx.save();
  if (src && src.kind === "color") { ctx.fillStyle = src.props.color || "#000"; ctx.fillRect(x, y, w, h); ctx.restore(); return; }
  let v = visual(src);
  if (v && slot && slot.chroma && slot.chroma.on) v = S.chromaFrame(v, slot.chroma) || v;  // מסך ירוק
  if (!v) {
    ctx.fillStyle = "#111827"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#6b7280"; ctx.font = "600 " + 28 * k + "px " + FONT; ctx.textAlign = "center"; ctx.direction = "rtl";
    ctx.fillText(src ? (src.missing ? "צריך לחבר מחדש: " : "אין אות: ") + src.name : "לא נבחר מקור", x + w / 2, y + h / 2);
    ctx.restore(); return;
  }
  const g = S.geom(slot, v, w, h), fit = slot ? slot.fit : "cover";
  if (fit === "contain" && !(slot && slot.chroma && slot.chroma.on)) { ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h); }
  if (fit === "blur") {
    const t = tiny || (tiny = document.createElement("canvas")); t.width = 48; t.height = 27; const tc = t.getContext("2d");
    tc.drawImage(v, g.sx, g.sy, g.sw, g.sh, 0, 0, 48, 27);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(t, x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  if (slot && slot.mirror) { ctx.translate(x + w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(x + w / 2), 0); }
  const cf = slot && S.colorFilter(slot.cc); if (cf) ctx.filter = cf;  // תיקון צבע
  ctx.drawImage(v, g.sx, g.sy, g.sw, g.sh, x + g.dx, y + g.dy, g.dw, g.dh);
  ctx.restore();
}
let tiny;
/* תיקון צבע לחלון: בהירות, ניגודיות, רוויה, גוון, טשטוש, שחור-לבן וספיה. null = בלי שינוי */
S.CC_DEFAULT = { b: 100, c: 100, s: 100, h: 0, bl: 0, g: 0, sep: 0 };
S.colorFilter = function (cc) {
  if (!cc) return null; const d = S.CC_DEFAULT; if (Object.keys(d).every(k => (cc[k] == null ? d[k] : cc[k]) === d[k])) return null;
  const v = k => (cc[k] == null ? d[k] : cc[k]);
  return `brightness(${v("b")}%) contrast(${v("c")}%) saturate(${v("s")}%) hue-rotate(${v("h")}deg) blur(${v("bl")}px) grayscale(${v("g")}%) sepia(${v("sep")}%)`;
};
/* מסך ירוק (הסרת רקע בצבע): מחושב במעבד על עותק קטן (עד 960 פיקסלים לרוחב), כדי שיעבוד בכל מחשב. מחזיר קנבס עם שקיפות */
let kc, kx;
S.chromaFrame = function (v, p) {
  const [w, h] = dims(v); if (!w || !h) return null;
  const sc = Math.min(1, 960 / w), cw = Math.round(w * sc), ch = Math.round(h * sc);
  if (!kc) { kc = document.createElement("canvas"); kx = kc.getContext("2d", { willReadFrequently: true }); }
  if (kc.width !== cw || kc.height !== ch) { kc.width = cw; kc.height = ch; }
  kx.drawImage(v, 0, 0, cw, ch);
  const im = kx.getImageData(0, 0, cw, ch), d = im.data, hex = (p.color || "#00ff00").replace("#", "");
  const kr = parseInt(hex.substr(0, 2), 16), kg = parseInt(hex.substr(2, 2), 16), kb = parseInt(hex.substr(4, 2), 16);
  const kcb = -.169 * kr - .331 * kg + .5 * kb, kcr = .5 * kr - .419 * kg - .081 * kb;
  const sim = (p.sim == null ? .12 : p.sim) * 128, sm = Math.max(.5, (p.smooth == null ? .08 : p.smooth) * 128), sp = p.spill == null ? .5 : p.spill;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dc = -.169 * r - .331 * g + .5 * b - kcb, dr = .5 * r - .419 * g - .081 * b - kcr, dist = Math.sqrt(dc * dc + dr * dr);
    let a = (dist - sim) / sm; a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a < 1 && sp > 0 && a > 0) { const l = .3 * r + .59 * g + .11 * b, m = sp * (1 - a); d[i] = r + (l - r) * m; d[i + 1] = g + (l - g) * m; d[i + 2] = b + (l - b) * m; }
    d[i + 3] = a * 255;
  }
  kx.putImageData(im, 0, 0); return kc;
};
/* החלק הנראה מהמקור (אחרי חיתוך) ואיפה ובאיזה גודל הוא מצויר בתוך החלון */
S.geom = function (slot, v, w, h) {
  const [SW, SH] = dims(v), c = (slot && slot.crop) || [0, 0, 0, 0];
  const sx = c[0] * SW, sy = c[1] * SH, sw = Math.max(8, SW * (1 - c[0] - c[2])), sh = Math.max(8, SH * (1 - c[1] - c[3]));
  const fit = slot ? slot.fit : "cover", z = slot ? slot.zoom || 1 : 1; let dw, dh;
  if (fit === "stretch") { dw = w * z; dh = h * z; }
  else { const base = fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh); dw = sw * base * z; dh = sh * base * z; }
  const ox = (slot ? slot.px || 0 : 0) * Math.max(0, dw - w) / 2, oy = (slot ? slot.py || 0 : 0) * Math.max(0, dh - h) / 2;
  return { sx, sy, sw, sh, dw, dh, dx: (w - dw) / 2 - ox, dy: (h - dh) / 2 - oy, ox: Math.max(0, dw - w), oy: Math.max(0, dh - h) };
};
S.visual = visual; S.dims = dims;

S.renderScene = function (ctx, scene, W, H) {
  const k = W / 1920, o = scene.opts, L = S.LAYOUTS[scene.layout] || S.LAYOUTS.full;
  if (S.drawBg) S.drawBg(ctx, o, W, H); else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, o.bg1); g.addColorStop(1, o.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  const bg = o.bgSrc && S.src(o.bgSrc); if (bg) drawSrc(ctx, bg, 0, 0, W, H, null, k);
  if (S.drawFx && o.fxKind && o.fxKind !== "none" && !o.fxOver) S.drawFx(ctx, o, W, H);
  S.rectsOf(scene, W, H).forEach(({ i, x, y, w, h, r, main, free, pipSmall }) => {
    const slot = scene.slots[i];
    if (!main && (o.shadow || pipSmall || free)) {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 28 * k; ctx.shadowOffsetY = 6 * k;
      ctx.fillStyle = "#000"; rr(ctx, x, y, w, h, r); ctx.fill(); ctx.restore();
    }
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    drawSrc(ctx, S.src(slot.src), x, y, w, h, slot, k); ctx.restore();
    if (o.borderW > 0 && !main) S.strokeBorder(ctx, o, x, y, w, h, r, k);
    if (slot.label) {
      ctx.save(); ctx.font = "700 " + 30 * k + "px " + FONT; ctx.direction = "rtl"; ctx.textAlign = "right";
      const tw = ctx.measureText(slot.label).width + 36 * k, th = 50 * k;
      ctx.fillStyle = "rgba(0,0,0,.6)"; rr(ctx, x + w - tw - 14 * k, y + h - th - 14 * k, tw, th, 10 * k); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(slot.label, x + w - 32 * k, y + h - 24 * k); ctx.restore();
    }
  });
  if (S.drawFx && o.fxKind && o.fxKind !== "none" && o.fxOver) S.drawFx(ctx, o, W, H);
};

S.BORDERS = { solid: "רגילה", double: "כפולה", glow: "זוהר", gold: "זהב" };
S.strokeBorder = function (ctx, o, x, y, w, h, r, k) {
  ctx.save(); const bw = o.borderW * k, st = o.borderStyle || "solid";
  if (st === "gold") { const g = ctx.createLinearGradient(x, y, x + w, y + h); [[0, "#fff1b8"], [.3, "#d4a017"], [.6, "#fff1b8"], [1, "#a8741a"]].forEach(c => g.addColorStop(c[0], c[1])); ctx.strokeStyle = g; }
  else ctx.strokeStyle = o.border;
  if (st === "glow") { ctx.shadowColor = o.border; ctx.shadowBlur = 22 * k; }
  ctx.lineWidth = st === "double" ? bw / 3 : bw; rr(ctx, x, y, w, h, r); ctx.stroke();
  if (st === "double") { rr(ctx, x - bw * .66, y - bw * .66, w + bw * 1.32, h + bw * 1.32, r + bw * .66); ctx.stroke(); }
  ctx.restore();
};

/* מספר החלונות בסצנה: לפי הפריסה, ועוד חלונות נוספים שהוסיפו ידנית */
S.MAXSLOTS = 8;
S.slotCount = function (sc) {
  const n = Math.min(S.MAXSLOTS, S.cellsOf(sc).length + (sc.extra || 0));
  while (sc.slots.length < S.MAXSLOTS) sc.slots.push(S.newSlot());
  return n;
};
const extraRect = i => { const q = i % 4; return [0.58 - q * 0.04, 0.52 - q * 0.04, 0.36, 0.36]; };
/* המלבן של כל חלון בפיקסלים, לפי סדר הציור (מלמטה למעלה). משמש לציור ולעריכה בעכבר. */
S.rectsOf = function (sc, W, H) {
  const k = W / 1920, o = sc.opts, L = S.LAYOUTS[sc.layout] || S.LAYOUTS.full, cells = S.cellsOf(sc), gap = o.gap * k, full = sc.layout === "full", n = S.slotCount(sc), out = [];
  for (let i = 0; i < n; i++) {
    const slot = sc.slots[i]; let c = cells[i], free = false;
    if (slot.rect) { c = slot.rect; free = true; } else if (!c) { c = extraRect(i - cells.length); free = true; }
    const pipSmall = !free && L.pip && i === 1, main = !free && (full || (L.pip && i === 0));
    let x, y, w, h;
    if (main || pipSmall || free) { x = c[0] * W; y = c[1] * H; w = c[2] * W; h = c[3] * H; }
    else { x = c[0] * W + gap / 2 + (c[0] === 0 ? gap / 2 : 0); y = c[1] * H + gap / 2 + (c[1] === 0 ? gap / 2 : 0);
      w = c[2] * W - gap - (c[0] === 0 ? gap / 2 : 0) - (c[0] + c[2] >= .999 ? gap / 2 : 0);
      h = c[3] * H - gap - (c[1] === 0 ? gap / 2 : 0) - (c[1] + c[3] >= .999 ? gap / 2 : 0); }
    let r = main ? 0 : o.radius * k;
    if (pipSmall && o.pipRound) { const d = Math.min(w, h); x += (w - d) / 2; y += (h - d) / 2; w = h = d; r = d / 2; }
    else if (pipSmall) r = Math.max(r, 10 * k);
    out.push({ i, x, y, w, h, r, main, free, pipSmall, z: slot.z || 0 });
  }
  return out.sort((a, b) => a.z - b.z || a.i - b.i);
};

/* ---------- שכבות (לוגו, כתוביות, מסרגל...) ---------- */
S.OVERLAY_TYPES = { logo: "לוגו", lower: "כתובית שם", ticker: "שורה רצה", clock: "שעון", countdown: "ספירה לאחור", text: "טקסט חופשי", frame: "מסגרת" };
S.newOverlay = function (type) {
  const base = { id: S.uid(), type, name: S.OVERLAY_TYPES[type], on: false, _a: 0, p: {} };
  const P = {
    logo: { src: "", pos: "tr", size: 14, opacity: 1, margin: 3 },
    lower: { l1: "שם הדובר", l2: "תפקיד או כותרת", pos: "br", color: "#ffffff", bar: "#16233F", accent: "#E8B931", size: 100 },
    ticker: { text: "כותרת רצה - אפשר לשנות את הטקסט בכל רגע", speed: 120, bg: "#16233F", color: "#ffffff", h: 64, top: false },
    clock: { pos: "tl", seconds: false, date: true, hebrew: false, color: "#ffffff", bg: "#00000099", size: 100 },
    countdown: { pos: "tc", mode: "duration", minutes: 5, time: "20:00", label: "מתחילים בעוד", endText: "מתחילים!", color: "#ffffff", bg: "#00000099", size: 100, endAt: 0 },
    text: { text: "טקסט", pos: "bc", color: "#ffffff", bg: "#00000099", size: 100 },
    frame: { color: "#E8B931", w: 10 },
  };
  base.p = P[type]; return base;
};
function place(pos, w, h, W, H, m) {
  const x = pos[1] === "l" ? m : pos[1] === "r" ? W - w - m : (W - w) / 2;
  const y = pos[0] === "t" ? m : pos[0] === "b" ? H - h - m : (H - h) / 2;
  return [x, y];
}
S.POS = { tr: "ימין למעלה", tc: "אמצע למעלה", tl: "שמאל למעלה", mr: "ימין באמצע", c: "מרכז", ml: "שמאל באמצע", br: "ימין למטה", bc: "אמצע למטה", bl: "שמאל למטה" };
function pos2(p) { return p === "c" ? "mc" : p.length === 2 ? p : "bc"; }
const _imgs = {};
function imgOf(url) { if (!url) return null; let i = _imgs[url]; if (!i) { i = _imgs[url] = new Image(); i.src = url; } return i.complete && i.naturalWidth ? i : null; }
function pill(ctx, text, x, y, h, pad, bg, fg, k) {
  const w = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = bg; rr(ctx, x, y, w, h, 10 * k); ctx.fill(); ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 2 * k); return w;
}
S.countdownLeft = function (o) {
  const p = o.p; let ms;
  if (p.mode === "time") { const [hh, mm] = (p.time || "0:0").split(":").map(Number); const d = new Date(); d.setHours(hh || 0, mm || 0, 0, 0); ms = d - Date.now(); if (ms < -1000 && !p.endAt) ms = d.getTime() + 864e5 - Date.now(); }
  else ms = p.endAt ? p.endAt - Date.now() : p.minutes * 60000;
  return ms;
};
function drawOverlay(ctx, o, W, H, now) {
  const a = o._a; if (a <= 0.01) return; const k = W / 1920, p = o.p;
  ctx.save(); ctx.globalAlpha = a; ctx.direction = "rtl";
  if (o.type === "logo") {
    const im = imgOf(p.src);
    if (im) { const w = W * p.size / 100, h = w * im.naturalHeight / im.naturalWidth; const [x, y] = place(pos2(p.pos), w, h, W, H, W * p.margin / 100);
      ctx.globalAlpha = a * p.opacity; ctx.drawImage(im, x, y, w, h); }
  } else if (o.type === "lower") {
    const s = k * p.size / 100, w = 760 * s, h = 150 * s, [x0, y0] = place(pos2(p.pos), w, h, W, H, 60 * k);
    const dx = (1 - a) * 80 * s * (p.pos[1] === "l" ? -1 : 1);
    ctx.translate(dx, 0); ctx.fillStyle = p.bar; ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 20 * k;
    rr(ctx, x0, y0, w, h, 12 * s); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = p.accent; ctx.fillRect(x0 + w - 12 * s, y0, 12 * s, h);
    ctx.fillStyle = p.color; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    ctx.font = "800 " + 56 * s + "px " + FONT; ctx.fillText(p.l1, x0 + w - 40 * s, y0 + 66 * s, w - 70 * s);
    ctx.globalAlpha = a * .85; ctx.font = "500 " + 34 * s + "px " + FONT; ctx.fillText(p.l2, x0 + w - 40 * s, y0 + 116 * s, w - 70 * s);
  } else if (o.type === "ticker") {
    const h = p.h * k, y = p.top ? 0 : H - h; ctx.fillStyle = p.bg; ctx.fillRect(0, y, W, h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
    ctx.fillStyle = p.color; ctx.font = "700 " + h * .5 + "px " + FONT; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.direction = "rtl";
    const tw = ctx.measureText(p.text).width + 200 * k, off = (now / 1000 * p.speed * k) % tw;
    for (let x = -tw + off; x < W; x += tw) ctx.fillText(p.text, x, y + h / 2 + 2 * k);
    ctx.restore();
  } else if (o.type === "clock") {
    const s = k * p.size / 100, d = new Date();
    const t = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: p.seconds ? "2-digit" : undefined, hour12: false });
    const ds = p.date ? d.toLocaleDateString(p.hebrew ? "he-IL-u-ca-hebrew" : "he-IL", { weekday: "long", day: "numeric", month: "long", year: p.hebrew ? "numeric" : undefined }) : "";
    ctx.font = "800 " + 64 * s + "px " + FONT; const w1 = ctx.measureText(t).width;
    ctx.font = "500 " + 30 * s + "px " + FONT; const w2 = ds ? ctx.measureText(ds).width : 0;
    const w = Math.max(w1, w2) + 50 * s, h = (ds ? 130 : 90) * s, [x, y] = place(pos2(p.pos), w, h, W, H, 40 * k);
    ctx.fillStyle = p.bg; rr(ctx, x, y, w, h, 14 * s); ctx.fill(); ctx.fillStyle = p.color; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "800 " + 64 * s + "px " + FONT; ctx.fillText(t, x + w / 2, y + 68 * s);
    if (ds) { ctx.font = "500 " + 30 * s + "px " + FONT; ctx.fillText(ds, x + w / 2, y + 112 * s); }
  } else if (o.type === "countdown") {
    const s = k * p.size / 100, ms = S.countdownLeft(o);
    let txt; if (ms <= 0 && (p.endAt || p.mode === "time")) txt = p.endText; else {
      const t = Math.max(0, Math.ceil(ms / 1000)), hh = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), ss = t % 60;
      txt = (hh ? hh + ":" : "") + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0"); }
    ctx.font = "800 " + 110 * s + "px " + FONT; const w1 = ctx.measureText(txt).width;
    ctx.font = "600 " + 36 * s + "px " + FONT; const w2 = p.label ? ctx.measureText(p.label).width : 0;
    const w = Math.max(w1, w2) + 80 * s, h = (p.label ? 200 : 150) * s, [x, y] = place(pos2(p.pos), w, h, W, H, 50 * k);
    ctx.fillStyle = p.bg; rr(ctx, x, y, w, h, 18 * s); ctx.fill(); ctx.fillStyle = p.color; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    if (p.label) { ctx.font = "600 " + 36 * s + "px " + FONT; ctx.fillText(p.label, x + w / 2, y + 56 * s); }
    ctx.font = "800 " + 110 * s + "px " + FONT; ctx.fillText(txt, x + w / 2, y + h - 38 * s);
  } else if (o.type === "text") {
    const s = k * p.size / 100; ctx.font = "700 " + 54 * s + "px " + FONT; const w = ctx.measureText(p.text).width + 60 * s, h = 90 * s;
    const [x, y] = place(pos2(p.pos), w, h, W, H, 40 * k); ctx.fillStyle = p.bg; rr(ctx, x, y, w, h, 14 * s); ctx.fill();
    ctx.fillStyle = p.color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.text, x + w / 2, y + h / 2 + 3 * s);
  } else if (o.type === "frame") {
    ctx.strokeStyle = p.color; ctx.lineWidth = p.w * k * 2; ctx.strokeRect(0, 0, W, H);
  }
  ctx.restore();
}
S.drawOverlays = (ctx, W, H, now) => S.overlays.forEach(o => drawOverlay(ctx, o, W, H, now));

/* ---------- מקורות ---------- */
S.src = id => id ? S.sources.find(s => s.id === id) || null : null;
const hold = document.createElement("div");
hold.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden";
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(hold));

S.renderText = function (src) {
  const p = src.props, c = src.canvas || (src.canvas = document.createElement("canvas")); c.width = 1920; c.height = 1080;
  const x = c.getContext("2d"); x.clearRect(0, 0, 1920, 1080);
  if (p.bg) { x.fillStyle = p.bg; x.fillRect(0, 0, 1920, 1080); }
  const lines = String(p.text || "").split("\n"), sz = p.size * 1.5; x.font = (p.bold ? "800 " : "500 ") + sz + "px " + FONT;
  x.fillStyle = p.color; x.direction = "rtl"; x.textBaseline = "middle"; x.textAlign = p.align === "right" ? "right" : p.align === "left" ? "left" : "center";
  const ax = p.align === "right" ? 1800 : p.align === "left" ? 120 : 960, lh = sz * 1.25, y0 = 540 - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => x.fillText(l, ax, y0 + i * lh, 1700));
};
S.slideGo = function (src, d) {
  if (!src.slides || !src.slides.length) return; src.idx = (src.idx + d + src.slides.length) % src.slides.length;
  src.img = new Image(); src.img.src = src.slides[src.idx]; S.emit("source", src);
};

S.devices = async function (probe) {
  if (probe) { try { const t = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); t.getTracks().forEach(x => x.stop()); }
    catch (e) { try { const t = await navigator.mediaDevices.getUserMedia({ audio: true }); t.getTracks().forEach(x => x.stop()); } catch (e2) { /* בלי הרשאה */ } } }
  const all = await navigator.mediaDevices.enumerateDevices(), by = k => all.filter(d => d.kind === k && d.deviceId);
  return { video: by("videoinput"), audio: by("audioinput"), out: by("audiooutput") };
};

function ensureAudio() {
  if (S.ac) { if (S.ac.state === "suspended") S.ac.resume(); return S.ac; }
  const ac = S.ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  S.mIn = ac.createGain(); S.limiter = ac.createDynamicsCompressor(); S.mOut = ac.createGain(); S.mAn = ac.createAnalyser(); S.mAn.fftSize = 1024;
  S.dest = ac.createMediaStreamDestination(); S.recDelay = ac.createDelay(1);
  S.monGain = ac.createGain(); S.monGain.gain.value = 0;
  /* ההשמעה במחשב יוצאת ישר מהמעבד של השמע (השהיה מינימלית). ההקלטה והשידור עוברים דרך השהיה שאפשר לכוון לסנכרון עם התמונה */
  S.mIn.connect(S.limiter); S.limiter.connect(S.mOut); S.mOut.connect(S.mAn); S.mOut.connect(S.recDelay); S.recDelay.connect(S.dest); S.mOut.connect(S.monGain); S.monGain.connect(ac.destination);
  S.applyAudioSettings(); return ac;
}
S.ensureAudio = ensureAudio;
S.applyAudioSettings = function () {
  if (!S.ac) return; const t = S.ac.currentTime, st = S.settings;
  S.mOut.gain.setTargetAtTime(st.masterVol, t, .03);
  S.limiter.threshold.value = st.limiter ? -3 : 0; S.limiter.ratio.value = st.limiter ? 20 : 1; S.limiter.attack.value = .003; S.limiter.knee.value = 0;
  S.monGain.gain.setTargetAtTime(st.monitor ? 1 : 0, t, .03);
  S.recDelay.delayTime.setTargetAtTime((st.recDelay || 0) / 1000, t, .03);
  if (S.ac.setSinkId && S._sink !== (st.monitorDev || "")) { S._sink = st.monitorDev || ""; S.ac.setSinkId(S._sink).catch(() => {}); }
};
S.newAudio = () => ({ vol: 1, mute: false, pan: 0, delay: 0, lowcut: false, gate: -70, mode: "always", trim: 0, lo: 0, mid: 0, hi: 0, comp: false });
function buildStrip(src, node) {
  const ac = ensureAudio(), a = src.audio, n = src.nodes = {};
  n.trim = ac.createGain(); n.hp = ac.createBiquadFilter(); n.hp.type = "highpass";
  n.lo = ac.createBiquadFilter(); n.lo.type = "lowshelf"; n.lo.frequency.value = 200;
  n.mid = ac.createBiquadFilter(); n.mid.type = "peaking"; n.mid.frequency.value = 1500; n.mid.Q.value = 1;
  n.hi = ac.createBiquadFilter(); n.hi.type = "highshelf"; n.hi.frequency.value = 5000;
  n.comp = ac.createDynamicsCompressor(); n.delay = ac.createDelay(2); n.gate = ac.createGain(); n.fader = ac.createGain();
  n.pan = ac.createStereoPanner(); n.an = ac.createAnalyser(); n.an.fftSize = 1024; n.an0 = ac.createAnalyser(); n.an0.fftSize = 1024;
  node.connect(n.trim); n.trim.connect(n.hp); n.hp.connect(n.lo); n.lo.connect(n.mid); n.mid.connect(n.hi); n.hi.connect(n.comp);
  n.comp.connect(n.an0); n.comp.connect(n.delay); n.delay.connect(n.gate); n.gate.connect(n.fader); n.fader.connect(n.pan); n.pan.connect(n.an); n.pan.connect(S.mIn);
  n.gOpen = 0; n.buf = new Float32Array(1024); n.src = node; S.applyStrip(src, true);
}
S.applyStrip = function (src, now) {
  const n = src.nodes; if (!n) return; const a = src.audio, t = S.ac.currentTime, tc = now ? 0 : .03;
  n.trim.gain.setTargetAtTime(Math.pow(10, a.trim / 20), t, tc);
  n.hp.frequency.value = a.lowcut ? 90 : 10; n.lo.gain.value = a.lo; n.mid.gain.value = a.mid; n.hi.gain.value = a.hi;
  n.comp.threshold.value = a.comp ? -26 : 0; n.comp.ratio.value = a.comp ? 4 : 1; n.comp.knee.value = 10;
  n.delay.delayTime.value = a.delay / 1000; n.pan.pan.value = a.pan;
};
function rms(an, buf) { an.getFloatTimeDomainData(buf); let s = 0, pk = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); s += v * v; if (v > pk) pk = v; } return [Math.sqrt(s / buf.length), pk]; }
S.level = function (src) { if (!src.nodes) return 0; return rms(src.nodes.an, src.nodes.buf)[1]; };
S.masterLevel = function () { if (!S.mAn) return 0; S._mb = S._mb || new Float32Array(1024); return rms(S.mAn, S._mb)[1]; };

S.addSource = async function (def, id) {
  const src = { id: id || S.uid(), kind: def.kind, name: def.name || "מקור", props: def.props || {}, def: { kind: def.kind, name: def.name, props: def.props || {} }, hasAudio: false, persist: true };
  S.sources = S.sources.filter(s => s.id !== src.id); const k = def.kind, p = src.props;
  try {
    if (k === "device" || k === "mic") {
      const au = id => ({ deviceId: id ? { exact: id } : undefined, echoCancellation: !!p.ec, noiseSuppression: !!p.ns, autoGainControl: !!p.agc, channelCount: { ideal: 2 }, latency: { ideal: 0.01 } });
      const c = {}; if (k === "device") { const [w, h] = (p.res || "1920x1080").split("x").map(Number);
        c.video = { deviceId: { exact: p.vid }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: Number(p.fps) || 30 } }; }
      if (p.aud !== "none" && (k === "mic" || p.aud)) c.audio = au(p.aud); else c.audio = false;
      const st = src.stream = await navigator.mediaDevices.getUserMedia(c);
      if (k === "device") { const v = src.el = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = st; hold.appendChild(v); await v.play().catch(() => {});
        if (v.requestVideoFrameCallback) { const kick = () => { if (S.sources.includes(src)) { tick(); v.requestVideoFrameCallback(kick); } }; v.requestVideoFrameCallback(kick); } }
      if (st.getAudioTracks().length) { src.hasAudio = true; src.audio = S.newAudio(); buildStrip(src, S.ac ? S.ac.createMediaStreamSource(st) : ensureAudio().createMediaStreamSource(st)); }
      st.getTracks().forEach(t => t.addEventListener("ended", () => { src.lost = true; S.emit("source", src); }));
    } else if (k === "screen") {
      src.persist = false;
      const st = src.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: p.audio !== false });
      const v = src.el = document.createElement("video"); v.muted = true; v.srcObject = st; hold.appendChild(v); await v.play().catch(() => {});
      if (st.getAudioTracks().length) { src.hasAudio = true; src.audio = S.newAudio(); buildStrip(src, ensureAudio().createMediaStreamSource(st)); }
      st.getVideoTracks()[0].addEventListener("ended", () => { src.lost = true; S.emit("source", src); });
      if (!def.name) src.name = "שיתוף מסך";
    } else if (k === "video" || k === "audio") {
      src.persist = false; const url = src.url = URL.createObjectURL(def.file);
      const v = src.el = document.createElement(k === "video" ? "video" : "audio"); v.src = url; v.playsInline = true; v.loop = false; v.preload = "auto";
      if (k === "video") hold.appendChild(v); src.hasAudio = true; src.audio = S.newAudio(); src.audio.mode = "always";
      buildStrip(src, ensureAudio().createMediaElementSource(v)); src.fileName = def.file.name; if (!def.name) src.name = def.file.name.replace(/\.[^.]+$/, "");
      v.addEventListener("ended", () => S.emit("source", src)); v.addEventListener("play", () => S.emit("source", src)); v.addEventListener("pause", () => S.emit("source", src));
    } else if (k === "image") {
      const url = def.file ? await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(def.file); }) : p.url;
      p.url = url; src.persist = url.length < 1.2e6; src.def.props = { url: src.persist ? url : "" };
      const im = src.el = new Image(); im.src = url; await im.decode().catch(() => {});
      if (!def.name && def.file) src.name = def.file.name.replace(/\.[^.]+$/, "");
    } else if (k === "slides") {
      src.persist = false; src.slides = def.files.map(f => URL.createObjectURL(f)); src.idx = 0; src.img = new Image(); src.img.src = src.slides[0];
      p.auto = p.auto || 0; if (!def.name) src.name = "מצגת (" + src.slides.length + ")";
      S.startSlideTimer(src);
    } else if (k === "text") { src.props = Object.assign({ text: "טקסט", size: 120, color: "#ffffff", bg: "#16233F", align: "center", bold: true }, p); src.def.props = src.props; S.renderText(src); }
    else if (k === "color") { src.props = Object.assign({ color: "#16233F" }, p); src.def.props = src.props; }
  } catch (e) {
    src.error = e.name === "NotAllowedError" ? "אין הרשאה למצלמה / למסך" : e.name === "NotFoundError" ? "ההתקן לא נמצא" : e.name === "NotReadableError" ? "ההתקן תפוס בתוכנה אחרת" : (e.message || "שגיאה");
    S.sources.push(src); S.emit("sources"); throw Object.assign(new Error(src.error), { src });
  }
  S.sources.push(src); S.emit("sources"); S.save(); return src;
};
S.startSlideTimer = function (src) {
  clearInterval(src._timer); if (src.props.auto > 0) src._timer = setInterval(() => S.slideGo(src, 1), src.props.auto * 1000);
};
S.addMissing = function (def, id) { const src = { id, kind: def.kind, name: def.name, props: def.props || {}, def, missing: true, persist: true, hasAudio: false };
  S.sources.push(src); return src; };
S.disposeSource = function (s) {
  clearInterval(s._timer);
  if (s.stream) s.stream.getTracks().forEach(t => t.stop());
  if (s.el && s.el.pause) { s.el.pause(); s.el.remove(); }
  if (s.url) URL.revokeObjectURL(s.url); if (s.slides) s.slides.forEach(u => URL.revokeObjectURL(u));
  if (s.nodes) { try { s.nodes.pan.disconnect(); s.nodes.src.disconnect(); } catch (e) { /* כבר מנותק */ } }
  S.sources = S.sources.filter(x => x.id !== s.id);
};
S.removeSource = function (id) {
  const s = S.src(id); if (!s) return; S.disposeSource(s);
  S.scenes.forEach(sc => { sc.slots.forEach(sl => { if (sl.src === id) sl.src = null; }); if (sc.opts.bgSrc === id) sc.opts.bgSrc = null; });
  S.emit("sources"); S.save();
};

/* ---------- מעברים ותצוגה ---------- */
S.TRANS = { cut: "חיתוך מיידי", fade: "מעבר הדרגתי", dip: "דרך שחור", slideR: "החלקה ימינה", slideL: "החלקה שמאלה", slideU: "החלקה למעלה", wipeR: "מגירה ימינה", wipeL: "מגירה שמאלה", zoom: "התקרבות", flip: "היפוך" };
S.pgm = null; S.pvw = null; S.trans = null;
S.scene = id => S.scenes.find(s => s.id === id) || null;
S.take = function (type, ms) {
  const to = S.scene(S.pvw); if (!to || S.trans) return; const from = S.scene(S.pgm);
  type = type || S.settings.trans; ms = ms == null ? S.settings.transMs : ms;
  if (S.reduceMotion) { type = "cut"; ms = 0; }
  if (!from || type === "cut" || ms <= 0) { S.pgm = to.id; if (S.settings.studio && from) S.pvw = from.id; } else S.trans = { from, to, type, ms, t0: performance.now() };
  S.emit("scenes");
};
S.goLive = function (id, type) { S.pvw = id; S.take(type); };
let sA, sB;
function ease(p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
function compose(ctx, W, H) {
  const T = S.trans, p = Math.min(1, (performance.now() - T.t0) / T.ms), e = ease(p);
  if (!sA || sA.width !== W) { sA = document.createElement("canvas"); sB = document.createElement("canvas"); sA.width = sB.width = W; sA.height = sB.height = H; }
  const a = sA.getContext("2d"), b = sB.getContext("2d"); S.renderScene(a, T.from, W, H); S.renderScene(b, T.to, W, H);
  ctx.save(); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  switch (T.type) {
    case "fade": ctx.drawImage(sA, 0, 0); ctx.globalAlpha = e; ctx.drawImage(sB, 0, 0); break;
    case "dip": if (p < .5) { ctx.globalAlpha = 1 - p * 2; ctx.drawImage(sA, 0, 0); } else { ctx.globalAlpha = (p - .5) * 2; ctx.drawImage(sB, 0, 0); } break;
    case "slideR": ctx.drawImage(sA, e * W, 0); ctx.drawImage(sB, (e - 1) * W, 0); break;
    case "slideL": ctx.drawImage(sA, -e * W, 0); ctx.drawImage(sB, (1 - e) * W, 0); break;
    case "slideU": ctx.drawImage(sA, 0, -e * H); ctx.drawImage(sB, 0, (1 - e) * H); break;
    case "wipeR": ctx.drawImage(sA, 0, 0); ctx.drawImage(sB, 0, 0, e * W, H, 0, 0, e * W, H); break;
    case "wipeL": ctx.drawImage(sA, 0, 0); ctx.drawImage(sB, (1 - e) * W, 0, e * W, H, (1 - e) * W, 0, e * W, H); break;
    case "zoom": ctx.drawImage(sA, 0, 0); ctx.globalAlpha = e; { const s = 1.4 - .4 * e; ctx.drawImage(sB, W * (1 - s) / 2, H * (1 - s) / 2, W * s, H * s); } break;
    case "flip": { const first = p < .5, s = Math.abs(Math.cos(p * Math.PI)); ctx.drawImage(first ? sA : sB, W * (1 - s) / 2, 0, W * s, H); } break;
    default: ctx.drawImage(sB, 0, 0);
  }
  ctx.restore();
  if (p >= 1) { S.pgm = T.to.id; if (S.settings.studio) S.pvw = T.from.id; S.trans = null; S.emit("scenes"); }
}

/* ---------- לולאת ציור ---------- */
S.pgmCanvas = document.createElement("canvas"); S.pvwCanvas = document.createElement("canvas"); S.pvwCanvas.width = 640; S.pvwCanvas.height = 360;
S.fps = 0; let frames = 0, last = performance.now(), tmr;
S.setSize = function (w, h) { S.settings.w = w; S.settings.h = h; S.pgmCanvas.width = w; S.pgmCanvas.height = h; sA = null; S.restartStream(); };
S.restartStream = function () {
  /* captureStream(0) + requestFrame: כל תמונה נשלחת מיד אחרי שצוירה, בלי המתנה למחזור הבא */
  S.outStream = S.pgmCanvas.captureStream(0); S.vt = S.outStream.getVideoTracks()[0];
  if (S.dest) S.dest.stream.getAudioTracks().forEach(t => S.outStream.addTrack(t));
  S.emit("stream");
};
function visibleIds() {
  const ids = new Set(), add = sc => { if (sc) for (let i = 0, n = S.slotCount(sc); i < n; i++) if (sc.slots[i].src) ids.add(sc.slots[i].src); };
  if (S.trans) { add(S.trans.from); add(S.trans.to); } else add(S.scene(S.pgm)); return ids;
}
function audioTick(dt) {
  if (!S.ac) return; const vis = visibleIds(), t = S.ac.currentTime;
  S.sources.forEach(s => {
    if (!s.nodes) return; const a = s.audio; let g = a.mute ? 0 : a.vol;
    if (a.mode === "follow" && !vis.has(s.id)) g = 0;
    s.nodes.fader.gain.setTargetAtTime(g, t, .04);
    if (a.gate > -70) { const db = 20 * Math.log10(rms(s.nodes.an0, s.nodes.buf)[0] + 1e-9);
      if (db > a.gate) s.nodes.gOpen = performance.now() + 350; s.nodes.gate.gain.setTargetAtTime(performance.now() < s.nodes.gOpen ? 1 : 0, t, .05); }
    else s.nodes.gate.gain.setTargetAtTime(1, t, .05);
  });
}
function tick() {
  const now = performance.now(); if (now - (S._drawn || 0) < 700 / S.settings.fps) return; S._drawn = now;
  const W = S.pgmCanvas.width, H = S.pgmCanvas.height, ctx = S.pgmCanvas.getContext("2d");
  S.overlays.forEach(o => { const tgt = o.on ? 1 : 0; o._a += Math.sign(tgt - o._a) * Math.min(Math.abs(tgt - o._a), (now - (S._lt || now)) / 300); });
  const dt = now - (S._lt || now); S._lt = now;
  if (S.trans) compose(ctx, W, H);
  else { const sc = S.scene(S.pgm); if (sc) S.renderScene(ctx, sc, W, H); else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); } }
  S.drawOverlays(ctx, W, H, now);
  const pc = S.pvwCanvas.getContext("2d"), pv = S.scene(S.pvw); if (pv) S.renderScene(pc, pv, 640, 360); else { pc.fillStyle = "#000"; pc.fillRect(0, 0, 640, 360); }
  S.drawOverlays(pc, 640, 360, now);
  if (S.vt && S.vt.requestFrame) S.vt.requestFrame();
  audioTick(dt); frames++;
  if (now - last >= 1000) { S.fps = Math.round(frames * 1000 / (now - last)); frames = 0; last = now; S.emit("stats"); }
}
S.start = function () {
  ensureAudio(); S.pgmCanvas.width = S.settings.w; S.pgmCanvas.height = S.settings.h; S.restartStream();
  clearInterval(tmr); if (S._wk) S._wk.terminate();
  try {
    const wk = S._wk = new Worker(URL.createObjectURL(new Blob(["let t=null;onmessage=e=>{clearInterval(t);t=setInterval(()=>postMessage(0),1000/e.data)}"], { type: "text/javascript" })));
    wk.onmessage = tick; wk.postMessage(S.settings.fps);
  } catch (e) { tmr = setInterval(tick, 1000 / S.settings.fps); }
};
S.setFps = function (f) { S.settings.fps = f; S.start(); };

/* ---------- הקלטה ---------- */
S.MIMES = [["mp4", 'video/mp4;codecs=avc1,mp4a.40.2'], ["mp4", "video/mp4"], ["webm", "video/webm;codecs=vp9,opus"], ["webm", "video/webm;codecs=vp8,opus"], ["webm", "video/webm"]];
S.pickMime = function () {
  const want = S.settings.container;
  for (const [ext, m] of S.MIMES) if ((want === "auto" || want === ext) && MediaRecorder.isTypeSupported(m)) return [ext, m];
  for (const [ext, m] of S.MIMES) if (MediaRecorder.isTypeSupported(m)) return [ext, m];
  return null;
};
S.rec = null;
S.recStart = async function () {
  if (S.rec) return; ensureAudio();
  const pm = S.pickMime(); if (!pm) throw new Error("הדפדפן לא תומך בהקלטה");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-"), name = "הקלטה_" + stamp + "." + pm[0];
  const item = { id: S.uid(), name, ext: pm[0], mime: pm[1], chunks: [], bytes: 0, t0: Date.now(), dur: 0, handle: null, writer: null, chain: Promise.resolve(), state: "rec" };
  if (window.showSaveFilePicker) {
    try { item.handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "וידאו", accept: { [pm[0] === "mp4" ? "video/mp4" : "video/webm"]: ["." + pm[0]] } }] });
      item.writer = await item.handle.createWritable(); item.name = item.handle.name; }
    catch (e) { if (e.name === "AbortError") throw new Error("בוטל"); item.handle = null; }
  }
  const mr = item.mr = new MediaRecorder(S.outStream, { mimeType: pm[1], videoBitsPerSecond: S.settings.bitrate * 1e6, audioBitsPerSecond: 192000 });
  mr.ondataavailable = ev => {
    if (!ev.data.size) return; item.bytes += ev.data.size;
    if (item.writer) item.chain = item.chain.then(() => item.writer.write(ev.data)).catch(() => { item.err = true; });
    else item.chunks.push(ev.data);
  };
  mr.onstop = async () => {
    item.dur += Date.now() - item.t0; await item.chain;
    if (item.writer) { try { await item.writer.close(); } catch (e) { /* נסגר */ } }
    else item.blob = new Blob(item.chunks, { type: item.mime });
    item.state = "done"; S.rec = null; S.emit("rec"); S.emit("recs");
  };
  mr.start(1000); S.rec = item; S.recordings.unshift(item); S.emit("rec"); S.emit("recs");
};
S.recPause = function () { const r = S.rec; if (!r) return; if (r.mr.state === "recording") { r.dur += Date.now() - r.t0; r.mr.pause(); r.state = "pause"; } else { r.t0 = Date.now(); r.mr.resume(); r.state = "rec"; } S.emit("rec"); };
S.recStop = function () { if (S.rec) S.rec.mr.stop(); };
S.recElapsed = r => r.dur + (r.state === "rec" ? Date.now() - r.t0 : 0);
S.recFile = async function (r) { return r.handle ? r.handle.getFile() : r.blob; };
S.recDownload = async function (r) {
  const f = await S.recFile(r), a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = r.name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
};

/* ---------- העלאה לדרייב (בנתחים דרך האתר) ---------- */
S.uploadDrive = async function (r, onProg) {
  const f = await S.recFile(r), csrf = document.querySelector('meta[name="csrf-token"]').content, H = { "X-CSRFToken": csrf };
  let res = await fetch(S.urls.driveStart, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify({ name: r.name, type: f.type || r.mime }) });
  let js = await res.json(); if (!res.ok) throw new Error(js.error || "ההעלאה לא נפתחה");
  const CH = 8 * 1024 * 1024; let off = 0;
  while (off < f.size) {
    const end = Math.min(off + CH, f.size), body = f.slice(off, end);
    for (let tries = 0; ; tries++) {
      try { res = await fetch(S.urls.driveChunk + "?sid=" + js.sid + "&start=" + off + "&total=" + f.size, { method: "POST", headers: H, body });
        js = Object.assign(js, await res.json()); if (!res.ok) throw new Error(js.error || "שגיאה"); break; }
      catch (e) { if (tries >= 3) throw e; await new Promise(k => setTimeout(k, 1500 * (tries + 1))); }
    }
    off = end; onProg && onProg(off / f.size);
  }
  return js;
};

/* ---------- שמירה וטעינה ---------- */
S.KEY = "studio.v1";
S.snapshot = function (forExport) {
  return { v: 1, settings: forExport && S.settings.stream ? Object.assign({}, S.settings, { stream: Object.assign({}, S.settings.stream, { key: "" }) }) : S.settings, pgm: S.pgm, pvw: S.pvw,
    show: S.show, scenes: S.scenes, overlays: S.overlays.map(o => Object.assign({}, o, { _a: 0, on: false })),
    sources: S.sources.map(s => ({ id: s.id, def: s.persist ? s.def : { kind: s.kind, name: s.name, props: {} }, persist: s.persist, audio: s.audio || null })) };
};
let saveT; S.save = function () { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(S.KEY, JSON.stringify(S.snapshot())); } catch (e) { S.emit("savefail"); } }, 400); };
S.restore = async function (data) {
  S.settings = Object.assign(S.defaults(), data.settings || {}); S.scenes = data.scenes || []; S.overlays = (data.overlays || []).map(o => Object.assign(o, { _a: 0 }));
  S.show = data.show || { steps: [], loop: false, startAt: "" };
  S.pgm = data.pgm; S.pvw = data.pvw; const fails = [];
  for (const sd of data.sources || []) {
    try {
      if (sd.persist && ["device", "mic", "text", "color", "image"].includes(sd.def.kind)) { const s = await S.addSource(sd.def, sd.id); if (sd.audio && s.audio) { Object.assign(s.audio, sd.audio); S.applyStrip(s, true); } }
      else S.addMissing(sd.def, sd.id);
    } catch (e) { fails.push(sd.def.name + ": " + e.message); }
  }
  S.emit("sources"); S.emit("scenes"); return fails;
};
S.urls = {};
})();
