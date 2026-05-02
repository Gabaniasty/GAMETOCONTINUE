const CYAN  = 0x00f5ff;
const BODY  = 0x1a1a2e;
const METAL = 0x2a2a3e;
const WOOD  = 0x2a1a0a;

function mat(color, emissive = 0, intensity = 0) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity });
}

function addPart(group, geo, material, x, y, z, rx = 0, ry = 0, rz = 0, edgeColor) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (rx) mesh.rotation.x = rx;
  if (ry) mesh.rotation.y = ry;
  if (rz) mesh.rotation.z = rz;
  group.add(mesh);
  if (edgeColor !== undefined) {
    const el = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.45 })
    );
    el.position.set(x, y, z);
    if (rx) el.rotation.x = rx;
    if (ry) el.rotation.y = ry;
    if (rz) el.rotation.z = rz;
    group.add(el);
  }
  return mesh;
}

export class AWPWeapon {
  constructor(weaponScene, weaponCamera, sound) {
    this._scene  = weaponScene;
    this._cam    = weaponCamera;
    this._sound  = sound;

    this.ammo    = 5;
    this.reserve = 25;
    this._maxMag = 5;

    this.isADS        = false;
    this.isReloading  = false;
    this.holdingBreath = false;
    this._breathTimer  = 0;

    this._lastShotMs   = 0;
    this._MIN_INTERVAL = 1400;

    this._boltAnim    = false;
    this._boltT       = 0;
    this._BOLT_DUR    = 0.52;

    this._reloadT    = 0;
    this._RELOAD_DUR = 3.5;

    this._swayT  = 0;
    this._swayX  = 0;
    this._swayY  = 0;

    this._recoilT = -1;

    this._group    = new THREE.Group();
    this._boltGroup = new THREE.Group();

    this._buildModel();
    this._buildScopeOverlay();
    this._buildAmmoHud();

    this._scene.add(this._group);
  }

  // ── 3-D model ─────────────────────────────────────────────────────────
  _buildModel() {
    const g  = this._group;
    const ec = CYAN;

    // Receiver
    addPart(g, new THREE.BoxGeometry(0.055, 0.07, 0.30),  mat(BODY, ec, 0.15),       0,      0,       0,      0, 0, 0, ec);
    // Barrel
    addPart(g, new THREE.BoxGeometry(0.02, 0.02, 0.50),   mat(METAL, ec, 0.25),      0,      0.016,  -0.38,  0, 0, 0, ec);
    // Muzzle brake
    addPart(g, new THREE.BoxGeometry(0.034, 0.030, 0.05), mat(METAL),                0,      0.016,  -0.63,  0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.006, 0.022, 0.044),mat(METAL),               -0.018,  0.016, -0.63,   0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.006, 0.022, 0.044),mat(METAL),                0.018,  0.016, -0.63,   0, 0, 0, ec);

    // Scope body
    addPart(g, new THREE.BoxGeometry(0.034, 0.034, 0.22),  mat(0x111120),            0,      0.068, -0.05,   0, 0, 0, ec);
    // Scope turrets
    addPart(g, new THREE.BoxGeometry(0.014, 0.028, 0.014), mat(METAL),               0.024,  0.088, -0.02,   0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.014, 0.014, 0.014), mat(METAL),               0,      0.096, -0.08,   0, 0, 0, ec);
    // Scope mount rings
    addPart(g, new THREE.BoxGeometry(0.052, 0.022, 0.024), mat(METAL),               0,      0.05,  -0.13,   0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.052, 0.022, 0.024), mat(METAL),               0,      0.05,   0.05,   0, 0, 0, ec);
    // Scope lenses
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x001133, emissive: 0x003366, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 });
    const lf = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 14), lensMat);
    lf.rotation.x = Math.PI / 2; lf.position.set(0, 0.068, -0.165); g.add(lf);
    const lr = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 14), lensMat.clone());
    lr.rotation.x = Math.PI / 2; lr.position.set(0, 0.068,  0.065); g.add(lr);

    // Handguard with vent cuts
    addPart(g, new THREE.BoxGeometry(0.044, 0.040, 0.22),  mat(WOOD),                0,     -0.01,  -0.22,   0, 0, 0, ec);
    [-0.14, -0.19, -0.24, -0.29].forEach(z => {
      addPart(g, new THREE.BoxGeometry(0.046, 0.007, 0.012), mat(0x080810),           0,     -0.01,   z,      0, 0, 0);
    });

    // Magazine
    addPart(g, new THREE.BoxGeometry(0.036, 0.060, 0.040), mat(BODY, ec, 0.1),       0,     -0.078,  0.02,   0, 0, 0, ec);

    // Trigger guard
    addPart(g, new THREE.BoxGeometry(0.042, 0.008, 0.048), mat(METAL),               0,     -0.042,  0.08,   0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.008, 0.028, 0.008), mat(METAL),              -0.017, -0.032,  0.056,  0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.008, 0.028, 0.008), mat(METAL),               0.017, -0.032,  0.056,  0, 0, 0, ec);

    // Pistol grip
    addPart(g, new THREE.BoxGeometry(0.038, 0.082, 0.046), mat(0x1a0a00),            0,     -0.080,  0.10,   0.18, 0, 0, ec);

    // Stock
    addPart(g, new THREE.BoxGeometry(0.040, 0.050, 0.30),  mat(WOOD),                0,     -0.004,  0.24,   0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.040, 0.070, 0.022), mat(WOOD),                0,     -0.018,  0.38,   0, 0, 0, ec);
    // Cheek rest
    addPart(g, new THREE.BoxGeometry(0.038, 0.028, 0.10),  mat(WOOD),                0,      0.038,  0.19,   0, 0, 0, ec);

    // Bolt handle
    this._boltHandle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.060), mat(METAL));
    this._boltHandle.position.set(0.040, 0.008, 0.07);
    this._boltHandle.rotation.z = -0.5;
    this._boltGroup.add(this._boltHandle);

    this._boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.015, 7, 7), mat(METAL));
    this._boltKnob.position.set(0.064, 0.028, 0.07);
    this._boltGroup.add(this._boltKnob);

    g.add(this._boltGroup);

    // Bipod legs
    addPart(g, new THREE.BoxGeometry(0.008, 0.068, 0.008), mat(METAL),             -0.022, -0.048, -0.32,   0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.008, 0.068, 0.008), mat(METAL),              0.022, -0.048, -0.32,   0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.044, 0.008, 0.008), mat(METAL),              0,     -0.082, -0.32,   0, 0, 0, ec);

    // Neon accent glow strip
    addPart(g, new THREE.BoxGeometry(0.004, 0.004, 0.30),  mat(ec, ec, 1.0),        0.028,  0.0,     0,     0, 0, 0, ec);
    addPart(g, new THREE.BoxGeometry(0.004, 0.004, 0.18),  mat(ec, ec, 0.8),        0.028,  0.066, -0.04,  0, 0, 0, ec);

    // Default hip-fire position
    this._group.position.set(0.2, -0.22, -0.35);
    this._group.rotation.set(0.03, 0, -0.04);
    this._basePos = { x: 0.2, y: -0.22, z: -0.35 };
    this._baseRot = { x: 0.03, y: 0, z: -0.04 };
  }

  // ── Scope canvas overlay ───────────────────────────────────────────────
  _buildScopeOverlay() {
    const el = document.createElement('canvas');
    el.id = 'awp-scope-canvas';
    el.style.cssText = [
      'position:fixed', 'inset:0', 'width:100%', 'height:100%',
      'display:none', 'z-index:510', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
    this._scopeEl  = el;
    this._scopeCtx = el.getContext('2d');
  }

  _buildAmmoHud() {
    // Ammo display built externally in game.html; we just store a ref
    this._ammoEl     = document.getElementById('awp-ammo-current');
    this._reserveEl  = document.getElementById('awp-ammo-reserve');
    this._reloadEl   = document.getElementById('awp-reload-bar');
    this._reloadFill = document.getElementById('awp-reload-fill');
  }

  // ── Scope drawing ─────────────────────────────────────────────────────
  _drawScope() {
    const el  = this._scopeEl;
    const ctx = this._scopeCtx;
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }

    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) * 0.28;

    // Black surround with circular cutout
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Green tint inside circle
    const tintGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    tintGrad.addColorStop(0,   'rgba(0,60,20,0.18)');
    tintGrad.addColorStop(0.7, 'rgba(0,40,10,0.12)');
    tintGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = tintGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Scope ring border
    ctx.save();
    ctx.strokeStyle = 'rgba(80,200,80,0.7)';
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = 'rgba(80,200,80,0.5)';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Edge vignette inside circle
    const vig = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(1,   'rgba(0,0,0,0.55)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = vig;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    // Compute sway offset
    const swayScale = this.holdingBreath ? 0.15 : 1.0;
    const ox = this._swayX * 40 * swayScale;
    const oy = this._swayY * 40 * swayScale;
    const rx = cx + ox, ry = cy + oy;

    // Clip all reticle drawing inside circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const lCol  = 'rgba(60,220,80,0.92)';
    const lColD = 'rgba(60,220,80,0.55)';
    ctx.lineWidth   = 1.4;
    ctx.strokeStyle = lCol;
    ctx.shadowColor = 'rgba(60,220,80,0.6)';
    ctx.shadowBlur  = 4;

    const GAP = 28;

    // Horizontal lines (with center gap)
    ctx.beginPath();
    ctx.moveTo(cx - R, ry); ctx.lineTo(rx - GAP, ry);
    ctx.moveTo(rx + GAP, ry); ctx.lineTo(cx + R, ry);
    ctx.stroke();

    // Vertical lines (with center gap)
    ctx.beginPath();
    ctx.moveTo(rx, cy - R); ctx.lineTo(rx, ry - GAP);
    ctx.moveTo(rx, ry + GAP); ctx.lineTo(rx, cy + R);
    ctx.stroke();

    // Mil dots — horizontal axis
    const milSpacing = R * 0.22;
    ctx.shadowBlur = 6;
    [1, 2, 3].forEach(i => {
      const r = i === 1 ? 3.2 : i === 2 ? 2.4 : 1.8;
      const a = i === 1 ? 0.9 : i === 2 ? 0.7 : 0.5;
      ctx.fillStyle = `rgba(60,220,80,${a})`;
      ctx.beginPath(); ctx.arc(rx + milSpacing * i, ry, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx - milSpacing * i, ry, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx, ry + milSpacing * i, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx, ry - milSpacing * i, r, 0, Math.PI * 2); ctx.fill();
    });

    // Center dot
    ctx.fillStyle = 'rgba(200,255,200,0.95)';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(rx, ry, 2.0, 0, Math.PI * 2); ctx.fill();

    // Stadia lines (short horizontal ticks on vertical bar)
    ctx.strokeStyle = lColD;
    ctx.lineWidth = 1;
    ctx.shadowBlur = 2;
    [1, 2].forEach(i => {
      const y1 = ry + milSpacing * i;
      const y2 = ry - milSpacing * i;
      const hw = milSpacing * 0.25;
      ctx.beginPath();
      ctx.moveTo(rx - hw, y1); ctx.lineTo(rx + hw, y1);
      ctx.moveTo(rx - hw, y2); ctx.lineTo(rx + hw, y2);
      ctx.stroke();
    });

    ctx.restore();
  }

  // ── ADS control ───────────────────────────────────────────────────────
  aimIn() {
    if (this.isReloading) return;
    this.isADS = true;
    this._group.visible = false;
    this._scopeEl.style.display = 'block';
    if (this._sound) this._sound.play('scope_in');
  }

  aimOut() {
    this.isADS = false;
    this._group.visible = true;
    this._scopeEl.style.display = 'none';
    this.holdingBreath = false;
    this._breathTimer  = 0;
    if (this._sound) this._sound.play('scope_out');
  }

  // ── Shoot ─────────────────────────────────────────────────────────────
  shoot(onShoot) {
    if (this.isReloading)  return;
    if (this._boltAnim)    return;
    if (Date.now() - this._lastShotMs < this._MIN_INTERVAL) return;
    if (this.ammo <= 0) { this.reload(); return; }

    this._lastShotMs = Date.now();
    this.ammo--;
    this._recoilT = 0;
    this._boltAnim = true;
    this._boltT    = 0;

    if (this._sound) this._sound.play('awp_fire');
    if (onShoot) onShoot();
    this._updateAmmoHud();

    if (this.ammo <= 0 && this.reserve > 0) {
      setTimeout(() => this.reload(), 650);
    }
  }

  // ── Reload ────────────────────────────────────────────────────────────
  reload() {
    if (this.isReloading)      return;
    if (this.ammo >= this._maxMag) return;
    if (this.reserve <= 0)     return;

    this.isReloading = true;
    this._reloadT    = 0;
    if (this._sound) this._sound.play('awp_reload');
    if (this._reloadEl) this._reloadEl.style.display = 'flex';
    if (this._reloadFill) this._reloadFill.style.width = '0%';

    // Unscope while reloading
    if (this.isADS) this.aimOut();

    setTimeout(() => {
      const needed = this._maxMag - this.ammo;
      const loaded = Math.min(needed, this.reserve);
      this.ammo    += loaded;
      this.reserve -= loaded;
      this.isReloading = false;
      this._reloadT    = 0;
      if (this._reloadEl)  this._reloadEl.style.display  = 'none';
      if (this._reloadFill) this._reloadFill.style.width = '0%';
      this._updateAmmoHud();
    }, this._RELOAD_DUR * 1000);
  }

  getAmmoString() { return `${this.ammo} / ${this.reserve}`; }

  // ── Ammo HUD update ───────────────────────────────────────────────────
  _updateAmmoHud() {
    if (this._ammoEl)    this._ammoEl.textContent    = this.ammo;
    if (this._reserveEl) this._reserveEl.textContent = this.reserve;
  }

  // ── Update (called every frame) ───────────────────────────────────────
  update(delta) {
    this._tickSway(delta);
    this._tickBolt(delta);
    this._tickRecoil(delta);
    this._tickReload(delta);
    this._tickBreath(delta);
    if (this.isADS) this._drawScope();
  }

  // ── Sway ──────────────────────────────────────────────────────────────
  _tickSway(dt) {
    this._swayT += dt;
    const amp = this.holdingBreath ? 0.004 : 0.018;
    this._swayX = Math.sin(this._swayT * 0.6)  * amp + Math.sin(this._swayT * 1.3)  * amp * 0.4;
    this._swayY = Math.sin(this._swayT * 0.45) * amp + Math.sin(this._swayT * 0.95) * amp * 0.35;
  }

  // ── Bolt animation ────────────────────────────────────────────────────
  _tickBolt(dt) {
    if (!this._boltAnim) return;
    this._boltT += dt;
    const t = this._boltT / this._BOLT_DUR;

    if (t < 0.25) {
      // Lift
      const p = t / 0.25;
      this._boltHandle.rotation.z = -0.5 - p * 1.1;
      this._boltKnob.position.x   = 0.064 + p * 0.018;
      this._boltKnob.position.y   = 0.028 + p * 0.022;
    } else if (t < 0.5) {
      // Pull back
      const p = (t - 0.25) / 0.25;
      this._boltHandle.rotation.z = -1.6;
      this._boltGroup.position.z  = p * 0.05;
    } else if (t < 0.75) {
      // Push forward
      const p = (t - 0.5) / 0.25;
      this._boltGroup.position.z  = (1 - p) * 0.05;
    } else if (t < 1.0) {
      // Close
      const p = (t - 0.75) / 0.25;
      this._boltHandle.rotation.z = -1.6 + p * 1.1;
      this._boltKnob.position.x   = 0.064 + (1 - p) * 0.018;
      this._boltKnob.position.y   = 0.028 + (1 - p) * 0.022;
    } else {
      this._boltHandle.rotation.z = -0.5;
      this._boltKnob.position.x   = 0.064;
      this._boltKnob.position.y   = 0.028;
      this._boltGroup.position.z  = 0;
      this._boltAnim = false;
    }
  }

  // ── Recoil ────────────────────────────────────────────────────────────
  _tickRecoil(dt) {
    if (this._recoilT < 0) return;
    this._recoilT += dt;
    const b = this._basePos;
    const r = this._baseRot;
    const t = this._recoilT;

    if (t < 0.04) {
      const p = t / 0.04;
      this._group.position.z = b.z + 0.06 * p;
      this._group.rotation.x = r.x - 0.12 * p;
    } else if (t < 0.14) {
      const p = (t - 0.04) / 0.10;
      this._group.position.z = (b.z + 0.06) - 0.06 * p;
      this._group.rotation.x = (r.x - 0.12) + 0.12 * p;
    } else {
      this._group.position.z = b.z;
      this._group.rotation.x = r.x;
      this._recoilT = -1;
    }
  }

  // ── Reload progress bar ───────────────────────────────────────────────
  _tickReload(dt) {
    if (!this.isReloading) return;
    this._reloadT += dt;
    const pct = Math.min(1, this._reloadT / this._RELOAD_DUR) * 100;
    if (this._reloadFill) this._reloadFill.style.width = pct + '%';
  }

  // ── Breath hold ───────────────────────────────────────────────────────
  _tickBreath(dt) {
    if (!this.holdingBreath) return;
    this._breathTimer -= dt;
    if (this._breathTimer <= 0) {
      this.holdingBreath = false;
      this._breathTimer  = 0;
    }
  }

  startBreath() {
    if (this.holdingBreath) return;
    this.holdingBreath = true;
    this._breathTimer  = 3.0;
  }

  releaseBreath() {
    this.holdingBreath = false;
    this._breathTimer  = 0;
  }

  // ── Expose group for Game.js ──────────────────────────────────────────
  get group() { return this._group; }

  dispose() {
    if (this._scopeEl && this._scopeEl.parentNode) {
      this._scopeEl.parentNode.removeChild(this._scopeEl);
    }
    this._scene.remove(this._group);
  }
}
