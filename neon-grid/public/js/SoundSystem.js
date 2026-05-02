export class SoundSystem {
  constructor() {
    this._ctx = null;
    // Lazily create AudioContext on first user gesture (autoplay policy)
    const resume = () => {
      if (!this._ctx) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } else {
        this._ctx.resume();
      }
    };
    document.addEventListener('mousedown', resume);
    document.addEventListener('keydown',   resume);
  }

  get _c() { return this._ctx; }

  playGunshot() {
    if (!this._c) return;
    const ctx = this._c;
    const now = ctx.currentTime;

    // a) Tone crack – square 180 Hz
    const osc1 = ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.value = 180;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.6, now + 0.001);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc1.connect(g1); g1.connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 0.08);

    // b) Noise body – lowpass 800 Hz
    const bufLen = Math.floor(ctx.sampleRate * 0.15);
    const nBuf   = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const nData  = nBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nData[i] = Math.random() * 2 - 1;
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 800;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.4, now);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    nSrc.connect(lpf); lpf.connect(g2); g2.connect(ctx.destination);
    nSrc.start(now); nSrc.stop(now + 0.15);

    // c) Sub thump – sine sweep 90 → 30 Hz
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(90, now);
    osc3.frequency.linearRampToValueAtTime(30, now + 0.08);
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.5, now);
    g3.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc3.connect(g3); g3.connect(ctx.destination);
    osc3.start(now); osc3.stop(now + 0.08);
  }

  playHitConfirm() {
    if (!this._c) return;
    const ctx = this._c;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.04);
  }

  playTakeDamage() {
    if (!this._c) return;
    const ctx = this._c;
    const now = ctx.currentTime;

    // Highpass noise thud
    const bufLen = Math.floor(ctx.sampleRate * 0.1);
    const nBuf   = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const nData  = nBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nData[i] = Math.random() * 2 - 1;
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 200;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.5, now);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    nSrc.connect(hpf); hpf.connect(g1); g1.connect(ctx.destination);
    nSrc.start(now); nSrc.stop(now + 0.1);

    // Low sine punch
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 60;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.4, now);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g2); g2.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.08);
  }

  playKill() {
    if (!this._c) return;
    const ctx = this._c;
    const now = ctx.currentTime;
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq;
      const g = ctx.createGain();
      const t = now + i * 0.06;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.08);
    });
  }
}
