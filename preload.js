// גשר קטן לדפי הנעילה והסיסמה המקומיים בלבד. הוא גם מסמן לאולפן שהוא רץ בתוכנה (בלי כפתור התקנה).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studioDesktop", {
  isDesktop: true,
  hasStream: true,
  hasBrowserSource: true,
  lanStart: o => ipcRenderer.invoke("lan-start", o),
  lanFrame: b => ipcRenderer.send("lan-frame", b),
  lanStop: () => ipcRenderer.invoke("lan-stop"),
  webStart: o => ipcRenderer.invoke("web-start", o),
  webStop: id => ipcRenderer.invoke("web-stop", id),
  onWebFrame: cb => ipcRenderer.on("web-frame", (_e, id, w, h, buf) => cb(id, w, h, buf)),
  streamEncoders: () => ipcRenderer.invoke("stream-encoders"),
  streamStart: o => ipcRenderer.invoke("stream-start", o),
  streamChunk: b => ipcRenderer.send("stream-chunk", b),
  streamStop: () => ipcRenderer.invoke("stream-stop"),
  onStreamStatus: cb => ipcRenderer.on("stream-status", (_e, s) => cb(s)),
  takeProject: () => ipcRenderer.invoke("take-project"),
  unlock: p => ipcRenderer.invoke("unlock", p),
  setPass: (old, next) => ipcRenderer.invoke("set-pass", { old, next }),
  onUpdate: cb => ipcRenderer.on("upd", (_e, s) => cb(s)),
  updateAction: a => ipcRenderer.send("upd-action", a),
});
