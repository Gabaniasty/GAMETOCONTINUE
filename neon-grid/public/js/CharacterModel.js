import { buildWeapon } from './WeaponBuilder.js';

export function buildCharacterModel(classColor, playerClass, username, level) {
  const group = new THREE.Group();

  const bodyMat = () => new THREE.MeshStandardMaterial({
    color: 0x0d0d22,
    emissive: classColor,
    emissiveIntensity: 0.15,
  });
  const ec = classColor;
  const edgeMat = () => new THREE.LineBasicMaterial({ color: ec, transparent: true, opacity: 0.3 });

  function addPart(geo, x, y, z, override) {
    const mesh = new THREE.Mesh(geo, override || bodyMat());
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat());
    el.position.set(x, y, z);
    group.add(el);
    return mesh;
  }

  // ── Head ────────────────────────────────────────────────────────
  const headGeo = new THREE.BoxGeometry(0.52, 0.52, 0.52);
  const headMesh = addPart(headGeo, 0, 1.55, 0);

  // Visor
  const visorMat = new THREE.MeshBasicMaterial({
    color: ec, transparent: true, opacity: 0.7,
  });
  const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), visorMat);
  visor.position.set(0, 1.58, 0.27);
  group.add(visor);

  // ── Neck ────────────────────────────────────────────────────────
  addPart(new THREE.BoxGeometry(0.18, 0.14, 0.18), 0, 1.23, 0);

  // ── Torso ───────────────────────────────────────────────────────
  const torso = addPart(new THREE.BoxGeometry(0.72, 0.78, 0.36), 0, 0.88, 0);

  // Chest plate
  const chestMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, emissive: ec, emissiveIntensity: 0.5 });
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.04), chestMat);
  chest.position.set(0, 0.95, 0.19);
  group.add(chest);

  // ── Arms (separate upper/lower) ─────────────────────────────────
  const lUpperArm = addPart(new THREE.BoxGeometry(0.2, 0.32, 0.2), -0.46, 1.04, 0);
  const lLowerArm = addPart(new THREE.BoxGeometry(0.17, 0.28, 0.17), -0.46, 0.72, 0);
  addPart(new THREE.BoxGeometry(0.16, 0.14, 0.14), -0.46, 0.52, 0);

  const rUpperArm = addPart(new THREE.BoxGeometry(0.2, 0.32, 0.2),  0.46, 1.04, 0);
  const rLowerArm = addPart(new THREE.BoxGeometry(0.17, 0.28, 0.17), 0.46, 0.72, 0);
  addPart(new THREE.BoxGeometry(0.16, 0.14, 0.14),  0.46, 0.52, 0);

  // ── Aim pose for right arm ───────────────────────────────────────
  rUpperArm.rotation.x = -0.7;
  rLowerArm.rotation.x = -0.4;

  // ── Legs ────────────────────────────────────────────────────────
  addPart(new THREE.BoxGeometry(0.26, 0.36, 0.26), -0.2,  0.36, 0);
  addPart(new THREE.BoxGeometry(0.22, 0.34, 0.22), -0.2,  0.0,  0);
  addPart(new THREE.BoxGeometry(0.24, 0.1,  0.32), -0.2, -0.19, 0.04);
  addPart(new THREE.BoxGeometry(0.26, 0.36, 0.26),  0.2,  0.36, 0);
  addPart(new THREE.BoxGeometry(0.22, 0.34, 0.22),  0.2,  0.0,  0);
  addPart(new THREE.BoxGeometry(0.24, 0.1,  0.32),  0.2, -0.19, 0.04);

  // ── Class weapon held in right hand ─────────────────────────────
  const weapon = buildWeapon(playerClass || 'SOLDIER');
  weapon.scale.setScalar(0.75);
  weapon.position.set(0.08, -0.18, -0.22);
  weapon.rotation.x = -0.15;
  // Anchor to right hand area
  const weaponAnchor = new THREE.Group();
  weaponAnchor.position.set(0.46, 0.52, 0);
  weaponAnchor.add(weapon);
  group.add(weaponAnchor);

  // ── Username label sprite ────────────────────────────────────────
  const nameSprite = _makeNameSprite(username || '???', ec, level || 1);
  group.add(nameSprite);

  // ── HP bar (two canvas sprites) ─────────────────────────────────
  const hpBar = _makeHpBar(ec);
  group.add(hpBar.bg);
  group.add(hpBar.fill);

  // ── Public methods on the group ─────────────────────────────────
  group.neon_dying = false;
  group.neon_deathTimer = 0;

  group.neon_setHp = function (hp, maxHp) {
    hpBar.update(hp, maxHp);
  };

  group.neon_playDeath = function () {
    group.neon_dying = true;
    group.neon_deathTimer = 0;
  };

  group.neon_updateDeath = function (dt) {
    if (!group.neon_dying) return false;
    group.neon_deathTimer += dt;
    const t = group.neon_deathTimer;

    // Fall over on Z axis over 400ms
    group.rotation.z = Math.min(1, t / 0.4) * Math.PI * 0.5;

    // Fade opacity from 400ms → 1000ms
    if (t > 0.4) {
      const fade = Math.max(0, 1 - (t - 0.4) / 0.6);
      group.traverse((child) => {
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity = fade;
        }
      });
    }

    return t >= 1.0;
  };

  return group;
}

// ── Helpers ────────────────────────────────────────────────────────────

function _makeNameSprite(username, classColor, level) {
  const c   = document.createElement('canvas');
  c.width   = 256; c.height = 64;
  const ctx = c.getContext('2d');
  const hex = '#' + classColor.toString(16).padStart(6, '0');

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 256, 64);

  // Level badge
  ctx.fillStyle = hex;
  ctx.fillRect(6, 18, 26, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), 19, 31);

  // Username
  ctx.font = 'bold 23px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = hex;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 8;
  ctx.fillText(username.slice(0, 14), 40, 32);

  const tex    = new THREE.CanvasTexture(c);
  const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = 2.2;
  return sprite;
}

function _makeHpBar(classColor) {
  const W = 128, H = 12;
  const hex = '#' + classColor.toString(16).padStart(6, '0');

  // Background
  const bgC = document.createElement('canvas');
  bgC.width = W; bgC.height = H;
  const bgCtx = bgC.getContext('2d');
  bgCtx.fillStyle = 'rgba(0,0,0,0.7)';
  bgCtx.fillRect(0, 0, W, H);
  const bgTex = new THREE.CanvasTexture(bgC);
  const bgMat = new THREE.SpriteMaterial({ map: bgTex, transparent: true, depthTest: false });
  const bg    = new THREE.Sprite(bgMat);
  bg.scale.set(1.0, 0.08, 1);
  bg.position.y = 2.5;
  bg.visible = false;

  // Fill
  const fC = document.createElement('canvas');
  fC.width = W; fC.height = H;
  const fCtx = fC.getContext('2d');
  const fTex = new THREE.CanvasTexture(fC);
  const fMat = new THREE.SpriteMaterial({ map: fTex, transparent: true, depthTest: false });
  const fill = new THREE.Sprite(fMat);
  fill.scale.set(1.0, 0.08, 1);
  fill.position.y = 2.5;
  fill.visible = false;

  function update(hp, maxHp) {
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    const show = pct < 1.0;
    bg.visible = show;
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
