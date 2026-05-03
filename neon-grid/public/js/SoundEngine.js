export class SoundEngine {
  constructor() {
    this._ctx           = null;
    this._initialized   = false;
    this._ambientNodes  = [];
    this._ambientActive = false;

    this._footTimer    = 0;
    this._footInterval = 0;

    // Per-category GainNodes (created in init())
    this._masterGain    = null;
    this._weaponGain    = null;
    this._footstepGain  = null;
    this._ambientGain   = null;

    // Volume state (0–1) persisted via localStorage
    this._volumes = {
      master:    parseFloat(localStorage.getItem('ng_vol_master')    ?? '1'),
      weapons:   parseFloat(localStorage.getItem('ng_vol_weapons')   ?? '1'),
      footsteps: parseFloat(localStorage.getItem('ng_vol_footsteps') ?? '1'),
      ambient:   parseFloat(localStorage.getItem('ng_vol_ambient')   ?? '1'),
    };
    this._muted = localStorage.getItem('ng_vol_muted') === 'true';
  }

  // ── Init: must be called on first user gesture ───────────────────────────
  init() {
    if (this._initialized) {
      if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
      return;
    }
    this._ctx         = new (window.AudioContext || window.webkitAudioContext)();
    this._initialized = true;

    // Build gain graph: category → master → destination
    const ctx = this._ctx;

    this._masterGain   = ctx.createGain();
    this._weaponGain   = ctx.createGain();
    this._footstepGain = ctx.createGain();
    this._ambientGain  = ctx.createGain();

    this._weaponGain.connect(this._masterGain);
    this._footstepGain.connect(this._masterGain);
    this._ambientGain.connect(this._masterGain);
    this._masterGain.connect(ctx.destination);

    // Apply persisted volumes
    this._masterGain.gain.value    = this._muted ? 0 : this._volumes.master;
    this._weaponGain.gain.value    = this._volumes.weapons;
    this._footstepGain.gain.value  = this._volumes.footsteps;
    this._ambientGain.gain.value   = this._volumes.ambient;
  }

  get _c() { return this._ctx; }

  // ── Category destination helpers ─────────────────────────────────────────
  _wd() { return this._weaponGain   || (this._ctx && this._ctx.destination) || null; }
  _fd() { return this._footstepGain || (this._ctx && this._ctx.destination) || null; }
  _ad() { return this._ambientGain  || (this._ctx && this._ctx.destination) || null; }
  _md() { return this._masterGain   || (this._ctx && this._ctx.destination) || null; }

  // ── Volume control API ───────────────────────────────────────────────────
  /**
   * Set volume for a category.
   * @param {'master'|'weapons'|'footsteps'|'ambient'} category
   * @param {number} value  0–1
   */
  setVolume(category, value) {
    const v = Math.max(0, Math.min(1, value));
    this._volumes[category] = v;
    localStorage.setItem(`ng_vol_${category}`, String(v));

    if (!this._initialized) return;

    switch (category) {
      case 'master':
        if (this._masterGain)
          this._masterGain.gain.value = this._muted ? 0 : v;
        break;
      case 'weapons':
        if (this._weaponGain)   this._weaponGain.gain.value   = v;
        break;
      case 'footsteps':
        if (this._footstepGain) this._footstepGain.gain.value = v;
        break;
      case 'ambient':
        if (this._ambientGain)  this._ambientGain.gain.value  = v;
        break;
    }
  }

  /**
   * Mute or unmute all audio via master GainNode.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = muted;
    localStorage.setItem('ng_vol_muted', String(muted));
    if (this._masterGain) {
      this._masterGain.gain.value = muted ? 0 : this._volumes.master;
    }
  }

  /** Returns current volume map (read-only copy). */
  getVolumes() {
    return { ...this._volumes, muted: this._muted };
  }

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

  tone(type, freq0, freq1, dur, gain, startTime, dest) {
    const ctx = this._c;
    if (!ctx) return;
    const dst = dest || this._md() || ctx.destination;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, startTime);
    if (freq1 !== freq0) osc.frequency.linearRampToValueAtTime(freq1, startTime + dur);
    g.gain.setValueAtTime(gain, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.connect(g);
    g.connect(dst);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.01);
  }

  _noiseThru(startTime, duration, gainVal, filterFreq, filterType = 'lowpass', Q = 1, dest) {
    const ctx = this._c;
    if (!ctx) return;
    const dst = dest || this._md() || ctx.destination;
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
    g.connect(dst);
    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }

  // ── AWP fire ────────────────────────────────────────────────────────────
  play_awp_fire() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this.tone('sawtooth', 150, 30, 0.06, 1.4, t, w);
    this._noiseThru(t, 0.09, 1.2, 180, 'lowpass', 1, w);
    this.tone('sine', 65, 18, 0.14, 1.0, t, w);
    this.tone('square', 900, 180, 0.028, 0.5, t, w);
    this._noiseThru(t + 0.06, 2.0, 0.38, 270, 'bandpass', 0.35, w);
    this._noiseThru(t + 0.35, 1.2, 0.18, 180, 'bandpass', 0.25, w);
  }

  // ── AWP bolt-action reload (four-step mechanical sequence) ───────────────
  play_awp_reload() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this._noiseThru(t, 0.025, 0.6, 950, 'bandpass', 6, w);
    this.tone('square', 240, 80, 0.02, 0.35, t, w);
    this._noiseThru(t + 0.14, 0.09, 0.4, 420, 'bandpass', 2.5, w);
    this.tone('sawtooth', 180, 80, 0.07, 0.2, t + 0.14, w);
    this._noiseThru(t + 0.34, 0.055, 0.7, 130, 'lowpass', 1, w);
    this.tone('sine', 130, 48, 0.045, 0.55, t + 0.34, w);
    this._noiseThru(t + 0.44, 0.024, 0.5, 750, 'bandpass', 5, w);
    this.tone('square', 200, 100, 0.018, 0.3, t + 0.44, w);
  }

  // ── Scope in: rising whoosh ──────────────────────────────────────────────
  play_scope_in() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this._noiseThru(t, 0.13, 0.3, 1300, 'highpass', 1, w);
    this.tone('sine', 300, 650, 0.11, 0.13, t, w);
  }

  // ── Scope out: falling whoosh ────────────────────────────────────────────
  play_scope_out() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this._noiseThru(t, 0.11, 0.24, 950, 'highpass', 1, w);
    this.tone('sine', 600, 240, 0.10, 0.11, t, w);
  }

  // ── Body hit confirm: sharp metallic tick ───────────────────────────────
  play_hit_confirm() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this.tone('triangle', 1100, 550, 0.045, 0.32, t, w);
    this._noiseThru(t, 0.025, 0.2, 3000, 'highpass', 1, w);
  }

  // ── Headshot confirm: higher-pitch variant ───────────────────────────────
  play_headshot_confirm() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this.tone('triangle', 2200, 1100, 0.045, 0.38, t, w);
    this._noiseThru(t, 0.02, 0.22, 5000, 'highpass', 1, w);
    this.tone('sine', 3400, 1800, 0.06, 0.2, t, w);
  }

  // ── Take damage ─────────────────────────────────────────────────────────
  play_take_damage() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this._noiseThru(t, 0.12, 0.55, 220, 'highpass', 1, w);
    this.tone('sine', 55, 55, 0.09, 0.45, t, w);
  }

  // ── Kill: satisfying ascending triple tone ───────────────────────────────
  play_kill() {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    [440, 554, 659].forEach((freq, i) => {
      const st = t + i * 0.07;
      this.tone('sine', freq, freq, 0.1, 0.3, st, w);
      this.tone('triangle', freq * 2, freq * 1.5, 0.07, 0.1, st, w);
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
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this.tone('square', 160, 80, 0.09, 0.7, t, w);
    this._noiseThru(t, 0.18, 0.5, 400, 'bandpass', 1.5, w);
    this.tone('sine', 80, 30, 0.07, 0.6, t, w);
    this._noiseThru(t + 0.05, 0.4, 0.15, 600, 'lowpass', 1, w);
  }

  _playSmg() {
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    this.tone('square', 280, 140, 0.055, 0.5, t, w);
    this._noiseThru(t, 0.09, 0.4, 500, 'highpass', 1, w);
  }

  // ── Remote player fire (distance-attenuated) ────────────────────────────
  /**
   * Play a muffled, quieter gunshot for a remote player.
   * @param {number} distance  World-unit distance from local player to shooter.
   */
  play_remote_fire(distance) {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime, w = this._wd();
    // Full volume ≤ 4 units away; silent ≥ 80 units away
    const atten = Math.max(0, 1 - distance / 80);
    if (atten < 0.01) return;
    this.tone('sawtooth', 120, 25, 0.07, 0.9 * atten, t, w);
    this._noiseThru(t, 0.10, 0.75 * atten, 140, 'lowpass', 1, w);
    this.tone('sine', 50, 15, 0.16, 0.65 * atten, t, w);
    this._noiseThru(t + 0.07, 1.8, 0.24 * atten, 220, 'bandpass', 0.3, w);
  }

  // ── Remote player footstep (distance-attenuated) ─────────────────────────
  /**
   * Play a muffled footstep for a remote player.
   * @param {number} distance   World-unit distance from local player.
   * @param {string} [surface]  'concrete' | 'metal' | 'grate'
   */
  play_remote_footstep(distance, surface = 'concrete') {
    if (!this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    // Full volume ≤ 2 units; silent ≥ 30 units
    const atten = Math.max(0, 1 - distance / 30);
    if (atten < 0.05) return;
    const vol = 0.14 * atten;
    const f   = this._fd();
    if (surface === 'metal') {
      this._noiseThru(t, 0.03, vol, 500, 'bandpass', 3, f);
      this.tone('sine', 180, 70, 0.03, vol * 0.5, t, f);
      this._noiseThru(t + 0.01, 0.05, vol * 0.25, 1100, 'highpass', 1, f);
    } else if (surface === 'grate') {
      this._noiseThru(t, 0.025, vol * 0.8, 1800, 'highpass', 1, f);
      this._noiseThru(t, 0.04, vol * 0.6, 600, 'bandpass', 4, f);
    } else {
      this._noiseThru(t, 0.045, vol, 150, 'lowpass', 1, f);
      this.tone('sine', 75, 32, 0.035, vol * 0.5, t, f);
    }
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
    const f    = this._fd();

    if (surface === 'metal') {
      this._noiseThru(t, 0.035, vol, 500, 'bandpass', 3, f);
      this.tone('sine', 200, 80, 0.035, vol * 0.5, t, f);
      this._noiseThru(t + 0.01, 0.06, vol * 0.3, 1200, 'highpass', 1, f);
    } else if (surface === 'grate') {
      this._noiseThru(t, 0.025, vol * 0.8, 1800, 'highpass', 1, f);
      this._noiseThru(t, 0.04, vol * 0.6, 600, 'bandpass', 4, f);
      this.tone('sine', 300, 120, 0.03, vol * 0.3, t, f);
    } else {
      this._noiseThru(t, 0.05, vol, 180, 'lowpass', 1, f);
      this.tone('sine', 90, 40, 0.04, vol * 0.6, t, f);
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

    const a = this._ad();
    const freqs = [48, 50.4];
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      g.gain.value = 0.04;
      osc.connect(g);

      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 120;
      g.connect(filt);
      filt.connect(a);

      osc.start();
      this._ambientNodes.push(osc);
    });

    this._scheduleHiss();
  }

  _scheduleHiss() {
    if (!this._ambientActive || !this._c) return;
    const ctx = this._c, t = ctx.currentTime;
    this._noiseThru(t, 3.0, 0.018, 4000, 'highpass', 1, this._ad());
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
    const a = this._ad();
    const freq = 100 + Math.random() * 200;
    this._noiseThru(t, 0.4 + Math.random() * 0.8, 0.06 + Math.random() * 0.04, freq, 'bandpass', 0.3, a);
    this.tone('sine', freq * 0.5, freq * 0.3, 0.3, 0.04, t, a);
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
    const m = this._md();

    switch (type) {
      case 'first_blood': {
        this._noiseThru(t, 0.08, 0.5, 140, 'lowpass', 1, m);
        [220, 174, 146].forEach((f, i) => this.tone('sine', f, f * 0.8, 0.18, 0.35, t + i * 0.14, m));
        break;
      }
      case 'double_kill': {
        [[440, 550], [550, 660]].forEach(([f0, f1], i) => {
          this.tone('triangle', f0, f1, 0.12, 0.32, t + i * 0.12, m);
        });
        break;
      }
      case 'triple_kill': {
        [[440, 550], [550, 660], [660, 880]].forEach(([f0, f1], i) => {
          this.tone('triangle', f0, f1, 0.12, 0.36, t + i * 0.10, m);
          this.tone('sine', f0 * 2, f1 * 2, 0.08, 0.15, t + i * 0.10, m);
        });
        break;
      }
      case 'killing_spree': {
        [330, 440, 550, 660, 880].forEach((f, i) => {
          this.tone('sawtooth', f, f * 1.1, 0.09, 0.28, t + i * 0.08, m);
          this.tone('sine', f, f, 0.12, 0.18, t + i * 0.08, m);
        });
        break;
      }
      case 'match_start': {
        [261, 329, 392, 523].forEach((f, i) => {
          this.tone('sine', f, f, 0.18, 0.38, t + i * 0.13, m);
          this.tone('triangle', f, f * 1.05, 0.15, 0.15, t + i * 0.13, m);
        });
        break;
      }
      case 'match_end': {
        [523, 440, 349, 261].forEach((f, i) => {
          this.tone('sine', f, f * 0.95, 0.22, 0.38, t + i * 0.16, m);
        });
        this._noiseThru(t + 0.5, 0.4, 0.06, 300, 'lowpass', 1, m);
        break;
      }
      default:
        this.tone('sine', 440, 880, 0.15, 0.3, t, m);
    }
  }
}
