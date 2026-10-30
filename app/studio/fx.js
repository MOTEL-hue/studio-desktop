/* אולפן שידור - רקעים מונפשים, אפקטים (נצנצים, זיקוקים...) וזיהוי פסים שחורים. הכול מחושב לפי הזמן, בלי מצב שנשמר. */
(function () {
"use strict";
const S = window.Studio, TAU = Math.PI * 2;
function rnd(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const now = () => performance.now() / 1000;
S.BGS = { gradient: "צבע מדורג (רגיל)", stars: "שמיים זרועי כוכבים", aurora: "זוהר צפוני", bokeh: "עיגולי אור", waves: "גלים", grid: "רשת טכנולוגית", gold: "זהב יוקרתי", rays: "קרני אור" };
S.FXS = { none: "בלי אפקט", sparkles: "נצנצים", fireworks: "זיקוקים", confetti: "קונפטי", snow: "שלג", bubbles: "בועות", hearts: "לבבות" };

function lin(ctx, W, H, a, b) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
function blob(ctx, x, y, r, col) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }

S.drawBg = function (ctx, o, W, H) {
  const t = now(), k = W / 1920, kind = o.bgKind || "gradient"; ctx.save();
  if (kind === "stars") {
    lin(ctx, W, H, "#050a1c", "#13204a"); const R = rnd(7);
    for (let i = 0; i < 150; i++) { const x = R() * W, y = R() * H * .9, r = (.6 + R() * 1.8) * k, ph = R() * TAU, sp = .8 + R() * 2.2; ctx.globalAlpha = .35 + .65 * (.5 + .5 * Math.sin(t * sp + ph)); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    const c = Math.floor(t / 7), u = (t % 7) / 1.1; if (u < 1) { const Q = rnd(c * 31 + 5), x0 = Q() * W * .7, y0 = Q() * H * .4; ctx.globalAlpha = 1 - u; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.moveTo(x0 + u * 420 * k, y0 + u * 240 * k); ctx.lineTo(x0 + u * 420 * k - 140 * k, y0 + u * 240 * k - 80 * k); ctx.stroke(); }
  } else if (kind === "aurora") {
    lin(ctx, W, H, "#040814", "#0a1630"); ctx.globalCompositeOperation = "lighter";
    [["rgba(40,255,160,.45)", 0], ["rgba(60,140,255,.4)", 2], ["rgba(190,80,255,.35)", 4]].forEach(([col, ph], i) => blob(ctx, W * (.2 + .3 * i + .1 * Math.sin(t * .3 + ph)), H * (.35 + .15 * Math.cos(t * .25 + ph)), W * .42, col));
  } else if (kind === "bokeh") {
    lin(ctx, W, H, o.bg1, o.bg2); const R = rnd(11);
    for (let i = 0; i < 18; i++) { const x0 = R() * W, y0 = R(), sp = 6 + R() * 14, r = (40 + R() * 110) * k, ph = R() * TAU; blob(ctx, x0 + Math.sin(t * .4 + ph) * 40 * k, H - ((y0 * H + t * sp * k) % (H + r * 2)) + r, r, "rgba(255,255,255,.2)"); }
  } else if (kind === "waves") {
    lin(ctx, W, H, o.bg1, o.bg2);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = "rgba(255,255,255," + (.07 + i * .03) + ")"; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * (.72 + .06 * i) + Math.sin(x / (260 * k) * (1 + i * .3) + t * (.7 + i * .25) + i) * 34 * k); ctx.lineTo(W, H); ctx.fill(); }
  } else if (kind === "grid") {
    lin(ctx, W, H, "#070b1e", o.bg2); ctx.strokeStyle = "rgba(110,170,255,.14)"; ctx.lineWidth = 1.5 * k; const sp = 80 * k, off = (t * 26 * k) % sp;
    for (let x = -sp + off; x < W + sp; x += sp) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = -sp + off; y < H + sp; y += sp) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalCompositeOperation = "lighter"; blob(ctx, W * (.3 + .1 * Math.sin(t * .4)), H * .4, W * .35, "rgba(60,120,255,.25)"); blob(ctx, W * (.75 + .08 * Math.cos(t * .3)), H * .65, W * .3, "rgba(160,70,255,.2)");
  } else if (kind === "gold") {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * .7); g.addColorStop(0, "#6b4a08"); g.addColorStop(1, "#150d00"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const bx = ((t * .09) % 1.5 - .25) * W, lg = ctx.createLinearGradient(bx - 260 * k, 0, bx + 260 * k, H); lg.addColorStop(0, "rgba(255,230,150,0)"); lg.addColorStop(.5, "rgba(255,230,150,.2)"); lg.addColorStop(1, "rgba(255,230,150,0)"); ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  } else if (kind === "rays") {
    lin(ctx, W, H, o.bg1, o.bg2); ctx.translate(W / 2, -H * .1); ctx.fillStyle = "rgba(255,255,255,.07)";
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + t * .05; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * W * 1.6, Math.sin(a) * W * 1.6); ctx.lineTo(Math.cos(a + .13) * W * 1.6, Math.sin(a + .13) * W * 1.6); ctx.fill(); }
  } else lin(ctx, W, H, o.bg1, o.bg2);
  ctx.restore();
};

const PAL = ["#ff4d6d", "#ffd23f", "#3bceac", "#4dabf7", "#b388ff", "#ff9f1c"];
function star4(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, d = i % 2 ? r * .22 : r; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } ctx.closePath(); ctx.fill(); }
function heart(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + s * .35); ctx.bezierCurveTo(x - s, y - s * .3, x - s * .5, y - s, x, y - s * .45); ctx.bezierCurveTo(x + s * .5, y - s, x + s, y - s * .3, x, y + s * .35); ctx.fill(); }

S.drawFx = function (ctx, o, W, H) {
  const t = now(), k = W / 1920, L = o.fxLevel || 3, kind = o.fxKind; ctx.save();
  if (kind === "sparkles") {
    const R = rnd(21); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 28 * L; i++) { const x = R() * W, y = R() * H, r = (6 + R() * 16) * k, ph = R() * TAU, sp = 1.5 + R() * 3, a = Math.max(0, Math.sin(t * sp + ph)); ctx.globalAlpha = a * a; ctx.fillStyle = R() < .5 ? "#fff3b0" : "#ffffff"; star4(ctx, x, y, r * (.5 + a * .6)); }
  } else if (kind === "fireworks") {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 2 + L; i++) {
      const per = 2.9 + i * .37, u = (t + i * 1.1) % per, c = Math.floor((t + i * 1.1) / per), R = rnd(c * 17 + i * 131 + 3), x0 = (.12 + R() * .76) * W, y1 = (.12 + R() * .35) * H, hue = R() * 360;
      if (u < .8) { const p = u / .8, y = H - (H - y1) * (1 - (1 - p) * (1 - p)); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x0, y, 3 * k, 0, TAU); ctx.fill(); ctx.strokeStyle = "rgba(255,230,160,.6)"; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0, y + 40 * k); ctx.stroke(); }
      else { const age = u - .8; if (age > 2) continue; const n = 64, sp = (180 + R() * 160) * k;
        for (let j = 0; j < n; j++) { const a = j * TAU / n + R() * .2, v = sp * (.55 + R() * .45), d = v * (1 - Math.exp(-age * 2.2)) / 2.2 * 2, x = x0 + Math.cos(a) * d, y = y1 + Math.sin(a) * d + 130 * k * age * age;
          ctx.globalAlpha = Math.max(0, 1 - age / 2) * (.6 + .4 * Math.sin(age * 30 + j)); ctx.fillStyle = "hsl(" + (hue + (j % 3) * 25) + ",100%,65%)"; ctx.beginPath(); ctx.arc(x, y, (3.2 - age) * k, 0, TAU); ctx.fill(); } }
    }
  } else if (kind === "confetti") {
    const R = rnd(33);
    for (let i = 0; i < 40 * L; i++) { const x0 = R(), y0 = R(), sp = (90 + R() * 160) * k, sz = (8 + R() * 10) * k, ph = R() * TAU, rs = 2 + R() * 4, col = PAL[i % PAL.length];
      const y = (y0 * H + t * sp) % (H + 60 * k) - 30 * k, x = x0 * W + Math.sin(t * .9 + ph) * 50 * k; ctx.save(); ctx.translate(x, y); ctx.rotate(t * rs * .5 + ph); ctx.scale(1, Math.cos(t * rs + ph)); ctx.fillStyle = col; ctx.fillRect(-sz / 2, -sz / 3, sz, sz * .66); ctx.restore(); }
  } else if (kind === "snow") {
    const R = rnd(45); ctx.fillStyle = "#fff";
    for (let i = 0; i < 50 * L; i++) { const x0 = R(), y0 = R(), sp = (30 + R() * 90) * k, r = (1.6 + R() * 4.4) * k, ph = R() * TAU; ctx.globalAlpha = .55 + R() * .4; ctx.beginPath(); ctx.arc(x0 * W + Math.sin(t * .6 + ph) * 36 * k, (y0 * H + t * sp) % (H + 20 * k) - 10 * k, r, 0, TAU); ctx.fill(); }
  } else if (kind === "bubbles") {
    const R = rnd(55); ctx.lineWidth = 2 * k;
    for (let i = 0; i < 12 * L; i++) { const x0 = R(), y0 = R(), sp = (25 + R() * 60) * k, r = (10 + R() * 34) * k, ph = R() * TAU, x = x0 * W + Math.sin(t * .7 + ph) * 30 * k, y = H + r - ((y0 * (H + 2 * r) + t * sp) % (H + 2 * r));
      ctx.globalAlpha = .55; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.globalAlpha = .18; ctx.fillStyle = "#bfe3ff"; ctx.fill(); ctx.globalAlpha = .7; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, r * .16, 0, TAU); ctx.fill(); }
  } else if (kind === "hearts") {
    const R = rnd(66);
    for (let i = 0; i < 9 * L; i++) { const x0 = R(), y0 = R(), sp = (35 + R() * 70) * k, s = (14 + R() * 30) * k, ph = R() * TAU, x = x0 * W + Math.sin(t * .8 + ph) * 40 * k, y = H + s - ((y0 * (H + 2 * s) + t * sp) % (H + 2 * s)); ctx.globalAlpha = .55 + .3 * R(); ctx.fillStyle = i % 2 ? "#ff5d8f" : "#ff8fab"; heart(ctx, x, y, s); }
  }
  ctx.restore();
};

/* זיהוי פסים שחורים בתוך הסרטון (למשל סרטון עם פסים שמורצו לתוכו) ומחזיר חיתוך [שמאל, למעלה, ימין, למטה] */
S.detectBars = function (src) {
  const v = S.visual(src); if (!v) return null; const [SW, SH] = S.dims(v), w = 192, h = Math.max(8, Math.round(w * SH / SW)), c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(v, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data;
  const lum = (px, py) => { const i = (py * w + px) * 4; return .3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2]; };
  const rowBright = py => { let n = 0; for (let px = 0; px < w; px++) if (lum(px, py) > 28) n++; return n / w > .04; };
  const colBright = px => { let n = 0; for (let py = 0; py < h; py++) if (lum(px, py) > 28) n++; return n / h > .04; };
  let t = 0, b = h - 1, l = 0, r = w - 1; while (t < h - 1 && !rowBright(t)) t++; while (b > t && !rowBright(b)) b--; while (l < w - 1 && !colBright(l)) l++; while (r > l && !colBright(r)) r--;
  const out = [l / w, t / h, 1 - (r + 1) / w, 1 - (b + 1) / h].map(q => (q < .008 ? 0 : Math.min(.45, q + .004)));
  return out.some(q => q > 0) ? out : null;
};
})();
