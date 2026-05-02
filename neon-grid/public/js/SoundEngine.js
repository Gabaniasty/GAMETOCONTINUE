export class SoundEngine {
  constructor() {
    this._ctx           = null;
    this._initialized   = false;
    this._ambientNodes  = [];
    this._ambientActive = false;

    this._footTimer    = 0;
    this._footInterval = 0;
  }

  // ── Init: must be called on first user gesture ───────────────────────────
  init() {
    if (this._initialized) {
      if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
      return;
    }
    this._ctx         = new (window.AudioContext || window.webkitAudioContext)();
    this._initialized = true;
  }

  get _c() { return this._ctx; }

  // ── Low-level helpers ───────────────────────────────────────────────────

  noise(duration) {
    const ctx = this._c;
    if (!ctx) return null;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dat[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  tone(type, freq0, freq1, dur, gain, startTime) {
    const ctx = this._c;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, startTime);
    if (freq1 !== freq0) osc.frequency.linearRampToValueAtTime(freq1, startTime + dur);
    g.gain.setValueAtTime(gain, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.01);
  }

  _noiseThru(startTime, duration, gainVal, filterFreq, filterType = 'lowpass', Q = 1) {
    const ctx = this._c;
    if (!ctx) return;
    const src = this.noise(duration);
    if (!src) return;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    if (Q !== 1) f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }

  // ── AWP fire ────────────────────────────────────────────────────────────
  play_awp_fire() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    // Massive crack: sawtooth 150→30hz
    this.tone('sawtooth', 150, 30, 0.06, 1.4, t);
    // Pressure wave: lowpass 180hz, 90ms
    this._noiseThru(t, 0.09, 1.2, 180, 'lowpass');
    // Sub boom: sine 65→18hz, 140ms
    this.tone('sine', 65, 18, 0.14, 1.0, t);
    // High crack overtone: square 900→180hz, 28ms
    this.tone('square', 900, 180, 0.028, 0.5, t);
    // Long resonant echo tail: bandpass 270hz Q=0.35, 2000ms
    this._noiseThru(t + 0.06, 2.0, 0.38, 270, 'bandpass', 0.35);
    // Secondary echo at lower level: bandpass 180hz Q=0.25, 1200ms
    this._noiseThru(t + 0.35, 1.2, 0.18, 180, 'bandpass', 0.25);
  }

  // ── AWP bolt-action reload (four-step mechanical sequence) ───────────────
  play_awp_reload() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    // Step 1 — bolt lift: sharp metallic click
    this._noiseThru(t, 0.025, 0.6, 950, 'bandpass', 6);
    this.tone('square', 240, 80, 0.02, 0.35, t);
    // Step 2 — bolt pull back: slide scrape
    this._noiseThru(t + 0.14, 0.09, 0.4, 420, 'bandpass', 2.5);
    this.tone('sawtooth', 180, 80, 0.07, 0.2, t + 0.14);
    // Step 3 — bolt slam forward: heavy metallic thud
    this._noiseThru(t + 0.34, 0.055, 0.7, 130, 'lowpass');
    this.tone('sine', 130, 48, 0.045, 0.55, t + 0.34);
    // Step 4 — lock click
    this._noiseThru(t + 0.44, 0.024, 0.5, 750, 'bandpass', 5);
    this.tone('square', 200, 100, 0.018, 0.3, t + 0.44);
  }

  // ── Scope in: rising whoosh ──────────────────────────────────────────────
  play_scope_in() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this._noiseThru(t, 0.13, 0.3, 1300, 'highpass');
    this.tone('sine', 300, 650, 0.11, 0.13, t);
  }

  // ── Scope out: falling whoosh ────────────────────────────────────────────
  play_scope_out() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this._noiseThru(t, 0.11, 0.24, 950, 'highpass');
    this.tone('sine', 600, 240, 0.10, 0.11, t);
  }

  // ── Body hit confirm: sharp metallic tick ───────────────────────────────
  play_hit_confirm() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this.tone('triangle', 1100, 550, 0.045, 0.32, t);
    this._noiseThru(t, 0.025, 0.2, 3000, 'highpass');
  }

  // ── Headshot confirm: higher-pitch variant ───────────────────────────────
  play_headshot_confirm() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this.tone('triangle', 2200, 1100, 0.045, 0.38, t);
    this._noiseThru(t, 0.02, 0.22, 5000, 'highpass');
    // Extra ping
    this.tone('sine', 3400, 1800, 0.06, 0.2, t);
  }

  // ── Take damage ─────────────────────────────────────────────────────────
  play_take_damage() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this._noiseThru(t, 0.12, 0.55, 220, 'highpass');
    this.tone('sine', 55, 55, 0.09, 0.45, t);
  }

  // ── Kill: satisfying ascending triple tone ───────────────────────────────
  play_kill() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    [440, 554, 659].forEach((freq, i) => {
      const st = t + i * 0.07;
      this.tone('sine', freq, freq, 0.1, 0.3, st);
      this.tone('triangle', freq * 2, freq * 1.5, 0.07, 0.1, st);
    });
  }

  // ── Non-AWP weapon shots (SOLDIER/GHOST) ────────────────────────────────
  playGunshot(weaponType = 'ak47') {
    if (!this._c) return;
    switch (weaponType) {
      case 'smg':    return this._playSmg();
      case 'sniper': return this.play_awp_fire();
      default:       return this._playAk47();
    }
  }

  _playAk47() {
    const ctx = this._c, t = ctx.currentTime;
    this.tone('square', 160, 80, 0.09, 0.7, t);
    this._noiseThru(t, 0.18, 0.5, 400, 'bandpass', 1.5);
    this.tone('sine', 80, 30, 0.07, 0.6, t);
    this._noiseThru(t + 0.05, 0.4, 0.15, 600, 'lowpass');
  }

  _playSmg() {
    const ctx = this._c, t = ctx.currentTime;
    this.tone('square', 280, 140, 0.055, 0.5, t);
    this._noiseThru(t, 0.09, 0.4, 500, 'highpass');
  }

  // ── Backward-compat shim used by AWPWeapon ───────────────────────────────
  play(name) {
    switch (name) {
      case 'awp_fire':   return this.play_awp_fire();
      case 'awp_reload': return this.play_awp_reload();
      case 'scope_in':   return this.play_scope_in();
      case 'scope_out':  return this.play_scope_out();
    }
  }

  // ── Footstep system ─────────────────────────────────────────────────────
  updateFootsteps(delta, isMoving, speed, isSprinting, surfaceType = 'concrete') {
    if (!this._c || !isMoving) {
      this._footTimer = 0;
      return;
    }

    const interval = isSprinting ? 0.30 : 0.52;

    this._footTimer += delta;
    if (this._footTimer >= interval) {
      this._footTimer -= interval;
      this._playFootstep(surfaceType, isSprinting);
    }
  }

  _playFootstep(surface, isSprinting) {
    const ctx = this._c;
    if (!ctx) return;
    const t    = ctx.currentTime;
    const vol  = isSprinting ? 0.28 : 0.18;

    if (surface === 'metal') {
      this._noiseThru(t, 0.035, vol, 500, 'bandpass', 3);
      this.tone('sine', 200, 80, 0.035, vol * 0.5, t);
      this._noiseThru(t + 0.01, 0.06, vol * 0.3, 1200, 'highpass');
    } else if (surface === 'grate') {
      this._noiseThru(t, 0.025, vol * 0.8, 1800, 'highpass');
      this._noiseThru(t, 0.04, vol * 0.6, 600, 'bandpass', 4);
      this.tone('sine', 300, 120, 0.03, vol * 0.3, t);
    } else {
      // concrete (default)
      this._noiseThru(t, 0.05, vol, 180, 'lowpass');
      this.tone('sine', 90, 40, 0.04, vol * 0.6, t);
    }
  }

  // ── Surface detection via downward raycast ───────────────────────────────
  detectSurface(collidableMeshes, playerPos) {
    if (!collidableMeshes || !collidableMeshes.length || typeof THREE === 'undefined') {
      return 'concrete';
    }
    try {
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(playerPos.x, playerPos.y - 0.5, playerPos.z),
        new THREE.Vector3(0, -1, 0),
        0,
        2.5,
      );
      const hits = raycaster.intersectObjects(collidableMeshes, false);
      if (hits.length > 0) {
        const surf = hits[0].object.userData.surface;
        if (surf) return surf;
      }
    } catch (_) { /* raycaster not available yet */ }
    return 'concrete';
  }

  // ── Ambient industrial soundscape ────────────────────────────────────────
  startAmbient() {
    if (!this._c || this._ambientActive) return;
    this._ambientActive = true;
    this._startHum();
    this._scheduleNoiseBurst();
  }

  _startHum() {
    const ctx = this._c;
    if (!ctx) return;

    // Low industrial hum: two detuned oscillators
    const freqs = [48, 50.4];
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      g.gain.value = 0.04;
      osc.connect(g);

      // Gentle LP filter so it's a rumble, not a buzz
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 120;
      g.connect(filt);
      filt.connect(ctx.destination);

      osc.start();
      this._ambientNodes.push(osc);
    });

    // Electrical hiss: very quiet high-pass noise (loops via short scheduled chunks)
    this._scheduleHiss();
  }

  _scheduleHiss() {
    if (!this._ambientActive || !this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this._noiseThru(t, 3.0, 0.018, 4000, 'highpass');
    setTimeout(() => this._scheduleHiss(), 2800);
  }

  _scheduleNoiseBurst() {
    if (!this._ambientActive || !this._c) return;
    const delay = 4000 + Math.random() * 8000;
    setTimeout(() => {
      if (!this._ambientActive || !this._c) return;
      this._playDistantBurst();
      this._scheduleNoiseBurst();
    }, delay);
  }

  _playDistantBurst() {
    const ctx = this._c;
    if (!ctx) return;
    const t = ctx.currentTime;
    // Distant city noise: filtered noise burst at random pitch
    const freq = 100 + Math.random() * 200;
    this._noiseThru(t, 0.4 + Math.random() * 0.8, 0.06 + Math.random() * 0.04, freq, 'bandpass', 0.3);
    this.tone('sine', freq * 0.5, freq * 0.3, 0.3, 0.04, t);
  }

  stopAmbient() {
    this._ambientActive = false;
    this._ambientNodes.forEach((n) => { try { n.stop(); } catch (_) {} });
    this._ambientNodes = [];
  }

  // ── Announcement tone + HUD event ────────────────────────────────────────
  playAnnouncement(type) {
    this._playAnnouncementTone(type);
    window.dispatchEvent(new CustomEvent('announcement', { detail: { type } }));
  }

  _playAnnouncementTone(type) {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;

    switch (type) {
      case 'first_blood': {
        // Ominous descending: low and impactful
        this._noiseThru(t, 0.08, 0.5, 140, 'lowpass');
        [220, 174, 146].forEach((f, i) => this.tone('sine', f, f * 0.8, 0.18, 0.35, t + i * 0.14));
        break;
      }
      case 'double_kill': {
        // Two bright ascending notes
        [[440, 550], [550, 660]].forEach(([f0, f1], i) => {
          this.tone('triangle', f0, f1, 0.12, 0.32, t + i * 0.12);
        });
        break;
      }
      case 'triple_kill': {
        // Three rapid ascending tones + sparkle
        [[440, 550], [550, 660], [660, 880]].forEach(([f0, f1], i) => {
          this.tone('triangle', f0, f1, 0.12, 0.36, t + i * 0.10);
          this.tone('sine', f0 * 2, f1 * 2, 0.08, 0.15, t + i * 0.10);
        });
        break;
      }
      case 'killing_spree': {
        // Energetic ascending sequence
        [330, 440, 550, 660, 880].forEach((f, i) => {
          this.tone('sawtooth', f, f * 1.1, 0.09, 0.28, t + i * 0.08);
          this.tone('sine', f, f, 0.12, 0.18, t + i * 0.08);
        });
        break;
      }
      case 'match_start': {
        // Bright rising fanfare
        [261, 329, 392, 523].forEach((f, i) => {
          this.tone('sine', f, f, 0.18, 0.38, t + i * 0.13);
          this.tone('triangle', f, f * 1.05, 0.15, 0.15, t + i * 0.13);
        });
        break;
      }
      case 'match_end': {
        // Descending resolution
        [523, 440, 349, 261].forEach((f, i) => {
          this.tone('sine', f, f * 0.95, 0.22, 0.38, t + i * 0.16);
        });
        this._noiseThru(t + 0.5, 0.4, 0.06, 300, 'lowpass');
        break;
      }
      default:
        this.tone('sine', 440, 880, 0.15, 0.3, t);
    }
  }
}
