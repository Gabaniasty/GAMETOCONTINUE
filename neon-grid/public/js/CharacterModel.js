import { buildWeapon } from './WeaponBuilder.js';

// ── Build a fully-animated procedural humanoid for remote players ──────────────
// Model faces -Z at rotation.y=0 (same convention as the FPS camera).
// Visor is on the -Z face of the head so enemies face you correctly.
export function buildCharacterModel(classColor, playerClass, username, level) {
  const group = new THREE.Group();
  const ec = classColor;

  // ── Material factories ─────────────────────────────────────────────────────
  const mkSuit  = () => new THREE.MeshStandardMaterial({ color: 0x0d0d22, emissive: ec, emissiveIntensity: 0.12, roughness: 0.7, metalness: 0.3 });
  const mkArmor = () => new THREE.MeshStandardMaterial({ color: 0x0a0a1a, emissive: ec, emissiveIntensity: 0.48, roughness: 0.4, metalness: 0.6 });
  const mkGlow  = () => new THREE.MeshBasicMaterial({ color: ec });
  const mkVisor = () => new THREE.MeshStandardMaterial({ color: ec, emissive: ec, emissiveIntensity: 0.85, transparent: true, opacity: 0.88 });
  const mkDark  = () => new THREE.MeshStandardMaterial({ color: 0x080812, roughness: 0.9 });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function box(w, h, d, mat, parent, px = 0, py = 0, pz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    m.position.set(px, py, pz);
    parent.add(m);
    return m;
  }

  function grp(parent, px = 0, py = 0, pz = 0) {
    const g = new THREE.Group();
    g.position.set(px, py, pz);
    parent.add(g);
    return g;
  }

  // ── Body group — child of root, rotated for sprint lean ───────────────────
  const bodyGroup = grp(group);

  // ── Torso ──────────────────────────────────────────────────────────────────
  box(0.68, 0.60, 0.34, mkSuit(),  bodyGroup, 0, 0.90, 0);
  // Chest armour plate (front face = -Z side)
  box(0.48, 0.38, 0.06, mkArmor(), bodyGroup, 0, 0.96, -0.20);
  // Shoulder pads
  box(0.14, 0.10, 0.20, mkArmor(), bodyGroup, -0.44, 1.20, 0);
  box(0.14, 0.10, 0.20, mkArmor(), bodyGroup,  0.44, 1.20, 0);
  // Belt
  box(0.70, 0.12, 0.36, mkArmor(), bodyGroup, 0, 0.61, 0);
  // Neck
  box(0.18, 0.16, 0.18, mkSuit(),  bodyGroup, 0, 1.27, 0);
  // Chest neon strip
  box(0.40, 0.022, 0.022, mkGlow(), bodyGroup, 0, 0.92, -0.24);

  // ── Head group (local origin = head centre) ────────────────────────────────
  const headGrp = grp(bodyGroup, 0, 1.52, 0);
  // Helmet shell
  box(0.52, 0.50, 0.52, mkSuit(), headGrp);
  // Helmet top ridge
  box(0.36, 0.09, 0.46, mkArmor(), headGrp, 0, 0.30, 0);
  // Visor — placed on the -Z face so the character faces -Z
  box(0.36, 0.17, 0.03, mkVisor(), headGrp, 0, 0.04, -0.28);
  // Visor glow line
  box(0.30, 0.028, 0.022, mkGlow(), headGrp, 0, 0.04, -0.30);
  // Cheek guards
  box(0.04, 0.28, 0.18, mkArmor(), headGrp, -0.29, 0, -0.14);
  box(0.04, 0.28, 0.18, mkArmor(), headGrp,  0.29, 0, -0.14);

  // ── Left arm (shoulder pivot for animation) ────────────────────────────────
  const lShoulder = grp(bodyGroup, -0.43, 1.22, 0);
  box(0.19, 0.30, 0.19, mkSuit(), lShoulder, 0, -0.15, 0);
  const lElbow = grp(lShoulder, 0, -0.31, 0);
  box(0.16, 0.27, 0.16, mkSuit(), lElbow, 0, -0.135, 0);
  box(0.13, 0.11, 0.10, mkDark(), lElbow, 0, -0.27, -0.02);
  // Arm neon strip
  box(0.022, 0.24, 0.022, mkGlow(), lShoulder, 0, -0.10, -0.10);

  // ── Right arm (weapon arm) ─────────────────────────────────────────────────
  const rShoulder = grp(bodyGroup, 0.43, 1.22, 0);
  box(0.19, 0.30, 0.19, mkSuit(), rShoulder, 0, -0.15, 0);
  const rElbow = grp(rShoulder, 0, -0.31, 0);
  box(0.16, 0.27, 0.16, mkSuit(), rElbow, 0, -0.135, 0);
  box(0.13, 0.11, 0.10, mkDark(), rElbow, 0, -0.27, -0.02);
  // Arm neon strip
  box(0.022, 0.24, 0.022, mkGlow(), rShoulder, 0, -0.10, -0.10);

  // Weapon anchor at hand position
  const weaponAnchor = grp(rElbow, 0, -0.27, 0);
  const weapon = buildWeapon(playerClass || 'SOLDIER');
  weapon.scale.setScalar(0.62);
  // Shift weapon so grip (~z+0.07, y-0.075) aligns with anchor
  weapon.position.set(0, 0.07, -0.07);
  weaponAnchor.add(weapon);

  // Muzzle reference point used for remote muzzle-flash position
  const muzzleRef = new THREE.Object3D();
  muzzleRef.position.set(0, 0.07, -0.55); // approximately at barrel tip in weapon space
  weaponAnchor.add(muzzleRef);

  // ── Hips (direct child of root — stays level when body leans) ─────────────
  box(0.62, 0.22, 0.34, mkSuit(), group, 0, 0.60, 0);

  // ── Left leg ───────────────────────────────────────────────────────────────
  const lHip  = grp(group, -0.18, 0.62, 0);
  box(0.24, 0.35, 0.24, mkSuit(),  lHip,  0, -0.175, 0);   // upper leg
  box(0.23, 0.10, 0.06, mkArmor(), lHip,  0, -0.35, -0.13); // knee armour
  const lKnee = grp(lHip, 0, -0.35, 0);
  box(0.20, 0.17, 0.20, mkSuit(), lKnee, 0, -0.085, 0);    // lower leg
  box(0.20, 0.10, 0.32, mkDark(), lKnee, 0, -0.215, -0.06); // foot
  // Leg neon strip
  box(0.022, 0.30, 0.022, mkGlow(), lHip, 0, -0.14, -0.13);

  // ── Right leg ──────────────────────────────────────────────────────────────
  const rHip  = grp(group,  0.18, 0.62, 0);
  box(0.24, 0.35, 0.24, mkSuit(),  rHip,  0, -0.175, 0);
  box(0.23, 0.10, 0.06, mkArmor(), rHip,  0, -0.35, -0.13);
  const rKnee = grp(rHip, 0, -0.35, 0);
  box(0.20, 0.17, 0.20, mkSuit(), rKnee, 0, -0.085, 0);
  box(0.20, 0.10, 0.32, mkDark(), rKnee, 0, -0.215, -0.06);
  // Leg neon strip
  box(0.022, 0.30, 0.022, mkGlow(), rHip, 0, -0.14, -0.13);

  // ── Name sprite & HP bar ───────────────────────────────────────────────────
  const nameSprite = _makeNameSprite(username || '???', ec, level || 1);
  group.add(nameSprite);

  const hpBar = _makeHpBar(ec);
  group.add(hpBar.bg);
  group.add(hpBar.fill);

  // ── Animation state ────────────────────────────────────────────────────────
  const anim = {
    walkPhase:  0,
    shootTimer: 0,
    breathPhase: 0,
    sprintLean:  0,
  };

  // ── Public API ─────────────────────────────────────────────────────────────
  group.neon_dying      = false;
  group.neon_deathTimer = 0;
  group._muzzleRef      = muzzleRef;

  group.neon_setHp = (hp, maxHp) => hpBar.update(hp, maxHp);

  group.neon_playDeath = () => {
    group.neon_dying      = true;
    group.neon_deathTimer = 0;
  };

  group.neon_updateDeath = (dt) => {
    if (!group.neon_dying) return false;
    group.neon_deathTimer += dt;
    const t = group.neon_deathTimer;
    group.rotation.z = Math.min(1, t / 0.4) * Math.PI * 0.5;
    if (t > 0.4) {
      const fade = Math.max(0, 1 - (t - 0.4) / 0.6);
      group.traverse((c) => {
        if (c.material) { c.material.transparent = true; c.material.opacity = fade; }
      });
    }
    return t >= 1.0;
  };

  // Called every frame with current network state
  group.neon_animate = (dt, velocity, isShooting, isSprinting) => {
    const vel   = velocity || { x: 0, y: 0, z: 0 };
    const hspd  = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const moving   = hspd > 0.5;
    const running  = hspd > 5.5;
    const sprinting = isSprinting || hspd > 6.8;

    // Walk phase
    const phaseSpd = sprinting ? 14 : running ? 11 : 8;
    if (moving) {
      anim.walkPhase += dt * phaseSpd;
    } else {
      const nearest = Math.round(anim.walkPhase / Math.PI) * Math.PI;
      anim.walkPhase += (nearest - anim.walkPhase) * Math.min(1, dt * 8);
    }

    anim.breathPhase += dt * 1.1;
    if (isShooting) anim.shootTimer = 0.30;
    else if (anim.shootTimer > 0) anim.shootTimer = Math.max(0, anim.shootTimer - dt);

    const leanTarget = sprinting ? 0.20 : 0;
    anim.sprintLean += (leanTarget - anim.sprintLean) * Math.min(1, dt * 9);

    // ── Legs ────────────────────────────────────────────────────────────────
    const legAmp  = sprinting ? 0.62 : running ? 0.46 : moving ? 0.34 : 0;
    const kneeAmp = sprinting ? 0.52 : running ? 0.40 : moving ? 0.27 : 0;

    lHip.rotation.x  =  Math.sin(anim.walkPhase) * legAmp;
    rHip.rotation.x  = -Math.sin(anim.walkPhase) * legAmp;
    lKnee.rotation.x = Math.max(0, -Math.sin(anim.walkPhase - 0.25)) * kneeAmp;
    rKnee.rotation.x = Math.max(0,  Math.sin(anim.walkPhase - 0.25)) * kneeAmp;

    // ── Arms ─────────────────────────────────────────────────────────────────
    if (anim.shootTimer > 0) {
      // Weapon raised — both arms forward
      const kick = Math.sin((1 - anim.shootTimer / 0.30) * Math.PI) * 0.20;
      rShoulder.rotation.x = -0.78 - kick;
      lShoulder.rotation.x = -0.58;
      rElbow.rotation.x    =  0.38;
      lElbow.rotation.x    =  0.48;
      rShoulder.rotation.z =  0;
    } else if (sprinting) {
      // Sprint: weapon tucked down/side, arms pump
      const swAmp = 0.55;
      lShoulder.rotation.x = -Math.sin(anim.walkPhase) * swAmp;
      rShoulder.rotation.x =  Math.sin(anim.walkPhase) * swAmp;
      rShoulder.rotation.z = -0.32;  // weapon side-tucked
      rElbow.rotation.x    =  0.58;
      lElbow.rotation.x    =  0.28;
    } else {
      // Walk/idle weapon-ready pose
      const armAmp = moving ? 0.24 : 0;
      lShoulder.rotation.x = -Math.sin(anim.walkPhase) * armAmp - 0.10;
      rShoulder.rotation.x =  Math.sin(anim.walkPhase) * armAmp - 0.55;
      rShoulder.rotation.z =  0;
      rElbow.rotation.x    =  0.42;
      lElbow.rotation.x    =  0.22;
    }

    // ── Body lean (sprint) ───────────────────────────────────────────────────
    bodyGroup.rotation.x = anim.sprintLean;

    // ── Idle breathing ───────────────────────────────────────────────────────
    bodyGroup.position.y = moving ? 0 : Math.sin(anim.breathPhase) * 0.007;
  };

  return group;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeNameSprite(username, classColor, level) {
  const c   = document.createElement('canvas');
  c.width   = 256; c.height = 64;
  const ctx = c.getContext('2d');
  const hex = '#' + classColor.toString(16).padStart(6, '0');

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = hex;
  ctx.fillRect(6, 18, 26, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), 19, 31);

  ctx.font = 'bold 23px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = hex;
  ctx.shadowColor = hex;
  ctx.shadowBlur  = 8;
  ctx.fillText(username.slice(0, 14), 40, 32);

  const tex    = new THREE.CanvasTexture(c);
  const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = 2.1;
  return sprite;
}

function _makeHpBar(classColor) {
  const W = 128, H = 12;
  const hex = '#' + classColor.toString(16).padStart(6, '0');

  const bgC   = document.createElement('canvas');
  bgC.width   = W; bgC.height = H;
  const bgCtx = bgC.getContext('2d');
  bgCtx.fillStyle = 'rgba(0,0,0,0.7)';
  bgCtx.fillRect(0, 0, W, H);
  const bgTex = new THREE.CanvasTexture(bgC);
  const bg    = new THREE.Sprite(new THREE.SpriteMaterial({ map: bgTex, transparent: true, depthTest: false }));
  bg.scale.set(1.0, 0.08, 1);
  bg.position.y = 2.4;
  bg.visible    = false;

  const fC    = document.createElement('canvas');
  fC.width    = W; fC.height = H;
  const fCtx  = fC.getContext('2d');
  const fTex  = new THREE.CanvasTexture(fC);
  const fill  = new THREE.Sprite(new THREE.SpriteMaterial({ map: fTex, transparent: true, depthTest: false }));
  fill.scale.set(1.0, 0.08, 1);
  fill.position.y = 2.4;
  fill.visible    = false;

  function update(hp, maxHp) {
    const pct  = Math.max(0, Math.min(1, hp / maxHp));
    const show = pct < 1.0;
    bg.visible   = show;
    fill.visible = show;
    if (show) {
      fCtx.clearRect(0, 0, W, H);
      fCtx.fillStyle = hex;
      fCtx.fillRect(0, 0, Math.round(pct * W), H);
      fTex.needsUpdate = true;
    }
  }

  return { bg, fill, update };
}
