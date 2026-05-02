export class SoundSystem {
  constructor() {
    this._ctx = null;
    const resume = () => {
      if (!this._ctx) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } else if (this._ctx.state === 'suspended') {
        this._ctx.resume();
      }
    };
    document.addEventListener('mousedown', resume, { once: false });
    document.addEventListener('keydown',   resume, { once: false });
  }

  get _c() { return this._ctx; }

  // ── Helpers ────────────────────────────────────────────────────────────

  _noise(duration) {
    const ctx = this._c;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dat[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _osc(type, startFreq, endFreq, duration, gain, startTime) {
    const ctx  = this._c;
    const osc  = ctx.createOscillator();
    const g    = ctx.createGain();
    osc.type   = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.linearRampToValueAtTime(endFreq, startTime + duration);
    g.gain.setValueAtTime(gain, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(startTime); osc.stop(startTime + duration + 0.01);
  }

  _noiseThru(filter, startTime, duration, gainVal, filterFreq, filterType = 'lowpass', Q = 1) {
    const ctx = this._c;
    const src = this._noise(duration);
    const f   = ctx.createBiquadFilter();
    f.type      = filterType;
    f.frequency.value = filterFreq;
    if (Q !== 1) f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(startTime); src.stop(startTime + duration + 0.01);
  }

  // ── Per-class gunshot ─────────────────────────────────────────────────

  playGunshot(weaponType = 'ak47') {
    if (!this._c) return;
    switch (weaponType) {
      case 'smg':    return this._playSmg();
      case 'sniper': return this._playSniper();
      default:       return this._playAk47();
    }
  }

  _playAk47() {
    const ctx = this._c, t = ctx.currentTime;
    // a) Crack tone: square 160→80hz, 90ms
    this._osc('square', 160, 80, 0.09, 0.7, t);
    // b) Body noise: bandpass 400hz Q=1.5, 180ms
    this._noiseThru(null, t, 0.18, 0.5, 400, 'bandpass', 1.5);
    // c) Sub punch: sine 80→30hz, 70ms
    this._osc('sine', 80, 30, 0.07, 0.6, t);
    // d) Reverb tail: lowpass 600hz, 400ms
    this._noiseThru(null, t + 0.05, 0.4, 0.15, 600, 'lowpass');
  }

  _playSmg() {
    const ctx = this._c, t = ctx.currentTime;
    // a) Crack: square 280→140hz, 55ms
    this._osc('square', 280, 140, 0.055, 0.5, t);
    // b) Noise: highpass 500hz, 90ms
    this._noiseThru(null, t, 0.09, 0.4, 500, 'highpass');
  }

  _playSniper() {
    const ctx = this._c, t = ctx.currentTime;
    // a) Initial crack: sawtooth 120→40hz, 40ms
    this._osc('sawtooth', 120, 40, 0.04, 0.9, t);
    // b) Pressure wave: lowpass 200hz, 60ms
    this._noiseThru(null, t, 0.06, 0.8, 200, 'lowpass');
    // c) Echo tail: bandpass 300hz Q=0.5, 1200ms
    this._noiseThru(null, t + 0.04, 1.2, 0.3, 300, 'bandpass', 0.5);
    // d) Sub boom: sine 50→20hz, 100ms
    this._osc('sine', 50, 20, 0.1, 0.7, t);
  }

  // ── Reload sounds ────────────────────────────────────────────────────

  playReload(weaponType = 'ak47') {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    switch (weaponType) {
      case 'smg':
        // Magazine snap: sharp click + plastic thud
        this._noiseThru(null, t, 0.02, 0.4, 800, 'bandpass', 3);
        this._noiseThru(null, t + 0.2, 0.04, 0.25, 200, 'lowpass');
        break;
      case 'sniper':
        // Bolt action: clunk + slide + clunk
        this._noiseThru(null, t,        0.06, 0.5, 150, 'lowpass');
        this._noiseThru(null, t + 0.25, 0.08, 0.3, 300, 'bandpass', 2);
        this._noiseThru(null, t + 0.55, 0.06, 0.5, 150, 'lowpass');
        break;
      default: // ak47
        // Two mechanical clicks 400ms apart
        this._noiseThru(null, t,        0.03, 0.3, 600, 'bandpass', 3);
        this._noiseThru(null, t + 0.4,  0.03, 0.3, 600, 'bandpass', 3);
        break;
    }
  }

  // ── Combat sounds ────────────────────────────────────────────────────

  playHitConfirm() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.05);
  }

  playTakeDamage() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this._noiseThru(null, t, 0.1, 0.5, 200, 'highpass');
    this._osc('sine', 60, 60, 0.08, 0.4, t);
  }

  playKill() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq;
      const g = ctx.createGain();
      const st = t + i * 0.06;
      g.gain.setValueAtTime(0.28, st);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(st); osc.stop(st + 0.1);
    });
  }
}
