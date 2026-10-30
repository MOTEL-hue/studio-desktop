/* חלון ההצגה: מצייר ישר מהמסך של האולפן (הדף שפתח אותו), כדי לקצר את ההשהיה. אם זה לא אפשרי, חוזר להצגה כווידאו.
   השמע לא יוצא מכאן אלא מדף האולפן, מהמכשיר שנבחר שם. */
(function () {
  "use strict";
  var v = document.getElementById("v"), wait = document.getElementById("wait"), hint = document.getElementById("hint");
  var cv = document.createElement("canvas"), ctx = cv.getContext("2d", { alpha: false }), useVideo = false;
  document.body.insertBefore(cv, v); v.style.display = "none"; v.muted = true;
  function fs() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {}); }
  document.addEventListener("dblclick", fs);
  document.addEventListener("keydown", function (e) { if (e.key === "f" || e.key === "F" || e.key === "ב") fs(); });
  setTimeout(function () { hint.style.opacity = 0; }, 6000);
  function loop() {
    requestAnimationFrame(loop);
    var S = window.opener && !window.opener.closed && window.opener.Studio;
    if (!S || !S.pgmCanvas) { wait.style.display = "block"; return; }
    wait.style.display = "none";
    if (useVideo) { if (S.outStream && v.srcObject !== S.outStream) { v.srcObject = S.outStream; v.play().catch(function () {}); } return; }
    var d = window.devicePixelRatio || 1, W = Math.round(innerWidth * d), H = Math.round(innerHeight * d);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var src = S.pgmCanvas, sc = Math.min(W / src.width, H / src.height), w = src.width * sc, h = src.height * sc;
    try { ctx.fillStyle = "#000"; if (w < W || h < H) ctx.fillRect(0, 0, W, H); ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h); }
    catch (e) { useVideo = true; cv.style.display = "none"; v.style.display = "block"; }
  }
  loop();
  document.addEventListener("click", function () { v.play().catch(function () {}); });
})();
