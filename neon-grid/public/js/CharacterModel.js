import { buildWeapon } from './WeaponBuilder.js';

export function buildCharacterModel(classColor, playerClass, username, level) {
  const group = new THREE.Group();
  const ec = classColor;

  // ── Materials ──────────────────────────────────────────────────────────────
  const suit  = () => new THREE.MeshStandardMaterial({ color: 0x0d0d22, emissive: ec, emissiveIntensity: 0.08, roughness: 0.75, metalness: 0.2 });
  const armor = () => new THREE.MeshStandardMaterial({ color: 0x111128, emissive: ec, emissiveIntensity: 0.60, roughness: 0.30, metalness: 0.75 });
  const glow  = () => new THREE.MeshBasicMaterial({ color: ec });
  const visor = () => new THREE.MeshStandardMaterial({ color: ec, emissive: ec, emissiveIntensity: 1.2, transparent: true, opacity: 0.92 });
  const dark  = () => new THREE.MeshStandardMaterial({ color: 0x080812, roughness: 0.9 });
  const boot  = () => new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.88 });

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

  // ── Body group — rotated for sprint lean ───────────────────────────────────
  const bodyGroup = grp(group);

  // ── Torso ──────────────────────────────────────────────────────────────────
  box(0.58, 0.52, 0.30, suit(),  bodyGroup, 0, 1.04, 0);
  box(0.44, 0.38, 0.08, armor(), bodyGroup, 0, 1.08, -0.19);   // chest plate (front = -Z)
  box(0.50, 0.24, 0.28, suit(),  bodyGroup, 0, 0.82, 0);        // lower chest
  box(0.18, 0.14, 0.26, armor(), bodyGroup, -0.44, 1.26, 0);    // L shoulder pad
  box(0.18, 0.14, 0.26, armor(), bodyGroup,  0.44, 1.26, 0);    // R shoulder pad
  box(0.56, 0.13, 0.30, armor(), bodyGroup, 0, 0.70, 0);        // belt
  box(0.20, 0.18, 0.20, suit(),  bodyGroup, 0, 1.34, 0);        // neck
  box(0.38, 0.030, 0.030, glow(), bodyGroup, 0, 1.06, -0.24);   // chest neon strip
  box(0.030, 0.44, 0.030, glow(), bodyGroup, 0, 1.02,  0.18);   // spine neon strip

  // ── Head ──────────────────────────────────────────────────────────────────
  const headGrp = grp(bodyGroup, 0, 1.56, 0);
  box(0.42, 0.46, 0.42, suit(),  headGrp);
  box(0.30, 0.11, 0.38, armor(), headGrp, 0,  0.30, 0);          // top ridge
  box(0.34, 0.20, 0.055, visor(), headGrp, 0,  0.04, -0.235);    // visor (-Z face = front)
  box(0.28, 0.13, 0.032, glow(),  headGrp, 0,  0.04, -0.255);    // visor inner glow
  box(0.055, 0.32, 0.22, armor(), headGrp, -0.25, 0, -0.10);     // L cheek guard
  box(0.055, 0.32, 0.22, armor(), headGrp,  0.25, 0, -0.10);     // R cheek guard
  box(0.30,  0.08, 0.09, armor(), headGrp, 0, -0.24, -0.18);     // chin guard

  // ── LEFT ARM ──────────────────────────────────────────────────────────────
  const lShoulder = grp(bodyGroup, -0.42, 1.24, 0);
  box(0.18, 0.38, 0.18, suit(),  lShoulder, 0, -0.19, 0);   // upper arm
  box(0.030, 0.32, 0.030, glow(), lShoulder, 0, -0.12, -0.10); // arm strip

  const lElbow = grp(lShoulder, 0, -0.38, 0);
  box(0.16, 0.30, 0.16, suit(), lElbow, 0, -0.15, 0);       // forearm
  box(0.14, 0.13, 0.11, dark(), lElbow, 0, -0.32, -0.02);   // hand

  // ── RIGHT ARM (weapon arm) ────────────────────────────────────────────────
  const rShoulder = grp(bodyGroup,  0.42, 1.24, 0);
  box(0.18, 0.38, 0.18, suit(),  rShoulder, 0, -0.19, 0);
  box(0.030, 0.32, 0.030, glow(), rShoulder, 0, -0.12, -0.10);

  const rElbow = grp(rShoulder, 0, -0.38, 0);
  box(0.16, 0.30, 0.16, suit(), rElbow, 0, -0.15, 0);
  box(0.14, 0.13, 0.11, dark(), rElbow, 0, -0.32, -0.02);

  // Weapon anchor at grip/hand position
  const weaponAnchor = grp(rElbow, 0.02, -0.34, 0);
  const weapon = buildWeapon(playerClass || 'SOLDIER');
  weapon.scale.setScalar(0.88);
  weapon.position.set(0.04, 0.08, -0.05);
  weaponAnchor.add(weapon);

  // Muzzle reference for VFX (world-space approximation)
  const muzzleRef = new THREE.Object3D();
  muzzleRef.position.set(0.04, 0.08, -0.62);
  weaponAnchor.add(muzzleRef);

  // ── HIPS (stays level — child of group, not bodyGroup) ────────────────────
  box(0.52, 0.22, 0.28, suit(), group, 0, 0.68, 0);

  // ── LEFT LEG ──────────────────────────────────────────────────────────────
  const lHip = grp(group, -0.16, 0.70, 0);
  box(0.22, 0.36, 0.22, suit(),  lHip, 0, -0.18, 0);        // upper leg
  box(0.22, 0.12, 0.07, armor(), lHip, 0, -0.34, -0.12);    // knee cap
  box(0.030, 0.30, 0.030, glow(), lHip, 0, -0.14, -0.12);   // thigh strip

  const lKnee = grp(lHip, 0, -0.36, 0);
  box(0.20, 0.32, 0.20, suit(),  lKnee, 0, -0.16, 0);       // lower leg
  box(0.22, 0.09, 0.34, boot(),  lKnee, 0, -0.35, -0.05);   // boot

  // ── RIGHT LEG ─────────────────────────────────────────────────────────────
  const rHip = grp(group,  0.16, 0.70, 0);
  box(0.22, 0.36, 0.22, suit(),  rHip, 0, -0.18, 0);
  box(0.22, 0.12, 0.07, armor(), rHip, 0, -0.34, -0.12);
  box(0.030, 0.30, 0.030, glow(), rHip, 0, -0.14, -0.12);

  const rKnee = grp(rHip, 0, -0.36, 0);
  box(0.20, 0.32, 0.20, suit(),  rKnee, 0, -0.16, 0);
  box(0.22, 0.09, 0.34, boot(),  rKnee, 0, -0.35, -0.05);

  // ── Name tag + HP bar ─────────────────────────────────────────────────────
  const nameSprite = _makeNameSprite(username || '???', ec, level || 1);
  nameSprite.position.y = 2.20;
  group.add(nameSprite);

  const hpBar = _makeHpBar(ec);
  hpBar.bg.position.y   = 2.48;
  hpBar.fill.position.y = 2.48;
  group.add(hpBar.bg);
  group.add(hpBar.fill);

  // ── Animation state ────────────────────────────────────────────────────────
  const anim = { walkPhase: 0, shootTimer: 0, breathPhase: 0, sprintLean: 0 };

  group.neon_dying      = false;
  group.neon_deathTimer = 0;
  group._muzzleRef      = muzzleRef;
  group.neon_setHp      = (hp, maxHp) => hpBar.update(hp, maxHp);

  group.neon_playDeath = () => { group.neon_dying = true; group.neon_deathTimer = 0; };

  group.neon_updateDeath = (dt) => {
    if (!group.neon_dying) return false;
    group.neon_deathTimer += dt;
    const t = group.neon_deathTimer;
    group.rotation.z = Math.min(1, t / 0.35) * Math.PI * 0.5;
    if (t > 0.35) {
      const fade = Math.max(0, 1 - (t - 0.35) / 0.65);
      group.traverse((c) => { if (c.material) { c.material.transparent = true; c.material.opacity = fade; } });
    }
    return t >= 1.0;
  };

  // ── Main animation driver — called every frame from Game.js ───────────────
  group.neon_animate = (dt, velocity, isShooting, isSprinting) => {
    const vel  = velocity || { x: 0, y: 0, z: 0 };
    const hspd = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const moving    = hspd > 0.5;
    const running   = hspd > 4.5;
    const sprinting = isSprinting || hspd > 6.5;

    // ── Walk phase ────────────────────────────────────────────────────────────
    const phaseRate = sprinting ? 16 : running ? 13 : 9;
    if (moving) {
      anim.walkPhase += dt * phaseRate;
    } else {
      const snap = Math.round(anim.walkPhase / Math.PI) * Math.PI;
      anim.walkPhase += (snap - anim.walkPhase) * Math.min(1, dt * 10);
    }

    anim.breathPhase += dt * 1.2;

    if (isShooting) anim.shootTimer = 0.35;
    else if (anim.shootTimer > 0) anim.shootTimer = Math.max(0, anim.shootTimer - dt);

    const leanTarget = sprinting ? 0.28 : 0;
    anim.sprintLean += (leanTarget - anim.sprintLean) * Math.min(1, dt * 10);

    // ── Legs ──────────────────────────────────────────────────────────────────
    const legSwing  = sprinting ? 0.88 : running ? 0.68 : moving ? 0.50 : 0;
    const kneeBend  = sprinting ? 0.82 : running ? 0.62 : moving ? 0.44 : 0;

    lHip.rotation.x  =  Math.sin(anim.walkPhase) * legSwing;
    rHip.rotation.x  = -Math.sin(anim.walkPhase) * legSwing;
    lKnee.rotation.x = Math.max(0, -Math.sin(anim.walkPhase - 0.3)) * kneeBend;
    rKnee.rotation.x = Math.max(0,  Math.sin(anim.walkPhase - 0.3)) * kneeBend;

    // ── Arms / weapon ─────────────────────────────────────────────────────────
    if (anim.shootTimer > 0) {
      // ── SHOOT POSE: weapon raised, both hands forward aiming ─────────────
      const recoil = Math.sin((1 - anim.shootTimer / 0.35) * Math.PI) * 0.28;

      rShoulder.rotation.x = -1.10 - recoil;   // right arm raises weapon high
      rShoulder.rotation.z = -0.10;
      rElbow.rotation.x    =  0.52;
      rElbow.rotation.z    =  0;

      lShoulder.rotation.x = -0.90;             // left arm supports from below
      lShoulder.rotation.z =  0.14;
      lElbow.rotation.x    =  0.80;
      lElbow.rotation.z    =  0;

    } else if (sprinting) {
      // ── SPRINT POSE: weapon tucked hard, arms pump aggressively ──────────
      const pump = Math.sin(anim.walkPhase) * 0.80;

      rShoulder.rotation.x =  pump - 0.22;
      rShoulder.rotation.z = -0.58;             // weapon swings inward/down
      rElbow.rotation.x    =  0.75;
      rElbow.rotation.z    =  0;

      lShoulder.rotation.x = -pump - 0.22;
      lShoulder.rotation.z =  0.32;
      lElbow.rotation.x    =  0.75;
      lElbow.rotation.z    =  0;

    } else if (running) {
      // ── RUN POSE: weapon ready, mild arm swing ────────────────────────────
      const swing = Math.sin(anim.walkPhase) * 0.28;

      rShoulder.rotation.x = swing - 0.62;
      rShoulder.rotation.z = -0.08;
      rElbow.rotation.x    =  0.50;
      rElbow.rotation.z    =  0;

      lShoulder.rotation.x = -swing - 0.40;
      lShoulder.rotation.z =  0;
      lElbow.rotation.x    =  0.38;
      lElbow.rotation.z    =  0;

    } else {
      // ── WALK / IDLE POSE: weapon low-ready ───────────────────────────────
      const swing = moving ? Math.sin(anim.walkPhase) * 0.18 : 0;

      rShoulder.rotation.x = swing - 0.58;
      rShoulder.rotation.z = -0.06;
      rElbow.rotation.x    =  0.44;
      rElbow.rotation.z    =  0;

      lShoulder.rotation.x = -swing - 0.28;
      lShoulder.rotation.z =  0;
      lElbow.rotation.x    =  0.30;
      lElbow.rotation.z    =  0;
    }

    // ── Sprint lean ───────────────────────────────────────────────────────────
    bodyGroup.rotation.x = anim.sprintLean;

    // ── Idle breathing ────────────────────────────────────────────────────────
    if (!moving) {
      bodyGroup.position.y = Math.sin(anim.breathPhase) * 0.014;
      headGrp.rotation.x   = Math.sin(anim.breathPhase * 0.6) * 0.018;
    } else {
      bodyGroup.position.y = 0;
      headGrp.rotation.x   = 0;
    }
  };

  return group;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeNameSprite(username, classColor, level) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  const hex = '#' + classColor.toString(16).padStart(6, '0');

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = hex;
  ctx.fillRect(6, 18, 26, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), 19, 31);

  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = hex;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 10;
  ctx.fillText(username.slice(0, 14), 40, 32);

  const tex    = new THREE.CanvasTexture(c);
  const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.9, 0.48, 1);
  return sprite;
}

function _makeHpBar(classColor) {
  const W = 128, H = 12;
  const hex = '#' + classColor.toString(16).padStart(6, '0');

  const bgC = document.createElement('canvas');
  bgC.width = W; bgC.height = H;
  const bgCtx = bgC.getContext('2d');
  bgCtx.fillStyle = 'rgba(0,0,0,0.75)';
  bgCtx.fillRect(0, 0, W, H);
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(bgC), transparent: true, depthTest: false,
  }));
  bg.scale.set(1.1, 0.09, 1);
  bg.visible = false;

  const fC   = document.createElement('canvas');
  fC.width   = W; fC.height = H;
  const fCtx = fC.getContext('2d');
  const fTex = new THREE.CanvasTexture(fC);
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({ map: fTex, transparent: true, depthTest: false }));
  fill.scale.set(1.1, 0.09, 1);
  fill.visible = false;

  function update(hp, maxHp) {
    const pct  = Math.max(0, Math.min(1, hp / maxHp));
    const show = pct < 1.0;
    bg.visible = fill.visible = show;
    if (show) {
      fCtx.clearRect(0, 0, W, H);
      fCtx.fillStyle = hex;
      fCtx.fillRect(0, 0, Math.round(pct * W), H);
      fTex.needsUpdate = true;
    }
  }

  return { bg, fill, update };
}
