/* אולפן הקלטות: קליטת המיקרופון בתוך מנוע השמע, עם מספר הדגימה המדויק - כך ההקלטה מסונכרנת למנגינה. */
class MzRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = true;
    this.reset();
    this.port.onmessage = (e) => {
      if (e.data === "stop") {
        this.flush();
        this.on = false;
        this.port.postMessage({ done: true });
      }
    };
  }

  reset() { this.l = []; this.r = []; this.n = 0; this.f0 = -1; }

  flush() {
    if (!this.n) return;
    const join = (parts) => {
      const out = new Float32Array(this.n);
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    };
    this.port.postMessage({ f: this.f0, l: join(this.l), r: this.r.length ? join(this.r) : null });
    this.reset();
  }

  process(inputs) {
    const inp = inputs[0];
    if (this.on && inp && inp.length) {
      if (this.f0 < 0) this.f0 = currentFrame;
      this.l.push(inp[0].slice(0));
      if (inp[1]) this.r.push(inp[1].slice(0));
      this.n += inp[0].length;
      if (this.n >= 8192) this.flush();
    }
    return this.on;
  }
}
registerProcessor("mz-rec", MzRecorder);
